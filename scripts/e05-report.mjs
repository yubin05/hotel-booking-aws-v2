// E-05 결과 정리: k6가 남긴 시도별 기록(booking_wait의 key·attempt·status 태그)과 Docker 장애 기록(-fault.txt, load/e05-app-kill.sh가 남김)을
// 같은 시계로 맞춰 docs/07의 기준을 판정하고 표 숫자를 출력한다
// 실행: node scripts/e05-report.mjs load/results/e05-app-kill-<시각> [<더 볼 실행>...]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pct, readK6 } from './k6-lib.mjs';

const GENERIC = /^실패 5\d\d (서버 오류가 발생했습니다\.|지금은 처리할 수 없습니다\. 잠시 후 다시 시도해주세요\.)$/;
const ANSWERED = ['200', '201']; // 예약이 있다는 답 (201 새로 만듦, 200 이미 처리된 요청)

const s = (ms) => `${(ms / 1000).toFixed(1)}초`;
const ms = (v) => (v < 1000 ? `${Math.round(v)}ms` : s(v));
// Docker 로그 시각은 소수점 9자리라 ms까지만 읽는다
const time = (iso) => Date.parse(iso.replace(/(\.\d{3})\d*/, '$1'));

function readFault(file) {
  const sec = { events: [], app: [], keys: [] };
  let cur = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const head = /^# (events|app|keys)$/.exec(line);
    if (head) cur = sec[head[1]];
    else if (cur && line) cur.push(line);
  }
  return {
    events: sec.events.map((l) => ({ time: Number(l.split(' ')[0]) / 1e6, action: l.split(' ').slice(1).join(' ') })),
    listening: sec.app.filter((l) => / listening on \d+/.test(l)).map((l) => time(l.split(' ')[0])), // 앱이 요청을 받기 시작함
    keys: sec.keys.map((l) => l.split('\t')), // [멱등키, 예약 번호]
  };
}

for (const arg of process.argv.slice(2)) {
  const base = arg.replace(/\.json\.gz$/, '');
  const { requests, points } = await readK6(`${base}.json.gz`);
  const fault = readFault(`${base}-fault.txt`);
  // 시도 하나 = booking_wait 기록 하나 (값 = 보낸 순간 → 답, 기록 시각 = 답을 받은 때)
  const tries = (points.booking_wait ?? []).map((p) => ({ ...p.tags, end: p.time, start: p.time - p.value, wait: p.value }));
  const answers = points.booking_answer ?? []; // 키마다 하나: 마지막 답의 예약 번호
  const health = requests.filter((r) => r.scenario === 'health' && r.status === '200'); // 실패한 헬스 체크는 시각이 0이라 성공만 쓴다
  const iterations = (points.iterations ?? []).filter((p) => p.tags.scenario === 'bookings').length;
  // 키 수 = k6 반복 수, 키마다 시도 번호가 1..n으로 빠짐없이 있어야 한다
  assert.equal(answers.length, iterations, `${base}: 답을 남긴 키 수 ≠ k6 반복 수`);
  assert.ok(!points.dropped_iterations, `${base}: VU가 모자라 못 보낸 예약이 있다`);
  const byKey = new Map(answers.map((a) => [a.tags.key, { ...a.tags, tries: [] }]));
  for (const t of tries) {
    assert.ok(byKey.has(t.key), `${base}: 답을 남기지 않은 키의 시도가 있다 (부하 끝에 잘린 반복)`);
    byKey.get(t.key).tries.push(t);
  }
  const keys = [...byKey.values()];
  for (const k of keys) {
    k.tries.sort((a, b) => a.attempt - b.attempt);
    assert.deepEqual(k.tries.map((t) => Number(t.attempt)), Array.from({ length: Number(k.attempts) }, (_, i) => i + 1), `${base}: ${k.key} 시도 기록이 빠졌다`);
    k.final = k.tries.at(-1).status;
  }
  const t0 = Math.min(...tries.map((t) => t.start));
  const tEnd = Math.max(...tries.map((t) => t.end));
  const rel = (t) => s(t - t0);

  // 앱 중단: 강제 종료(kill) → 다시 띄운 앱이 'listening on'을 찍은 때
  const inLoad = fault.events.filter((e) => e.time >= t0 && e.time <= tEnd);
  const kill = inLoad.find((e) => e.action.startsWith('kill'))?.time;
  assert.ok(kill, `${base}: 부하 중 앱 강제 종료 기록이 없다 (DRY 실행이거나 부하 밖에서 일어남)`);
  const started = inLoad.find((e) => e.action === 'start' && e.time > kill)?.time;
  const ready = fault.listening.find((t) => t > kill);
  assert.ok(started && ready && ready < tEnd, `${base}: 부하가 끝나기 전에 앱이 다시 받지 않았다`);
  const died = inLoad.filter((e) => e.action === 'die').length;

  const failedTries = tries.filter((t) => t.status === '0' || Number(t.status) >= 500);
  const count = (list, f) => list.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
  const show = (m) => Object.entries(m).map(([k, v]) => `${k === '0' ? '응답 없음' : k} ${v}`).join(' · ') || '없음';
  const messages = count((points.checks ?? []).filter((p) => p.tags.check.startsWith('실패 ')), (p) => p.tags.check);
  assert.equal(Object.values(messages).reduce((a, b) => a + b, 0), failedTries.length, `${base}: 실패 메시지 수 ≠ 실패 시도 수`);
  const leaked = Object.keys(messages).filter((m) => !m.startsWith('실패 0 ') && !GENERIC.test(m));
  const inFlight = tries.filter((t) => t.start < kill && t.end > kill);
  const outage = tries.filter((t) => t.end > kill && t.start < ready); // 앱이 없던 때에 걸친 시도
  const normal = tries.filter((t) => !outage.includes(t));
  const afterReady = tries.filter((t) => t.start >= ready);

  // 처리 불가 구간: 예약이 있다는 답(201·200)이 하나도 나오지 않은 가장 긴 구간
  const okEnds = tries.filter((t) => ANSWERED.includes(t.status)).map((t) => t.end).sort((a, b) => a - b);
  let gap = [t0, okEnds[0] ?? tEnd];
  for (let i = 1; i < okEnds.length; i++) if (okEnds[i] - okEnds[i - 1] > gap[1] - gap[0]) gap = [okEnds[i - 1], okEnds[i]];
  const firstOk = okEnds.find((t) => t >= ready);
  const firstHealth = health.map((r) => r.end).filter((t) => t >= ready).sort((a, b) => a - b)[0];

  // 키 단위 대조. 중복: DB에서 키 하나에 예약 2건 이상. 번호 다름: 사용자가 받은 예약 번호가 DB의 그 키 예약과 다름 (유실 포함).
  // 응답 못 받은 예약: DB에 있는데 사용자의 마지막 답이 201·200이 아님 (다시 눌러도 모르는 예약)
  const prefix = keys[0].key.replace(/\d+$/, '');
  const dbRows = fault.keys.filter(([k]) => k.startsWith(prefix));
  const db = new Map(dbRows);
  assert.ok(dbRows.every(([k]) => byKey.has(k)), `${base}: DB 예약 키 중 k6 요청에 없는 키가 있다`);
  const dup = dbRows.length - db.size;
  const mismatched = keys.filter((k) => ANSWERED.includes(k.final) && db.get(k.key) !== k.booking);
  const ghosts = keys.filter((k) => !ANSWERED.includes(k.final) && db.has(k.key));
  const unresolved = keys.filter((k) => ![...ANSWERED, '409'].includes(k.final));
  const retried = keys.filter((k) => k.tries.length > 1);
  const total = (k) => k.tries.at(-1).end - k.tries[0].start; // 첫 시도 → 마지막 답 (다시 누르기 전 1초 포함)
  const waits = (list) => list.map((t) => t.wait);

  const mark = (pass) => (pass ? '✅' : '❌');
  console.log(`\n## ${base.split('/').pop()}`);
  console.log(`앱 중단: ${rel(kill)} 강제 종료 → ${rel(started)} 시작 → ${rel(ready)} 받기 시작 (${s(ready - kill)}, Docker 기록)   부하: 0 → ${rel(tEnd)}`);
  console.log(`처리 불가 구간 (201·200이 끊긴 가장 긴 구간): ${rel(gap[0])} → ${rel(gap[1])} (${s(gap[1] - gap[0])})`);
  console.log(`예약 버튼 ${keys.length}번 (시도 ${tries.length}건). 첫 시도: ${show(count(keys, (k) => k.tries[0].status))}`);
  console.log(`종료 순간 처리 중이던 시도 ${inFlight.length}건: ${show(count(inFlight, (t) => t.status))}`);
  if (failedTries.length) console.log(`실패 시도 ${failedTries.length}건: 보낸 때 ${rel(Math.min(...failedTries.map((t) => t.start)))} → 마지막 실패 답 ${rel(Math.max(...failedTries.map((t) => t.end)))}`);
  for (const [m, n] of Object.entries(messages)) console.log(`  ${m} × ${n}`);
  console.log(`앱이 받기 시작한 뒤 보낸 시도 ${afterReady.length}건 중 실패 ${afterReady.filter((t) => failedTries.includes(t)).length}건`);
  console.log(`다시 보낸 키 ${retried.length}개 → 마지막 답: ${show(count(retried, (k) => k.final))} / 시도 최대 ${Math.max(0, ...retried.map((k) => k.tries.length))}번`);
  if (retried.length) console.log(`다시 보낸 키가 답을 받기까지 (첫 시도 → 마지막 답): p95 ${ms(pct(retried.map(total), 0.95))} · 최대 ${ms(Math.max(...retried.map(total)))}`);
  console.log(`시도 하나에서 기다린 시간: 앱이 있을 때 p95 ${ms(pct(waits(normal), 0.95))} · 최대 ${ms(Math.max(...waits(normal)))} / 앱이 없던 때에 걸친 시도 ${outage.length}건 최대 ${ms(Math.max(0, ...waits(outage)))}`);
  console.log(`앱 받기 시작 → 첫 예약 답 ${firstOk ? ms(firstOk - ready) : '없음'} · 헬스 체크 200 ${firstHealth ? ms(firstHealth - ready) : '없음'}`);
  console.log(`기준:`);
  console.log(`  ${mark(dup === 0)} 중복 ${dup}건 (DB 예약 ${dbRows.length}건, 키 하나당 1건 이하)`);
  console.log(`  ${mark(mismatched.length === 0)} 사용자가 받은 예약 번호 ≠ DB ${mismatched.length}건 (201·200으로 끝난 키 ${keys.filter((k) => ANSWERED.includes(k.final)).length}개를 DB와 대조, 유실 포함)`);
  console.log(`  ${mark(ghosts.length === 0)} 다시 보낸 뒤에도 실패로 끝났는데 DB에 있는 예약 ${ghosts.length}건`);
  console.log(`  ${mark(unresolved.length === 0)} 끝내 답을 못 받은 키 ${unresolved.length}개`);
  console.log(`  ${mark(leaked.length === 0)} 내부 오류 메시지 ${leaked.length}종 (응답 없음은 앱이 죽은 동안이라 허용)`);
  console.log(`  ${mark(died === 1)} 앱 종료 ${died}회 (넣은 강제 종료 1회만)`);
  console.log(`참고: 200 '이미 처리된 요청입니다.'로 끝난 키 ${keys.filter((k) => k.final === '200').length}개 = 앞 시도가 저장됐는데 응답이 끊겨 다시 보낸 예약`);
}
