// E-01 결과 정리: 표 숫자를 출력하고(stderr), 포트폴리오용 그래프 HTML을 만든다(stdout)
// 실행: node scripts/e01-report.mjs load/results/<E-01 실행>.json.gz > e01-graphs.html
import assert from 'node:assert/strict';
import { lineChart, pct, readK6 } from './k6-lib.mjs';

const HOLD = [30, 120]; // 500명 유지 구간(초). e01-normal-traffic.js의 stages와 같아야 한다
const { requests, points } = await readK6(process.argv[2]);
const t0 = Math.min(...requests.map((r) => r.start));
const sec = (t) => (t - t0) / 1000;
const unexpected = requests.filter((r) => !['200', '201', '409'].includes(r.status));
assert.equal(unexpected.length, 0, `예상 밖 응답 ${unexpected.length}건`);

const inHold = requests.filter((r) => sec(r.start) >= HOLD[0] && sec(r.start) < HOLD[1]);
assert.ok(inHold.length > 0, '유지 구간에 요청이 없다 (stages가 바뀌었나?)');
const byName = {};
for (const r of inHold) (byName[r.name] ??= []).push(r.duration);
const end = Math.ceil(Math.max(...requests.map((r) => sec(r.end))) / 10) * 10;
const windows = [];
for (let s = 0; s < end; s += 10) {
  const w = requests.filter((r) => sec(r.start) >= s && sec(r.start) < s + 10);
  if (w.length) windows.push({ mid: s + 5, rate: w.length / 10, p95: pct(w.map((r) => r.duration), 0.95) });
}
console.error(
  [
    `요청 ${requests.length}건 (setup 제외), 상태 ${JSON.stringify(requests.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {}))}`,
    `유지 구간(${HOLD.join('~')}초) 초당 ${(inHold.length / (HOLD[1] - HOLD[0])).toFixed(1)}건, p95 ${pct(inHold.map((r) => r.duration), 0.95).toFixed(1)}ms`,
    `유지 구간 요청 종류별 p95: ${Object.entries(byName)
      .map(([n, v]) => [n, pct(v, 0.95)])
      .sort((a, b) => b[1] - a[1])
      .map(([n, v]) => `${n} ${v.toFixed(1)}ms`)
      .join(', ')}`,
  ].join('\n'),
);

const vus = points.vus.map(({ time, value }) => [sec(time), value]).filter(([t]) => t >= 0 && t <= end);
const xTicks = [[0, '0초'], [30, '30초'], [60, '60초'], [90, '90초'], [120, '120초']];
const peakRate = Math.max(...windows.map((w) => w.rate));
const holdP95 = windows.filter((w) => w.mid > HOLD[0] && w.mid < HOLD[1]).map((w) => w.p95);
// auto-fill: 카드 폭을 E-02·E-03 그래프와 같게 둔다
console.log('<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:var(--space-4)">');
console.log(
  lineChart({
    title: '동시 접속자 (명)',
    aria: '동시 접속자: 30초 동안 500명까지 늘려 90초 유지한 뒤 줄임',
    series: [{ label: '30초에 500명, 90초 유지', color: 'accent', points: vus }],
    x: [0, end],
    y: [0, 500],
    xTicks,
    yTicks: [[0, '0'], [250, '250'], [500, '500']],
  }),
);
console.log(
  lineChart({
    title: '초당 요청 (건, 10초 구간)',
    aria: `초당 요청: 500명 유지 구간 약 ${(inHold.length / (HOLD[1] - HOLD[0])).toFixed(0)}건, 최고 ${peakRate.toFixed(0)}건`,
    series: [{ label: `유지 구간 약 ${(inHold.length / (HOLD[1] - HOLD[0])).toFixed(0)}건`, color: 'accent', points: windows.map((w) => [w.mid, w.rate]) }],
    x: [0, end],
    y: [0, 120],
    xTicks,
    yTicks: [[0, '0'], [60, '60'], [120, '120']],
  }),
);
console.log(
  lineChart({
    title: '응답 시간 p95 (ms, 10초 구간)',
    aria: `전체 응답 시간 p95: 500명 유지 내내 ${Math.min(...holdP95).toFixed(0)}~${Math.max(...holdP95).toFixed(0)}ms`,
    series: [{ label: `유지 내내 ${Math.min(...holdP95).toFixed(0)}~${Math.max(...holdP95).toFixed(0)}ms`, color: 'accent', points: windows.map((w) => [w.mid, w.p95]) }],
    x: [0, end],
    y: [0, 50],
    xTicks,
    yTicks: [[0, '0'], [25, '25'], [50, '50']],
  }),
);
console.log('</div>');
