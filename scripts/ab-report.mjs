// 로컬 앱 변경 효과(load/run-local-ab.sh) 결과를 옛 앱 · 지금 앱 비교 표로 정리한다
// 실행: node scripts/ab-report.mjs load/results/local-ab-*   (warmup 폴더는 건너뜀)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pct, readK6 } from './k6-lib.mjs';

const OK = ['200', '201', '409']; // baseline-report.mjs와 같음
const CHANGED = ['login', 'booking', 'my-bookings']; // 새 기능이 경로에 더해진 요청 (03 3단계 표)
const dirs = process.argv.slice(2).filter((d) => /local-ab-(old|new)-\d+\/?$/.test(d));
assert.ok(dirs.length > 0, '사용: node scripts/ab-report.mjs load/results/local-ab-*');

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(1)}ms`);
const rows = [];
for (const dir of dirs.sort()) {
  const name = basename(dir.replace(/\/$/, ''));
  const { requests, points } = await readK6(join(dir, `${name}.json.gz`));
  // 층 찾기: baseline-report.mjs와 같게 VU 수가 30초 넘게 그대로인 구간
  const vus = points.vus.map((p) => [p.time, p.value]).sort((a, b) => a[0] - b[0]);
  const floors = [];
  for (let i = 0; i < vus.length; ) {
    let j = i;
    while (j + 1 < vus.length && vus[j + 1][1] === vus[i][1]) j++;
    if (vus[i][1] > 0 && (vus[j][0] - vus[i][0]) / 1000 >= 30) floors.push({ vus: vus[i][1], from: vus[i][0], to: vus[j][0] });
    i = j + 1;
  }
  assert.equal(floors.length, 2, `${name}: 층이 500 · 1,000명 2개가 아님`);
  // DB 시간: 이 실행 동안 hotel_booking에서 돈 조회 전체의 합 (db-digest.tsv 첫 칸, 첫 줄은 머리글)
  const dbSec = readFileSync(join(dir, 'db-digest.tsv'), 'utf8').trim().split('\n').slice(1)
    .reduce((s, l) => s + Number(l.split('\t')[0]), 0);
  for (const f of floors) {
    const inFloor = requests.filter((r) => r.start >= f.from && r.start < f.to);
    const wait = (list) => list.map((r) => r.blocked + r.duration); // 사용자가 기다린 시간 (점검표 1)
    const byName = Object.fromEntries(CHANGED.map((n) => [n, wait(inFloor.filter((r) => r.name === n))]));
    rows.push({
      name, version: name.split('-')[2], vus: f.vus, n: inFloor.length, rps: inFloor.length / ((f.to - f.from) / 1000),
      err: inFloor.filter((r) => !OK.includes(r.status)).length / inFloor.length, p95: pct(wait(inFloor), 0.95),
      changed: CHANGED.map((n) => (byName[n].length ? `${fmt(pct(byName[n], 0.95))} (${byName[n].length})` : '-')), dbSec,
    });
  }
}

console.log(`| 실행 | 층 | 요청 | 처리량(건/초) | 에러율 | 전체 p95 | ${CHANGED.map((n) => `${n} p95 (건)`).join(' | ')} | DB 시간(실행 전체) |`);
console.log(`|---|---|---|---|---|---|${CHANGED.map(() => '---|').join('')}---|`);
for (const r of rows) {
  console.log(`| ${r.name} | ${r.vus} | ${r.n} | ${r.rps.toFixed(1)} | ${(r.err * 100).toFixed(2)}% | ${fmt(r.p95)} | ${r.changed.join(' | ')} | ${r.dbSec.toFixed(1)}초 |`);
}

// 버전별 범위 (3회의 최소 ~ 최대). 범위가 겹치면 "차이 없음"으로 본다 (docs/experiments/app-change.md 판정 기준)
const range = (list) => `${fmt(Math.min(...list))} ~ ${fmt(Math.max(...list))}`;
const topVus = Math.max(...rows.map((r) => r.vus));
console.log(`\n| 버전 | ${topVus}명 p95 범위 | DB 시간 범위 |`);
console.log('|---|---|---|');
for (const v of ['old', 'new']) {
  const top = rows.filter((r) => r.version === v && r.vus === topVus);
  if (top.length) console.log(`| ${v} (${top.length}회) | ${range(top.map((r) => r.p95))} | ${Math.min(...top.map((r) => r.dbSec)).toFixed(1)} ~ ${Math.max(...top.map((r) => r.dbSec)).toFixed(1)}초 |`);
}
