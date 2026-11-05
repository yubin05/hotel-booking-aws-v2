// E-01 결과 정리: 표 숫자를 출력하고(stderr), 포트폴리오용 HTML(숫자 카드 + 시간 그래프 + 요청 종류별 막대)을 만든다(stdout)
// 실행: node scripts/e01-report.mjs load/results/<E-01 실행>.json.gz <정합성 검사의 DB 예약 수> > e01-graphs.html
import assert from 'node:assert/strict';
import { barList, lineChart, pct, readK6 } from './k6-lib.mjs';

const HOLD = [30, 120]; // 500명 유지 구간(초). e01-normal-traffic.js의 stages와 같아야 한다
const LIMIT = { read: 500, write: 1000 }; // 합격 기준 p95(ms). 스크립트의 thresholds와 같아야 한다
// 요청 이름 → [화면에 쓸 이름, 느리거나 빠른 이유]. 이유가 없는 것은 '나머지'로 묶는다
const NAMES = {
  login: ['로그인', '비밀번호 해시를 일부러 느리게 계산 (보안)'],
  featured: ['추천 숙소 (홈)', '숙소 1,000개를 모두 묶어 평점순 계산'],
  search: ['검색', '도시 이름으로 숙소를 훑고 개수도 셈'],
  booking: ['예약', '객실 · 날짜 몇 줄만 읽고 씀'],
  hotel: ['숙소 상세'],
  reviews: ['리뷰'],
  cities: ['도시 목록'],
  coupons: ['쿠폰 목록'],
  'my-bookings': ['내 예약'],
  'my-coupons': ['내 쿠폰'],
};

const dbBookings = Number(process.argv[3]);
assert.ok(Number.isInteger(dbBookings), '두 번째 인자로 정합성 검사의 DB 예약 수를 넣는다');
const { requests, points } = await readK6(process.argv[2]);
const t0 = Math.min(...requests.map((r) => r.start));
const sec = (t) => (t - t0) / 1000;
const errors = requests.filter((r) => !['200', '201', '409'].includes(r.status)).length;
const created = (points.bookings_created ?? []).reduce((sum, p) => sum + p.value, 0);
const maxVus = Math.max(...points.vus.map((p) => p.value));

const inHold = requests.filter((r) => sec(r.start) >= HOLD[0] && sec(r.start) < HOLD[1]);
assert.ok(inHold.length > 0, '유지 구간에 요청이 없다 (stages가 바뀌었나?)');
const holdRate = inHold.length / (HOLD[1] - HOLD[0]);
const byName = {};
for (const r of inHold) (byName[r.name] ??= []).push(r.duration);
const p95ByName = Object.entries(byName)
  .map(([name, v]) => ({ name, p95: pct(v, 0.95) }))
  .sort((a, b) => b.p95 - a.p95);
const end = Math.ceil(Math.max(...requests.map((r) => sec(r.end))) / 10) * 10;
const windows = [];
for (let s = 0; s < end; s += 10) {
  const w = requests.filter((r) => sec(r.start) >= s && sec(r.start) < s + 10);
  if (w.length) windows.push({ mid: s + 5, p95: pct(w.map((r) => r.duration), 0.95) });
}
const holdP95 = windows.filter((w) => w.mid > HOLD[0] && w.mid < HOLD[1]).map((w) => w.p95);
const [lo, hi] = [Math.min(...holdP95), Math.max(...holdP95)].map(Math.round);
console.error(
  [
    `요청 ${requests.length}건 (setup 제외), 예상 밖 응답 ${errors}건, k6 예약 ${created}건 / DB ${dbBookings}건`,
    `유지 구간(${HOLD.join('~')}초) 초당 ${holdRate.toFixed(1)}건, 10초 구간 p95 ${lo}~${hi}ms`,
    `유지 구간 요청 종류별 p95: ${p95ByName.map(({ name, p95 }) => `${name} ${p95.toFixed(1)}ms`).join(', ')}`,
  ].join('\n'),
);

const slowest = p95ByName[0];
const tile = (label, value, note) =>
  '<div style="padding:var(--space-3) var(--space-4);border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)">' +
  `<div style="font-size:var(--fs-xs);color:var(--muted)">${label}</div>` +
  `<div style="font-size:var(--fs-xl);font-weight:700;color:var(--ink);line-height:1.3">${value}</div>` +
  `<div style="font-size:var(--fs-xs);color:var(--muted)">${note}</div></div>`;
console.log('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:var(--space-3)">');
console.log(tile('동시 접속', `${maxVus}명`, `${HOLD[1] - HOLD[0]}초 유지 · 초당 약 ${Math.round(holdRate)}건 요청`));
console.log(tile('서버 오류', `${errors}건`, `요청 ${requests.length.toLocaleString('ko-KR')}건 중`));
console.log(tile('예약 유실', `${created - dbBookings}건`, `k6 예약 ${created}건 · DB ${dbBookings}건`));
console.log(
  tile('가장 느린 요청', `${(slowest.p95 / 1000).toFixed(2)}초`, `${NAMES[slowest.name]?.[0] ?? slowest.name} p95 · 기준 ${['login', 'booking'].includes(slowest.name) ? LIMIT.write / 1000 : LIMIT.read / 1000}초`),
);
console.log('</div>');

const xTicks = [[0, '0초'], [30, '30초'], [60, '60초'], [90, '90초'], [120, '120초']];
const band = [...HOLD, `${maxVus}명 유지`];
console.log('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(18rem,1fr));gap:var(--space-4);align-items:start">');
// 같은 시간축의 두 그래프를 위아래로 붙여 "사람이 늘어도 응답 시간은 그대로"를 한눈에 비교한다
console.log('<div style="display:grid;gap:var(--space-3)">');
console.log(
  lineChart({
    title: `① 동시 접속자: ${HOLD[0]}초 만에 ${maxVus}명까지`,
    aria: `동시 접속자: ${HOLD[0]}초 동안 ${maxVus}명까지 늘려 ${HOLD[1] - HOLD[0]}초 유지한 뒤 줄임`,
    series: [{ color: 'accent', points: points.vus.map(({ time, value }) => [sec(time), value]).filter(([t]) => t >= 0 && t <= end) }],
    x: [0, end],
    y: [0, maxVus],
    xTicks,
    yTicks: [[0, '0'], [maxVus / 2, String(maxVus / 2)], [maxVus, String(maxVus)]],
    band,
  }),
);
console.log(
  lineChart({
    title: `② 응답 시간 p95: ${maxVus}명이 돼도 ${lo}~${hi}ms 그대로`,
    aria: `10초 구간별 응답 시간 p95: ${maxVus}명 유지 내내 ${lo}~${hi}ms, 합격 기준은 ${LIMIT.read}ms`,
    series: [{ color: 'accent', points: windows.map((w) => [w.mid, w.p95]) }],
    x: [0, end],
    y: [0, 50],
    xTicks,
    yTicks: [[0, '0'], [25, '25ms'], [50, '50ms']],
    band,
  }),
);
console.log('</div>');
const others = p95ByName.filter(({ name }) => !NAMES[name]?.[1]);
console.log(
  barList({
    title: `③ 요청 종류별 응답 시간 p95 (기준: 조회 ${LIMIT.read / 1000}초, 로그인 · 예약 ${LIMIT.write / 1000}초)`,
    bars: [
      ...p95ByName.filter(({ name }) => NAMES[name]?.[1]).map(({ name, p95 }) => ({ label: NAMES[name][0], note: NAMES[name][1], value: p95 })),
      { label: `나머지 ${others.length}종`, note: `${others.map(({ name }) => NAMES[name]?.[0] ?? name).join(' · ')}. 키로 바로 찾음`, value: others[0].p95 },
    ],
    max: Math.ceil(slowest.p95 / 50) * 50,
    unit: 'ms',
  }),
);
console.log('</div>');
