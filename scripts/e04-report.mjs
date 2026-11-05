// E-04 결과 정리: k6 요청별 기록과 Docker 장애 기록(-fault.txt, load/e04-db-outage.sh가 남김)을 같은 시계로 맞춰
// docs/07의 기준을 판정하고 표 숫자를 출력한다
// 실행: node scripts/e04-report.mjs load/results/e04-db-outage-<모드>-<시각> [<더 볼 실행>...]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pct, readK6 } from './k6-lib.mjs';

const GRACE = 2000; // DB가 준비된 뒤 이 시간이 지나서 시작한 예약은 실패하면 안 된다 (끊긴 연결이 풀에 남는지)
const MAX_WAIT = 5000; // 사용자가 기다린 시간 상한 (멈춘 동안 오래 매달리지 않음)
// 5xx는 앱이 정한 사용자 문구만 (내부 오류 메시지 노출 0). 503은 TS-09에서 넣은 DB 시간 초과 응답
const GENERIC = /^실패 5\d\d (서버 오류가 발생했습니다\.|지금은 처리할 수 없습니다\. 잠시 후 다시 시도해주세요\.)$/;

const s = (ms) => `${(ms / 1000).toFixed(1)}초`;
const ms = (v) => (v < 1000 ? `${Math.round(v)}ms` : s(v));

function readFault(file) {
  const sec = { events: [], mysql: [], keys: [] };
  let cur = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const head = /^# (events|mysql|keys)$/.exec(line);
    if (head) cur = sec[head[1]];
    else if (cur && line) cur.push(line);
  }
  const events = sec.events.map((l) => {
    const [ns, service, ...action] = l.split(' ');
    return { time: Number(ns) / 1e6, service, action: action.join(' ') };
  });
  // MySQL 로그의 시각 (로그의 시각도 Docker 쪽 시계)
  const logTimes = (re) => sec.mysql.flatMap((l) => (re.test(l) ? [Date.parse(l.split(' ')[0])] : []));
  return {
    events,
    ready: logTimes(/ready for connections.*port: 3306\b/), // 연결을 받기 시작함
    shutdown: logTimes(/mysqld: Shutdown complete/), // 정상 종료를 마침 (없으면 강제 종료)
    keys: new Set(sec.keys),
  };
}

for (const arg of process.argv.slice(2)) {
  const base = arg.replace(/\.json\.gz$/, '');
  const { requests, points } = await readK6(`${base}.json.gz`);
  const fault = readFault(`${base}-fault.txt`);
  const bookings = requests.filter((r) => r.scenario === 'bookings');
  const health = requests.filter((r) => r.scenario === 'health');
  // k6가 센 반복 수와 같아야 한다 (같은 ns에 끝나 합쳐진 요청 없음). VU가 모자라 못 보낸 요청이 있으면 같은 조건이 아니다
  const iterations = (sc) => (points.iterations ?? []).filter((p) => p.tags.scenario === sc).length;
  assert.equal(bookings.length, iterations('bookings'), `${base}: 예약 요청 수 ≠ k6 반복 수`);
  assert.equal(health.length, iterations('health'), `${base}: 헬스 체크 수 ≠ k6 반복 수`);
  assert.ok(bookings.length >= 600 && !points.dropped_iterations, `${base}: 못 보낸 예약이 있다 (초당 10건 × 60초)`);
  const t0 = Math.min(...requests.map((r) => r.start)); // 부하 시작
  const tEnd = Math.max(...requests.map((r) => r.end));
  const rel = (t) => s(t - t0);

  // DB 장애 시각: 멈춤은 pause → unpause, 재시작은 kill(종료 신호) → MySQL 'ready for connections'
  const inLoad = fault.events.filter((e) => e.time >= t0 && e.time <= tEnd);
  const downEv = inLoad.find((e) => e.service === 'db' && ['kill', 'die', 'pause'].includes(e.action));
  assert.ok(downEv, `${base}: 부하 중 DB 장애 기록이 없다 (DRY 실행이거나 장애가 부하 밖에서 일어남)`);
  const mode = downEv.action === 'pause' ? 'pause' : 'restart';
  const down = downEv.time;
  const ready = mode === 'pause' ? inLoad.find((e) => e.service === 'db' && e.action === 'unpause')?.time : fault.ready.find((t) => t > down);
  assert.ok(ready && ready < tEnd, `${base}: 부하가 끝나기 전에 DB가 돌아오지 않았다`);
  const appDied = fault.events.filter((e) => e.service === 'app' && e.action === 'die').length;
  // restart -t 3: 3초 안에 정상 종료를 마쳤는지 (첫 시도는 못 마치고 강제 종료, 1회차는 2.99초에 마침)
  const shutdownAt = fault.shutdown.find((t) => t > down && t < ready);
  const how = mode === 'pause' ? '' : shutdownAt ? `, 정상 종료 ${s(shutdownAt - down)}` : ', 정상 종료 못 마치고 강제 종료';

  const ok = bookings.filter((r) => r.status === '201');
  const fails = bookings.filter((r) => r.status !== '201' && r.status !== '409');
  const byStatus = {};
  for (const r of bookings) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  // 실패 메시지는 스크립트가 남긴 check 이름('실패 <상태> <메시지>')으로 센다
  const messages = {};
  for (const p of (points.checks ?? []).filter((p) => p.tags.check.startsWith('실패 '))) messages[p.tags.check] = (messages[p.tags.check] ?? 0) + 1;
  assert.equal(Object.values(messages).reduce((a, b) => a + b, 0), fails.length, `${base}: 실패 메시지 수 ≠ 실패 요청 수`);

  const wait = (r) => r.blocked + r.duration; // 사용자가 기다린 시간 = 연결 + 서버 응답
  const waits = (list) => list.map(wait);
  const before = bookings.filter((r) => r.start < down);
  const during = bookings.filter((r) => r.start >= down && r.start < ready + GRACE);
  const after = bookings.filter((r) => r.start >= ready + GRACE);
  const maxWait = Math.max(...waits(bookings));
  // 쓰기 불가 구간: 예약 성공(201 응답)이 하나도 나오지 않은 가장 긴 구간
  const okEnds = ok.map((r) => r.end).sort((a, b) => a - b);
  let gap = [t0, okEnds[0] ?? tEnd];
  for (let i = 1; i < okEnds.length; i++) if (okEnds[i] - okEnds[i - 1] > gap[1] - gap[0]) gap = [okEnds[i - 1], okEnds[i]];
  const firstOk = okEnds.find((t) => t >= ready);
  const firstHealth = health.filter((r) => r.status === '200' && r.end >= ready).map((r) => r.end).sort((a, b) => a - b)[0];

  // 유실: 201을 받은 키가 DB에 없음. 응답 못 받은 예약: 201이 아닌데 DB에 생김 (사용자는 실패로 앎 → E-05 재시도와 연결)
  const prefix = bookings[0].tags.key.replace(/\d+$/, '');
  const dbKeys = new Set([...fault.keys].filter((k) => k.startsWith(prefix)));
  const lost = ok.filter((r) => !dbKeys.has(r.tags.key));
  const ghosts = bookings.filter((r) => r.status !== '201' && dbKeys.has(r.tags.key));
  assert.equal(dbKeys.size, ok.length - lost.length + ghosts.length, `${base}: DB 예약 키 중 k6 요청에 없는 키가 있다`);
  const leaked = Object.entries(messages).filter(([m]) => !m.startsWith('실패 0 ') && !GENERIC.test(m));

  const mark = (pass) => (pass ? '✅' : '❌');
  console.log(`\n## ${base.split('/').pop()} (${mode})`);
  console.log(`DB 장애: ${rel(down)} → ${rel(ready)} (${s(ready - down)}${how}, Docker 기록)   부하: 0 → ${rel(tEnd)}`);
  console.log(`쓰기 불가 구간 (201이 끊긴 가장 긴 구간): ${rel(gap[0])} → ${rel(gap[1])} (${s(gap[1] - gap[0])})`);
  console.log(`예약 ${bookings.length}건 상태: ${Object.entries(byStatus).map(([k, v]) => `${k === '0' ? '응답 없음' : k} ${v}`).join(' · ')}`);
  if (fails.length) console.log(`실패 ${fails.length}건: ${rel(Math.min(...fails.map((r) => r.start)))} → ${rel(Math.max(...fails.map((r) => r.end)))}`);
  for (const [m, n] of Object.entries(messages)) console.log(`  ${m} × ${n}`);
  console.log(`사용자가 기다린 시간 p95: 장애 전 ${ms(pct(waits(before), 0.95))} · 장애 중 ${ms(pct(waits(during), 0.95))} · 회복 뒤 ${ms(pct(waits(after), 0.95))} / 최대 ${ms(maxWait)}`);
  console.log(`DB 준비 → 첫 예약 성공 ${firstOk ? ms(firstOk - ready) : '없음'} · 헬스 체크 200 ${firstHealth ? ms(firstHealth - ready) : '없음'}`);
  console.log(`기준:`);
  console.log(`  ${mark(appDied === 0)} 앱 재시작 없음 (app 컨테이너 종료 ${appDied}회)`);
  console.log(`  ${mark(after.every((r) => r.status === '201' || r.status === '409'))} DB 준비 ${s(GRACE)} 뒤 시작한 예약 ${after.length}건 실패 ${after.filter((r) => fails.includes(r)).length}건`);
  console.log(`  ${mark(lost.length === 0)} 유실 ${lost.length}건 (201 ${ok.length}건을 DB 키와 대조)`);
  console.log(`  ${mark(leaked.length === 0 && !byStatus['0'])} 내부 오류 메시지 ${leaked.length}종 · 응답 없음 ${byStatus['0'] ?? 0}건`);
  console.log(`  ${mark(maxWait <= MAX_WAIT)} 가장 오래 기다린 예약 ${ms(maxWait)} (기준 ${s(MAX_WAIT)} 이하)`);
  console.log(`참고: 응답은 실패인데 DB에 생긴 예약 ${ghosts.length}건${ghosts.length ? ` (${ghosts.map((r) => r.status).join(', ')})` : ''} → E-05 재시도에서 다룸`);
}
