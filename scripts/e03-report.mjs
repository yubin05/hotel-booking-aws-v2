// E-03 결과 정리: 실행마다 표 숫자를 출력하고(stderr), 앞의 두 실행(수정 전·후)으로 포트폴리오용 그래프 HTML을 만든다(stdout)
// 실행: node scripts/e03-report.mjs load/results/<수정 전>.json.gz load/results/<수정 후>.json.gz [<더 볼 실행>...] > e03-graphs.html
import assert from 'node:assert/strict';
import { lineChart, pct, readK6 } from './k6-lib.mjs';

const ms = (v) => `${v.toFixed(1)}ms`;
const runs = [];
for (const file of process.argv.slice(2)) {
  const { requests, points } = await readK6(file);
  // 쏠림 시작 = 다 함께 누른 시각. 스크립트가 남긴 coupon_issued_at(그 시각부터 발급 응답까지)으로 되짚는다
  const starts = points.coupon_issued_at.map((p) => p.time - p.value).sort((a, b) => a - b);
  const t0 = starts[starts.length >> 1];
  const rel = (t) => t - t0;
  const claims = requests.filter((r) => r.scenario === 'claims' && r.name === 'claim');
  // 미리 연결(WARM=1)한 실행은 그 요청들이 몰린 때부터를 평소에서 뺀다
  const warmStart = Math.min(0, ...requests.filter((r) => r.name === 'warm').map((r) => rel(r.start)));
  const reads = requests.filter((r) => r.scenario === 'reads');
  assert.equal(claims.length, 1000, `${file}: 발급 요청이 1,000건이 아니다 (요청 묶기 실패)`);
  const issued = claims.filter((r) => r.status === '201').map((r) => rel(r.end)).sort((a, b) => a - b);
  assert.equal(issued.length, 100, `${file}: 발급이 100건이 아니다`);
  const burstEnd = Math.max(...claims.map((r) => rel(r.end)));
  const readsIn = (from, to) => reads.filter((r) => rel(r.start) >= from && rel(r.start) < to).map((r) => r.duration);
  const during = readsIn(0, burstEnd);
  // 연결이 1초 가까이 걸린 요청(TCP 재전송)은 빼고, 다 떨어진 뒤 소진 응답이 빠져나간 시간
  const soldOut = claims.filter((r) => r.status === '409' && r.blocked < 900).map((r) => rel(r.end));
  const buckets = [];
  for (let b = -500; b < 1500; b += 100) buckets.push([b + 50, pct(readsIn(b, b + 100), 0.95)]);
  const waited = claims.map((r) => r.blocked + r.duration); // 사용자가 기다린 시간 = 연결 + 서버 응답
  const server = claims.map((r) => r.duration);
  // 대략 선착순 기준 (docs/07): 받은 100명이 모두 요청을 보낸 순서(연결 뒤 보낸 시각)로 앞쪽 절반(500등) 안
  const bySent = [...claims].sort((a, b) => a.end - a.duration - (b.end - b.duration));
  const ranks = bySent.flatMap((r, i) => (r.status === '201' ? [i + 1] : []));
  const lastRank = Math.max(...ranks);
  console.error(
    [
      file,
      `  평소 조회 p95 ${ms(pct(readsIn(-Infinity, warmStart), 0.95))}`,
      `  쏠림 동안(0~${(burstEnd / 1000).toFixed(2)}초) 조회 ${during.length}건: 중앙값 ${ms(pct(during, 0.5))}, p95 ${ms(pct(during, 0.95))}, 최대 ${ms(Math.max(...during))}`,
      `  쏠림 뒤 조회 p95 ${ms(pct(readsIn(burstEnd, Infinity), 0.95))}`,
      `  발급 응답 (사용자가 기다린 시간, 연결 포함) p95 ${ms(pct(waited, 0.95))}, 최대 ${ms(Math.max(...waited))}, 1초 넘음 ${waited.filter((v) => v > 1000).length}명`,
      `  발급 응답 (서버만) p95 ${ms(pct(server, 0.95))}, 최대 ${ms(Math.max(...server))}`,
      `  선착순: 받은 100명 중 가장 늦게 보낸 사람 ${lastRank}등 (500등 이내 ${lastRank <= 500 ? '통과' : '실패'}), 먼저 보낸 100명 중 받은 사람 ${ranks.filter((n) => n <= 100).length}명`,
      `  첫 발급 ${issued[0].toFixed(0)}ms, 100장 소진 ${issued[99].toFixed(0)}ms`,
      `  소진 응답 ${soldOut.length}건이 100장 소진 뒤 ${(Math.max(...soldOut) - issued[99]).toFixed(0)}ms 동안 나감`,
      `  연결에 0.9초 넘게 걸린 발급 요청 ${claims.filter((r) => r.blocked >= 900).length}건`,
    ].join('\n'),
  );
  runs.push({ issued, buckets });
}

if (runs.length < 2) process.exit(0);
const [before, after] = runs;
const secs = (v) => `${(v / 1000).toFixed(2)}초`;
const peak = (run) => `최고 ${Math.max(...run.buckets.map(([, v]) => v)).toFixed(0)}ms`;
const issuedSeries = (run) => [[0, 0], ...run.issued.map((t, i) => [t, i + 1])];
// auto-fill: 카드가 2개여도 E-01(3개)과 같은 폭으로 둔다
console.log('<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:var(--space-4)">');
console.log(
  lineChart({
    title: '발급된 쿠폰 수 (장)',
    aria: `발급된 쿠폰 수: 수정 전 ${secs(before.issued[99])}, 수정 후 ${secs(after.issued[99])}에 100장 소진`,
    series: [
      { label: `수정 전 (${secs(before.issued[99])}에 소진)`, color: 'muted', dashed: true, points: issuedSeries(before) },
      { label: `수정 후 (${secs(after.issued[99])})`, color: 'accent', points: issuedSeries(after) },
    ],
    x: [0, 1000],
    y: [0, 100],
    xTicks: [[0, '0초'], [500, '0.5초'], [1000, '1초']],
    yTicks: [[0, '0'], [50, '50'], [100, '100']],
  }),
);
console.log(
  lineChart({
    title: '같은 시간 숙소 조회 p95 (ms, 0.1초 구간)',
    aria: `숙소 조회 p95: 수정 전 ${peak(before)}, 수정 후 ${peak(after)}. 평소에는 약 4ms`,
    series: [
      { label: `수정 전 (${peak(before)})`, color: 'muted', dashed: true, points: before.buckets },
      { label: `수정 후 (${peak(after)})`, color: 'accent', points: after.buckets },
    ],
    x: [-500, 1500],
    y: [0, 900],
    xTicks: [[-500, '-0.5초'], [0, '오픈'], [500, '0.5초'], [1000, '1초'], [1500, '1.5초']],
    yTicks: [[0, '0'], [450, '450'], [900, '900']],
  }),
);
console.log('</div>');
