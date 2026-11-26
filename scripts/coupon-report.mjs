// 3단계 쿠폰 오픈 스파이크 정리 (docs/experiments/migration.md 3절). 로컬 E-03 보고(고객사 저장소 scripts/e03-report.mjs)와 같은 잣대
// 실행: node scripts/coupon-report.mjs load/results/coupon-*/coupon-*.json.gz → 회차마다 한 줄
// 시간은 모두 사용자가 기다린 시간 = 연결(blocked) + 서버 응답 (점검표 1). E-03의 조회 p95는 서버 응답만이라 연결 시간만큼 다를 수 있음
// 같은 폴더에 cw.json(load/cw-metrics.sh)이 있으면 T 앞뒤 정상 태스크 수 · 가장 바쁜 태스크 CPU를 붙인다 (1분 단위)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pct, readK6 } from './k6-lib.mjs';

const files = process.argv.slice(2);
assert.ok(files.length > 0, '사용: node scripts/coupon-report.mjs <결과>.json.gz ...');
const p95 = (v) => (v.length ? `${Math.round(pct(v, 0.95))}ms` : '-');
// T 1분 전 ~ 5분 뒤의 1분 값들 (cw.json이 없으면 '-')
function tasks(file, t0) {
  const path = join(dirname(file), 'cw.json');
  if (!existsSync(path)) return '-';
  const series = Object.fromEntries(JSON.parse(readFileSync(path, 'utf8')).MetricDataResults.map((m) => [m.Id, m]));
  const around = (id) => {
    const m = series[id];
    return m ? m.Timestamps.map((t, i) => [Date.parse(t), m.Values[i]]).filter(([t]) => t >= t0 - 60000 && t < t0 + 300000).sort((a, b) => a[0] - b[0]).map(([, v]) => Math.round(v)) : [];
  };
  const cpu = around('ecs_cpu_max');
  return `${around('healthy').join(' · ') || '-'}개, CPU 최대 ${cpu.length ? Math.max(...cpu) : '-'}%`;
}

console.log('| 회차 | 발급 201 · 소진 409 · 예상 밖 | 발급 p95 · 최대 · 1초 넘음 | 마지막 장까지 | 조회 p95: T 전 30초 → 쏠림 동안 → 쏠림 뒤 | 정상 태스크(T-1 ~ +5분, 1분마다) |');
console.log('|---|---|---|---|---|---|');
for (const file of files) {
  const { requests, points } = await readK6(file);
  const claims = requests.filter((r) => r.scenario === 'claims' && r.name === 'claim');
  const iterations = (points.iterations ?? []).filter((p) => p.tags.scenario === 'claims').length;
  assert.equal(claims.length, iterations, `${file}: 발급 요청 수(${claims.length})가 반복 수(${iterations})와 다름 (요청 묶기 실패)`);
  // 함께 누른 시각 T. 가장 이른 요청이 아니라 1번째 백분위: 11-26 회차 4에서 요청 1건이 T보다 0.8초 먼저 나가 마지막 장 · 쏠림 구간이 0.8초 밀림
  const starts = claims.map((r) => r.start).sort((a, b) => a - b);
  const t0 = starts[Math.floor(starts.length * 0.01)];
  const rel = (t) => t - t0;
  const burstEnd = Math.max(...claims.map((r) => rel(r.end))); // 쏠림 = T부터 마지막 발급 요청의 응답까지
  const reads = requests.filter((r) => r.scenario === 'reads');
  const readsIn = (from, to) => reads.filter((r) => rel(r.start) >= from && rel(r.start) < to).map((r) => r.blocked + r.duration);
  const ok = claims.filter((r) => r.status === '201');
  const gone = claims.filter((r) => r.status === '409').length;
  const waited = claims.map((r) => r.blocked + r.duration);
  const lastIssue = ok.length ? `${(Math.max(...ok.map((r) => rel(r.end))) / 1000).toFixed(2)}초` : '-';
  console.log(
    `| ${basename(file, '.json.gz')} | ${ok.length} · ${gone} · ${claims.length - ok.length - gone} | ` +
      `${p95(waited)} · ${Math.round(Math.max(...waited))}ms · ${waited.filter((v) => v > 1000).length}명 | ${lastIssue} | ` +
      `${p95(readsIn(-30000, 0))} → ${p95(readsIn(0, burstEnd))} (${(burstEnd / 1000).toFixed(2)}초) → ${p95(readsIn(burstEnd, burstEnd + 30000))} | ${tasks(file, t0)} |`,
  );
}
