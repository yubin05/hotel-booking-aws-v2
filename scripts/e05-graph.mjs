// E-05 포트폴리오 그래프: 앱 강제 종료 전후 1초마다 '예약됨' 답(201·200)을 받은 수. 처음 누른 예약과 다시 누른 예약을 나눠 그린다
// 실행: node scripts/e05-graph.mjs load/results/<실행> > e05-graph.html
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineChart, readK6 } from './k6-lib.mjs';

const STEP = 1000;
const [X0, X1] = [-5000, 15000]; // 강제 종료 시각 기준

const base = process.argv[2];
const { points } = await readK6(`${base}.json.gz`);
const fault = readFileSync(`${base}-fault.txt`, 'utf8');
const kill = Number(/^(\d+) kill$/m.exec(fault)?.[1]) / 1e6;
// 다시 띄운 앱이 'listening on'을 찍은 때 (Docker 로그 시각은 ms까지만 읽는다)
const ready = [...fault.matchAll(/^(\S+) listening on/gm)].map((m) => Date.parse(m[1].replace(/(\.\d{3})\d*/, '$1'))).find((t) => t > kill);
assert.ok(kill && ready, `${base}: 강제 종료·다시 받기 시작 기록이 없다`);
const answered = (points.booking_wait ?? [])
  .filter((p) => ['200', '201'].includes(p.tags.status))
  .map((p) => ({ t: p.time - kill, retry: p.tags.attempt !== '1' }));
const line = (retry) => {
  const out = [];
  for (let b = X0; b < X1; b += STEP) out.push([(b + STEP / 2) / 1000, answered.filter((a) => a.retry === retry && a.t >= b && a.t < b + STEP).length]);
  return out;
};
const retried = answered.filter((a) => a.retry).length;
const top = Math.ceil(Math.max(...[false, true].flatMap((r) => line(r).map(([, y]) => y))) / 10) * 10;

console.log(
  lineChart({
    title: `다시 누른 예약 ${retried}건이 앱이 다시 뜨자 한꺼번에 처리됨 (중복 0)`,
    aria: `강제 종료 전후 1초마다 예약됨 답을 받은 수. 앱이 없던 ${((ready - kill) / 1000).toFixed(1)}초 동안 0건, 다시 받기 시작한 뒤 다시 누른 예약 ${retried}건이 몰려 처리됨`,
    series: [
      { label: '처음 누른 예약', color: 'muted', points: line(false) },
      { label: '다시 누른 예약', color: 'accent', points: line(true) },
    ],
    x: [X0 / 1000, X1 / 1000],
    y: [0, top],
    xTicks: [[-5, '-5초'], [0, '종료'], [5, '5초'], [10, '10초'], [15, '15초']],
    yTicks: [[0, '0'], [10, '10건'], [top, `${top}건`]],
    band: [0, (ready - kill) / 1000, '앱 없음'],
  }),
);
