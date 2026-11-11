// 부하 기준선 결과를 층별 표로 정리한다 (과제 3). 층은 k6의 VU 수가 30초 넘게 그대로인 구간으로 찾으므로 stages를 바꿔도 따라간다
// 실행: node scripts/baseline-report.mjs load/results/<이름>/<이름>.json.gz
// 같은 폴더에 app·db·load.vmstat(run-baseline.sh가 가져옴)가 있으면 층마다 서버 CPU·메모리도 붙인다
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pct, readK6 } from './k6-lib.mjs';

const OK = ['200', '201', '409']; // 409(이미 예약된 날짜)는 정상 거절이라 에러로 세지 않는다 (baseline.js와 같음)
// 무너짐: 에러율 1% 초과 또는 p95 1초 초과 (에러는 적어도 대부분이 오래 기다리면 버텼다고 하지 않는다)
const ERROR_LIMIT = 0.01;
const P95_LIMIT_MS = 1000;
const MIN_FLOOR_SEC = 30;

const file = process.argv[2];
assert.ok(file, '사용: node scripts/baseline-report.mjs <결과>.json.gz');
const { requests, points } = await readK6(file);
assert.ok(requests.length > 0, '요청 기록이 없다');

// 층 찾기: VU 수가 같은 값으로 MIN_FLOOR_SEC 넘게 이어진 구간
const vus = points.vus.map((p) => [p.time, p.value]).sort((a, b) => a[0] - b[0]);
const floors = [];
for (let i = 0; i < vus.length; ) {
  let j = i;
  while (j + 1 < vus.length && vus[j + 1][1] === vus[i][1]) j++;
  if (vus[i][1] > 0 && (vus[j][0] - vus[i][0]) / 1000 >= MIN_FLOOR_SEC) floors.push({ vus: vus[i][1], from: vus[i][0], to: vus[j][0] });
  i = j + 1;
}
assert.ok(floors.length > 0, `VU 수가 ${MIN_FLOOR_SEC}초 넘게 그대로인 구간이 없다`);

// vmstat: 헤더 이름으로 칸을 찾는다 (procps 버전에 따라 칸 수가 다름). 시각은 서버 시간대(UTC) 기준
function readVmstat(path) {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const header = lines.find((l) => /\bid\b/.test(l) && /\bfree\b/.test(l))?.trim().split(/\s+/);
  if (!header) return null;
  const col = (name) => header.indexOf(name);
  return lines
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => /^\d+$/.test(c[0]) && c.length >= header.length)
    .map((c) => ({
      time: Date.parse(`${c[c.length - 2]}T${c[c.length - 1]}Z`),
      busy: 100 - Number(c[col('id')]),
      steal: Number(c[col('st')]),
      freeMb: Number(c[col('free')]) + Number(c[col('buff')]) + Number(c[col('cache')]),
    }));
}
const dir = dirname(file);
const hosts = ['app', 'db', 'load'].map((h) => [h, readVmstat(join(dir, `${h}.vmstat`))]).filter(([, v]) => v);

const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
const rows = floors.map((f) => {
  const sec = (f.to - f.from) / 1000;
  const inFloor = requests.filter((r) => r.start >= f.from && r.start < f.to);
  assert.ok(inFloor.length > 0, `${f.vus}명 층에 요청이 없다`);
  const errors = inFloor.filter((r) => !OK.includes(r.status)).length;
  const waits = inFloor.map((r) => r.blocked + r.duration); // 사용자가 기다린 시간 = 연결 대기 + 응답 (점검표 1)
  const byName = {};
  for (const r of inFloor) (byName[r.name] ??= []).push(r.blocked + r.duration);
  const [slowName, slowP95] = Object.entries(byName)
    .map(([n, v]) => [n, pct(v, 0.95)])
    .sort((a, b) => b[1] - a[1])[0];
  const server = hosts.map(([h, rows]) => {
    const w = rows.filter((v) => v.time >= f.from && v.time < f.to);
    if (w.length === 0) return `${h} -`;
    const avg = w.reduce((s, v) => s + v.busy, 0) / w.length;
    return `${h} CPU ${Math.round(avg)}%(최대 ${Math.max(...w.map((v) => v.busy))}, steal ${Math.max(...w.map((v) => v.steal))}) 여유 ${Math.min(...w.map((v) => v.freeMb))}MB`;
  });
  const rate = errors / inFloor.length;
  const p95 = pct(waits, 0.95);
  const why = [rate > ERROR_LIMIT && `에러율 ${(rate * 100).toFixed(1)}%`, p95 > P95_LIMIT_MS && `p95 ${fmtMs(p95)}`].filter(Boolean);
  return {
    vus: f.vus, sec, n: inFloor.length, rps: inFloor.length / sec, rate, p95, p99: pct(waits, 0.99),
    slow: `${slowName} ${fmtMs(slowP95)}`, verdict: why.length ? '무너짐' : '버팀', why, server,
  };
});

console.log('| 층(VU) | 머문 시간 | 요청 | 처리량(건/초) | 에러율 | p95 | p99 | 가장 느린 요청 p95 | 판정 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.vus} | ${Math.round(r.sec)}초 | ${r.n} | ${r.rps.toFixed(1)} | ${(r.rate * 100).toFixed(2)}% | ${fmtMs(r.p95)} | ${fmtMs(r.p99)} | ${r.slow} | ${r.verdict} |`);
}
if (hosts.length) {
  console.log('\n서버 (층마다 CPU 평균·최대·steal, 여유 메모리 최저 = free + buff + cache)');
  for (const r of rows) console.log(`- ${r.vus}명: ${r.server.join(' / ')}`);
}
const first = rows.findIndex((r) => r.verdict === '무너짐');
console.log(
  first < 0
    ? `\n결론: 맨 위 ${rows.at(-1).vus}명 층까지 버팀 (한계는 그 위, 층을 더 얹어 다시 잰다)`
    : `\n결론: ${first > 0 ? `${rows[first - 1].vus}명(초당 ${rows[first - 1].rps.toFixed(0)}건)까지 버팀, ` : ''}${rows[first].vus}명 층에서 무너짐 (${rows[first].why.join(', ')}. 기준: 에러율 1% · p95 1초)`,
);
const created = (points.bookings_created ?? []).reduce((s, p) => s + p.value, 0);
console.log(`k6 예약 성공(bookings_created): ${created}건 → consistency.txt의 이 실행 예약 수와 같아야 함`);
