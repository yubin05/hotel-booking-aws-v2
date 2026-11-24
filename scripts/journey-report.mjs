// 손님 여정(load/journey.js) 결과를 층별 표로: 접속부터 예약까지 기다린 시간 · 성공률 · 화면별 p95 · 멈춘 화면 (2026-11-24)
// 실행: node scripts/journey-report.mjs load/results/<이름>
// 층은 같은 폴더 부하 기록(<이름>.json.gz)의 VU 수로 찾는다(baseline-report.mjs와 같은 방식). 여정 · 화면은 끝난 시각이 속한 층으로 센다
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pct, readK6 } from './k6-lib.mjs';

const MIN_FLOOR_SEC = 30;
const SCREENS = [
  ['home', '첫 화면'],
  ['search', '검색'],
  ['hotel', '숙소'],
  ['login', '로그인'],
  ['booking-page', '예약 화면'],
  ['booking', '예약'],
];

const dir = process.argv[2];
assert.ok(dir, '사용: node scripts/journey-report.mjs load/results/<이름>');
const files = readdirSync(dir);
const loadFile = files.find((f) => f.endsWith('.json.gz'));
const journeyFile = files.find((f) => f.endsWith('.journey.gz'));
assert.ok(loadFile && journeyFile, `${dir}에 <이름>.json.gz와 <이름>.journey.gz가 둘 다 있어야 한다`);

// 층 찾기: VU 수가 같은 값으로 MIN_FLOOR_SEC 넘게 이어진 구간 (baseline-report.mjs와 같은 코드)
const { points: load } = await readK6(join(dir, loadFile));
const vus = load.vus.map((p) => [p.time, p.value]).sort((a, b) => a[0] - b[0]);
const floors = [];
for (let i = 0; i < vus.length; ) {
  let j = i;
  while (j + 1 < vus.length && vus[j + 1][1] === vus[i][1]) j++;
  if (vus[i][1] > 0 && (vus[j][0] - vus[i][0]) / 1000 >= MIN_FLOOR_SEC) floors.push({ vus: vus[i][1], from: vus[i][0], to: vus[j][0] });
  i = j + 1;
}
assert.ok(floors.length > 0, `VU 수가 ${MIN_FLOOR_SEC}초 넘게 그대로인 구간이 없다`);

const { points: j } = await readK6(join(dir, journeyFile));
assert.ok(j.journey_ok?.length > 0, '여정 기록(journey_ok)이 없다');
const sec = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}초` : `${Math.round(ms)}ms`);
const within = (list, f) => (list ?? []).filter((p) => p.time >= f.from && p.time < f.to);

console.log('| 층(VU) | 여정 | 예약까지 성공 | 기다린 시간 합 p50 · p95 · 최대 | ' + SCREENS.map(([, label]) => `${label} p95`).join(' | ') + ' | 멈춘 화면 |');
console.log('|---|---|---|---|' + SCREENS.map(() => '---|').join('') + '---|');
for (const f of floors) {
  const tries = within(j.journey_ok, f);
  const success = tries.filter((p) => p.value === 1).length;
  const waits = within(j.journey_wait, f).map((p) => p.value);
  const screens = within(j.journey_screen, f);
  const perScreen = SCREENS.map(([key]) => {
    const v = screens.filter((p) => p.tags.screen === key).map((p) => p.value);
    return v.length ? sec(pct(v, 0.95)) : '-';
  });
  const fails = Object.entries(Object.groupBy(within(j.journey_fail, f), (p) => p.tags.screen))
    .map(([key, list]) => `${SCREENS.find(([k]) => k === key)?.[1] ?? key} ${list.length}`)
    .join(', ');
  const wait = waits.length ? `${sec(pct(waits, 0.5))} · ${sec(pct(waits, 0.95))} · ${sec(Math.max(...waits))}` : '-';
  const rate = tries.length ? `${success}/${tries.length} (${((success / tries.length) * 100).toFixed(0)}%)` : '-';
  console.log(`| ${f.vus} | ${tries.length} | ${rate} | ${wait} | ${perScreen.join(' | ')} | ${fails || '없음'} |`);
}
console.log('\n기다린 시간 합: 성공한 여정의 화면 6개(첫 화면 · 검색 · 숙소 · 로그인 · 예약 화면 · 예약)를 기다린 시간의 합. 화면 사이 2초(생각하는 시간)는 뺌');
