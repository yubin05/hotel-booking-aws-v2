// E-06 결과 정리: k6가 남긴 시도별 기록(booking_wait의 key·attempt·status 태그)과 Docker 장애 기록(-fault.txt, load/e06-graceful-stop.sh가 남김)을
// 같은 시계로 맞춰 docs/07의 기준을 판정하고 표 숫자를 출력한다. 시도·키 대조는 scripts/e05-report.mjs와 같다
// 실행: node scripts/e06-report.mjs load/results/e06-graceful-stop-<시각> [<더 볼 실행>...]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pct, readK6 } from './k6-lib.mjs';

const GENERIC = /^실패 5\d\d (서버 오류가 발생했습니다\.|지금은 처리할 수 없습니다\. 잠시 후 다시 시도해주세요\.)$/;
const ANSWERED = ['200', '201']; // 예약이 있다는 답 (201 새로 만듦, 200 이미 처리된 요청)
const DONE = [...ANSWERED, '409']; // 사용자가 답을 받음 (409 날짜 겹침도 정상 거절)
// 앱에 닿지 않은 응답 없음: 연결을 맺지 못함(dial: 연결 거부 등)·컨테이너가 없어 주소를 못 찾음(lookup).
// 이 밖의 응답 없음(read: connection reset, EOF 등)은 앱에 닿은 요청이 처리 중에 끊긴 것이다 (E-05 기록의 메시지)
const NOT_REACHED = /^실패 0 (dial|lookup): /;

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
    // '시각 서비스 사건 signal=.. exitCode=..' (사건에 공백이 들어갈 수 있다: exec_create: mysql ...)
    events: sec.events.map((l) => {
      const [, ns, service, action, signal, exitCode] = /^(\d+) (\S*) (.*) signal=(\S*) exitCode=(\S*)$/.exec(l);
      return { time: Number(ns) / 1e6, service, action, signal, exitCode };
    }),
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

  // 순서: DB 멈춤 → 종료 신호(SIGTERM) → DB 풀기 → 앱 종료(die) → 새 버전 시작 → 'listening on'
  const inLoad = fault.events.filter((e) => e.time >= t0 && e.time <= tEnd);
  const find = (service, action, after = t0, signal) => inLoad.find((e) => e.service === service && e.action === action && e.time > after && (!signal || e.signal === signal));
  const pause = find('db', 'pause')?.time;
  const term = find('app', 'kill', t0, '15')?.time;
  const unpause = find('db', 'unpause', pause ?? t0)?.time;
  assert.ok(pause && term && unpause && pause < term && term < unpause, `${base}: DB 멈춤 중에 종료 신호가 가지 않았다 (DRY 실행이거나 순서가 어긋남)`);
  const die = find('app', 'die', term);
  assert.ok(die, `${base}: 종료 신호 뒤 앱 종료 기록이 없다`);
  const sigkill = find('app', 'kill', term, '9'); // 기다리는 시간이 다 돼 강제 종료됨
  const started = find('app', 'start', die.time)?.time;
  const ready = fault.listening.find((t) => t > die.time);
  assert.ok(started && ready && ready < tEnd, `${base}: 부하가 끝나기 전에 새 버전이 받지 않았다`);
  const appDied = inLoad.filter((e) => e.service === 'app' && e.action === 'die').length;
  const dbDied = inLoad.filter((e) => e.service === 'db' && e.action === 'die').length;

  const failedTries = tries.filter((t) => t.status === '0' || Number(t.status) >= 500);
  const count = (list, f) => list.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
  const show = (m) => Object.entries(m).map(([k, v]) => `${k === '0' ? '응답 없음' : k} ${v}`).join(' · ') || '없음';
  const messages = count((points.checks ?? []).filter((p) => p.tags.check.startsWith('실패 ')), (p) => p.tags.check);
  assert.equal(Object.values(messages).reduce((a, b) => a + b, 0), failedTries.length, `${base}: 실패 메시지 수 ≠ 실패 시도 수`);
  const leaked = Object.keys(messages).filter((m) => !m.startsWith('실패 0 ') && !GENERIC.test(m));
  const cut = Object.entries(messages).filter(([m]) => m.startsWith('실패 0 ') && !NOT_REACHED.test(m));
  const cutCount = cut.reduce((a, [, n]) => a + n, 0);

  const inFlight = tries.filter((t) => t.start < term && t.end > term); // 종료 신호 순간 처리 중이던 시도
  const oldServed = tries.filter((t) => DONE.includes(t.status) && t.end < die.time); // 옛 버전이 답한 시도
  const lastOld = Math.max(...oldServed.map((t) => t.end));
  const afterTerm = tries.filter((t) => t.start >= term && t.start < ready); // 종료 신호 뒤, 새 버전이 받기 전에 보낸 시도
  const outage = tries.filter((t) => t.end > term && t.start < ready && !inFlight.includes(t)); // 앱이 받지 않던 때에 걸친 시도
  // 평소 = DB 멈춤 전에 끝난 시도 (새 버전이 뜬 직후는 k6의 DNS 대기가 섞인다: E-05 로컬 한계)
  const normal = tries.filter((t) => t.end < pause);

  // 처리 불가 구간: 예약이 있다는 답(201·200)이 하나도 나오지 않은 가장 긴 구간
  const okEnds = tries.filter((t) => ANSWERED.includes(t.status)).map((t) => t.end).sort((a, b) => a - b);
  let gap = [t0, okEnds[0] ?? tEnd];
  for (let i = 1; i < okEnds.length; i++) if (okEnds[i] - okEnds[i - 1] > gap[1] - gap[0]) gap = [okEnds[i - 1], okEnds[i]];
  const firstOk = okEnds.find((t) => t >= ready);
  const firstHealth = health.map((r) => r.end).filter((t) => t >= ready).sort((a, b) => a - b)[0];

  // 키 단위 대조 (E-05와 같음). 중복: DB에서 키 하나에 예약 2건 이상. 번호 다름: 사용자가 받은 예약 번호가 DB의 그 키 예약과 다름 (유실 포함).
  // 모르는 예약: DB에 있는데 사용자의 마지막 답이 201·200이 아님
  const prefix = keys[0].key.replace(/\d+$/, '');
  const dbRows = fault.keys.filter(([k]) => k.startsWith(prefix));
  const db = new Map(dbRows);
  assert.ok(dbRows.every(([k]) => byKey.has(k)), `${base}: DB 예약 키 중 k6 요청에 없는 키가 있다`);
  const dup = dbRows.length - db.size;
  const mismatched = keys.filter((k) => ANSWERED.includes(k.final) && db.get(k.key) !== k.booking);
  const ghosts = keys.filter((k) => !ANSWERED.includes(k.final) && db.has(k.key));
  const unresolved = keys.filter((k) => !DONE.includes(k.final));
  const retried = keys.filter((k) => k.tries.length > 1);
  const total = (k) => k.tries.at(-1).end - k.tries[0].start; // 첫 시도 → 마지막 답 (다시 누르기 전 1초 포함)
  const waits = (list) => list.map((t) => t.wait);
  const fiveXX = failedTries.filter((t) => t.status !== '0').length;

  const mark = (pass) => (pass ? '✅' : '❌');
  console.log(`\n## ${base.split('/').pop()}`);
  console.log(`순서: ${rel(pause)} DB 멈춤 → ${rel(term)} 종료 신호 → ${rel(unpause)} DB 풀기 → ${rel(die.time)} 앱 종료(코드 ${die.exitCode}) → ${rel(started)} 새 버전 시작 → ${rel(ready)} 받기 시작   부하: 0 → ${rel(tEnd)}`);
  console.log(`종료 신호 → 앱 종료 ${s(die.time - term)} (그중 DB 풀기 → 앱 종료 ${s(die.time - unpause)}, 옛 버전의 마지막 답 → 앱 종료 ${s(die.time - lastOld)})`);
  console.log(`예약 못 받는 시간 (종료 신호 → 새 버전이 받기 시작): ${s(ready - term)}`);
  console.log(`처리 불가 구간 (201·200이 끊긴 가장 긴 구간): ${rel(gap[0])} → ${rel(gap[1])} (${s(gap[1] - gap[0])})`);
  console.log(`예약 버튼 ${keys.length}번 (시도 ${tries.length}건, 다시 누르기로 +${tries.length - keys.length}건 = +${(((tries.length - keys.length) / keys.length) * 100).toFixed(1)}%). 첫 시도: ${show(count(keys, (k) => k.tries[0].status))}`);
  console.log(`종료 신호 순간 처리 중이던 시도 ${inFlight.length}건: ${show(count(inFlight, (t) => t.status))} / 기다린 시간 최대 ${ms(Math.max(0, ...waits(inFlight)))}`);
  console.log(`종료 신호 뒤 새 버전이 받기 전에 보낸 시도 ${afterTerm.length}건: ${show(count(afterTerm, (t) => t.status))} (옛 버전이 답한 것 ${afterTerm.filter((t) => oldServed.includes(t)).length}건)`);
  if (failedTries.length) console.log(`실패 시도 ${failedTries.length}건 (5xx ${fiveXX}건): 보낸 때 ${rel(Math.min(...failedTries.map((t) => t.start)))} → 마지막 실패 답 ${rel(Math.max(...failedTries.map((t) => t.end)))}`);
  for (const [m, n] of Object.entries(messages)) console.log(`  ${m} × ${n}`);
  console.log(`새 버전이 받기 시작한 뒤 보낸 시도 ${tries.filter((t) => t.start >= ready).length}건 중 실패 ${tries.filter((t) => t.start >= ready && failedTries.includes(t)).length}건`);
  console.log(`다시 보낸 키 ${retried.length}개 → 마지막 답: ${show(count(retried, (k) => k.final))} / 시도 최대 ${Math.max(0, ...retried.map((k) => k.tries.length))}번`);
  if (retried.length) console.log(`다시 보낸 키가 답을 받기까지 (첫 시도 → 마지막 답): p95 ${ms(pct(retried.map(total), 0.95))} · 최대 ${ms(Math.max(...retried.map(total)))}`);
  console.log(`시도 하나에서 기다린 시간: 평소(DB 멈춤 전) p95 ${ms(pct(waits(normal), 0.95))} · 최대 ${ms(Math.max(...waits(normal)))} / 앱이 받지 않던 때에 걸친 시도 ${outage.length}건 최대 ${ms(Math.max(0, ...waits(outage)))}`);
  console.log(`새 버전 받기 시작 → 첫 예약 답 ${firstOk ? ms(firstOk - ready) : '없음'} · 헬스 체크 200 ${firstHealth ? ms(firstHealth - ready) : '없음'}`);
  console.log(`기준:`);
  console.log(`  ${mark(die.exitCode === '0' && !sigkill)} 정상 종료: 종료 코드 ${die.exitCode} (0 정상, 137 강제 종료), 강제 종료 신호 ${sigkill ? '있음' : '없음'}, 종료 신호 → 종료 ${s(die.time - term)}`);
  console.log(`  ${mark(inFlight.length > 0 && inFlight.every((t) => DONE.includes(t.status)))} 종료 신호 순간 처리 중이던 예약 ${inFlight.length}건 모두 답 (201·200·409, 1건 이상이어야 판정)`);
  console.log(`  ${mark(cutCount === 0)} 앱에 닿은 뒤 끊긴 요청 ${cutCount}건 (응답 없음 중 연결 거부·주소 못 찾음이 아닌 것)`);
  console.log(`  ${mark(dup === 0)} 중복 ${dup}건 (DB 예약 ${dbRows.length}건, 키 하나당 1건 이하)`);
  console.log(`  ${mark(mismatched.length === 0)} 사용자가 받은 예약 번호 ≠ DB ${mismatched.length}건 (201·200으로 끝난 키 ${keys.filter((k) => ANSWERED.includes(k.final)).length}개를 DB와 대조, 유실 포함)`);
  console.log(`  ${mark(ghosts.length === 0)} 다시 보낸 뒤에도 실패로 끝났는데 DB에 있는 예약 ${ghosts.length}건`);
  console.log(`  ${mark(unresolved.length === 0)} 끝내 답을 못 받은 키 ${unresolved.length}개`);
  console.log(`  ${mark(leaked.length === 0)} 내부 오류 메시지 ${leaked.length}종`);
  console.log(`  ${mark(appDied === 1 && dbDied === 0)} 앱 종료 ${appDied}회 (넣은 정상 종료 1회만), DB 종료 ${dbDied}회`);
}
