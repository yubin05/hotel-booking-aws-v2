// E-04 포트폴리오 그래프: ② 멈춤에서 요청을 보낸 시각별로 사용자가 기다린 시간(0.5초 구간마다 가장 오래 기다린 요청)
// 실행: node scripts/e04-graph.mjs load/results/<pause 실행> > e04-graph.html
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineChart, readK6 } from './k6-lib.mjs';

const STEP = 500;
const [X0, X1] = [-5000, 20000]; // 멈춘 시각 기준

async function series(base) {
  const { requests } = await readK6(`${base}.json.gz`);
  const fault = readFileSync(`${base}-fault.txt`, 'utf8');
  const at = (action) => Number(new RegExp(`^(\\d+) db ${action}$`, 'm').exec(fault)?.[1]) / 1e6;
  const [down, up] = [at('pause'), at('unpause')];
  assert.ok(down && up, `${base}: pause·unpause 기록이 없다`);
  const bookings = requests.filter((r) => r.scenario === 'bookings').map((r) => ({ t: r.start - down, wait: r.blocked + r.duration }));
  const points = [];
  for (let b = X0; b < X1; b += STEP) {
    const inBucket = bookings.filter((r) => r.t >= b && r.t < b + STEP).map((r) => r.wait);
    if (inBucket.length) points.push([(b + STEP / 2) / 1000, Math.max(...inBucket) / 1000]);
  }
  return { points, max: Math.max(...bookings.map((r) => r.wait)) / 1000, pause: (up - down) / 1000 };
}

const run = await series(process.argv[2]);
console.log(
  lineChart({
    title: `② DB가 15초 멈춘 동안에도 사용자는 3초 안에 답을 받음 (가장 오래 기다린 예약 ${run.max.toFixed(1)}초)`,
    aria: `요청을 보낸 시각별 사용자가 기다린 시간. 멈춘 동안 최대 ${run.max.toFixed(1)}초, 평소와 회복 뒤는 0.1초 미만`,
    series: [{ label: '가장 오래 기다린 예약', color: 'accent', points: run.points }],
    x: [X0 / 1000, X1 / 1000],
    y: [0, 5],
    xTicks: [[-5, '-5초'], [0, '멈춤'], [5, '5초'], [10, '10초'], [15, '15초'], [20, '20초']],
    yTicks: [[0, '0'], [3, '3초'], [5, '5초']],
    band: [0, run.pause, 'DB 멈춤'],
  }),
);
