// E-06 포트폴리오 그래프: 정상 종료 신호 전후 1초마다 '예약됨' 답(201·200)을 받은 수.
// 처음 누른 예약, 종료 신호 순간 처리 중이던 예약, 다시 누른 예약을 나눠 그린다
// 실행: node scripts/e06-graph.mjs load/results/<실행> > e06-graph.html
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineChart, readK6 } from './k6-lib.mjs';

const STEP = 1000;
const [X0, X1] = [-5000, 15000]; // 종료 신호 시각 기준

const base = process.argv[2];
const { points } = await readK6(`${base}.json.gz`);
const fault = readFileSync(`${base}-fault.txt`, 'utf8');
const event = (re) => Number(re.exec(fault)?.[1]) / 1e6;
const term = event(/^(\d+) app kill signal=15 /m);
const die = event(/^(\d+) app die .*exitCode=0$/m);
// 새 버전이 'listening on'을 찍은 때 (Docker 로그 시각은 ms까지만 읽는다)
const ready = [...fault.matchAll(/^(\S+) listening on/gm)].map((m) => Date.parse(m[1].replace(/(\.\d{3})\d*/, '$1'))).find((t) => t > die);
assert.ok(term && die && ready, `${base}: 종료 신호·정상 종료·새 버전 시작 기록이 없다`);
const answered = (points.booking_wait ?? [])
  .filter((p) => ['200', '201'].includes(p.tags.status))
  .map((p) => {
    const kind = p.tags.attempt !== '1' ? 'retry' : p.time - p.value < term && p.time > term ? 'inflight' : 'first';
    return { t: p.time - term, kind };
  });
const line = (kind) => {
  const out = [];
  for (let b = X0; b < X1; b += STEP) out.push([(b + STEP / 2) / 1000, answered.filter((a) => a.kind === kind && a.t >= b && a.t < b + STEP).length]);
  return out;
};
const n = (kind) => answered.filter((a) => a.kind === kind).length;
const top = Math.ceil(Math.max(...['first', 'inflight', 'retry'].flatMap((k) => line(k).map(([, y]) => y))) / 10) * 10;
const sec = (ms) => (ms / 1000).toFixed(1);

console.log(
  lineChart({
    title: `종료 신호 때 처리 중이던 예약 ${n('inflight')}건은 모두 답을 받고, 서버는 ${sec(die - term)}초 만에 스스로 꺼짐`,
    aria: `정상 종료 신호 전후 1초마다 예약됨 답을 받은 수. 처리 중이던 예약 ${n('inflight')}건이 신호 1초 뒤 모두 답을 받음. 서버 1대라 새 버전이 받기까지 ${sec(ready - term)}초 동안 새 예약은 받지 못하고, 다시 누른 예약 ${n('retry')}건이 그 뒤 처리됨`,
    series: [
      { label: '처음 누른 예약', color: 'muted', points: line('first') },
      { label: '종료 신호 때 처리 중이던 예약', color: 'accent', points: line('inflight') },
      { label: '다시 누른 예약', color: 'accent', dashed: true, points: line('retry') },
    ],
    x: [X0 / 1000, X1 / 1000],
    y: [0, top],
    xTicks: [[-5, '-5초'], [0, '종료 신호'], [5, '5초'], [10, '10초'], [15, '15초']],
    yTicks: [[0, '0'], [10, '10건'], [top, `${top}건`]],
    band: [0, (ready - term) / 1000, '예약 못 받음 (서버 1대)'],
  }),
);
