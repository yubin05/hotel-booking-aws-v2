// 3단계 k6 회차 폴더 하나를 포트폴리오 재생 페이지(클라우드 실험실)용 JSON 하나로 만든다 (ADR-063)
// 실행: node scripts/replay-data.mjs load/results/<회차 폴더> <출력.json> [묶는 초, 기본 5]
// 원칙: 측정 사이 값을 만들지 않는다. 시리즈마다 원래 간격(step, 초)을 적고, 화면은 그 간격의 계단으로 그린다.
//   k6: 요청 시작 시각(연결 대기 포함)으로 묶는 초마다 요청 수 · 에러율 · p95(연결 대기 + 응답). baseline-report.mjs와 같은 정의
//   CloudWatch 1초(앱 EMF) · 1분(ECS · RDS · Container Insights)은 받은 점 그대로. 1분 값의 시각은 구간 시작
//   tasks.log(5초 + α 관측)는 관측 시각 그대로
// 계정 번호 · ARN · 이미지 주소는 넣지 않는다(공개 사이트). 사건 문구는 원문 대신 짧은 한국어로 만든다
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pct, readK6 } from './k6-lib.mjs';

const [dir, out, stepArg] = process.argv.slice(2);
assert.ok(dir && out, '사용: node scripts/replay-data.mjs <회차 폴더> <출력.json> [묶는 초]');
const STEP = Number(stepArg ?? 5);
const OK = ['200', '201', '409']; // baseline-report.mjs와 같음: 409(이미 예약된 날짜)는 정상 거절
const name = basename(dir);
const json = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);

const { requests, points } = await readK6(join(dir, `${name}.json.gz`));
assert.ok(requests.length > 0, '요청 기록이 없다');
const t0 = points.vus.reduce((m, p) => Math.min(m, p.time), Infinity); // 요청이 수십만 개라 펼쳐 넘기면 스택이 넘침
const t1 = requests.reduce((m, r) => Math.max(m, r.end), 0);
const sec = (ms) => Math.round((ms - t0) / 100) / 10; // t0부터 초 (0.1초 단위)

// k6: 묶는 초마다
const bins = new Map();
for (const r of requests) {
  const b = Math.floor((r.start - t0) / 1000 / STEP);
  (bins.get(b) ?? bins.set(b, []).get(b)).push(r);
}
const keys = [...bins.keys()].sort((a, b) => a - b);
assert.equal(keys.reduce((n, k) => n + bins.get(k).length, 0), requests.length, '묶은 요청 수가 전체와 다르다');
const k6 = (f) => keys.map((k) => [k * STEP, f(bins.get(k))]);
const vus = [];
for (const p of [...points.vus].sort((a, b) => a.time - b.time)) {
  const s = Math.floor(sec(p.time) / STEP) * STEP;
  if (vus.at(-1)?.[0] === s) vus.at(-1)[1] = p.value; // 그 구간의 마지막 관측
  else vus.push([s, p.value]);
}

const series = [
  { id: 'vus', label: 'k6 가상 사용자', unit: '명', source: 'k6', step: STEP, points: vus },
  { id: 'rps', label: '요청 수 (손님 쪽)', unit: '건/초', source: 'k6', step: STEP, points: k6((rs) => +(rs.length / STEP).toFixed(1)) },
  { id: 'err', label: '에러율 (손님 쪽)', unit: '%', source: 'k6', step: STEP, points: k6((rs) => +((100 * rs.filter((r) => !OK.includes(r.status)).length) / rs.length).toFixed(2)) },
  { id: 'p95', label: '응답 p95 (손님 쪽)', unit: 'ms', source: 'k6', step: STEP, points: k6((rs) => Math.round(pct(rs.map((r) => r.blocked + r.duration), 0.95))) },
];

// CloudWatch: Id → [초, 값] (받은 점 그대로, 시각순)
const cw = (file, step, defs) => {
  const j = json(file);
  if (!j) return;
  const byId = Object.fromEntries(j.MetricDataResults.map((m) => [m.Id, m]));
  for (const [id, label, unit, sid = id] of defs) {
    const m = byId[id];
    if (!m?.Values.length) continue;
    const pts = m.Timestamps.map((t, i) => [sec(Date.parse(t)), +m.Values[i].toFixed(1)]).sort((a, b) => a[0] - b[0]);
    series.push({ id: sid, label, unit, source: `cloudwatch-${step}s`, step, points: pts.filter(([s]) => s >= -step && s <= sec(t1) + step) });
  }
};
cw('cw-1s.json', 1, [
  ['requests', '요청 수 (서버, 앱 1초 지표)', '건/초', 'srv_rps'],
  ['errors5xx', '5xx (서버)', '건/초', 'srv_5xx'],
  ['p95', '응답 p95 (서버, 가장 느린 태스크)', 'ms', 'srv_p95'],
]);
cw('cw.json', 60, [
  ['ecs_cpu_avg', '태스크 CPU 평균', '%'],
  ['ecs_cpu_max', '가장 바쁜 태스크 CPU', '%'],
  ['ecs_mem_max', '가장 바쁜 태스크 메모리', '%'],
  ['healthy', 'ALB 정상 태스크', '개'],
  ['rds_cpu', 'RDS CPU', '%'],
  ['rds_conn', 'RDS 연결 수', '개'],
  ['ci_desired', '목표 태스크 (Container Insights)', '개'],
  ['ci_running', '실행 태스크 (Container Insights)', '개'],
]);

// tasks.log: <유닉스 초> <시각> <목표> <실행> <대기> | error
if (existsSync(join(dir, 'tasks.log'))) {
  const rows = readFileSync(join(dir, 'tasks.log'), 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/)).filter((c) => c.length === 5);
  for (const [i, id, label] of [[2, 'desired', '목표 태스크'], [3, 'running', '실행 태스크'], [4, 'pending', '시작 중 태스크']]) {
    series.push({ id, label, unit: '개', source: 'ecs-describe', step: 5, points: rows.map((c) => [sec(Number(c[0]) * 1000), Number(c[i])]) });
  }
}

// 사건: 스케일링 결정(이유 포함) · ECS 이벤트(태스크 시작 · ALB 등록 · 줄임). 창 밖은 버림
const events = [];
const inWindow = (ms) => ms >= t0 - 60_000 && ms <= t1 + 60_000;
for (const a of json('scaling.json')?.ScalingActivities ?? []) {
  const t = Date.parse(a.StartTime);
  if (!inWindow(t)) continue;
  const to = a.Description.match(/desired count to (\d+)/)?.[1];
  const why = /AlarmHigh/.test(a.Cause) ? 'CPU 60% 넘음' : /AlarmLow/.test(a.Cause) ? 'CPU 낮음' : /scheduled/i.test(a.Cause) ? '예약' : '기타';
  if (a.NotScaledReasons?.length) events.push({ t: sec(t), kind: 'not-scaled', text: `안 늘림: ${a.NotScaledReasons.map((r) => r.Code).join(', ')} (${why})` });
  else if (to) events.push({ t: sec(t), kind: 'scale', text: `목표 태스크 → ${to} (${why})` });
}
for (const e of json('ecs-service.json')?.services?.[0]?.events ?? []) {
  const t = Date.parse(e.createdAt);
  if (!inWindow(t)) continue;
  const n = e.message.match(/(?:started|stopped|registered|deregistered) (\d+)/)?.[1] ?? '';
  if (/has started/.test(e.message)) events.push({ t: sec(t), kind: 'task-start', text: `태스크 ${n}개 시작` });
  else if (/deregistered/.test(e.message)) events.push({ t: sec(t), kind: 'task-out', text: `ALB에서 ${n}개 뺌` });
  else if (/registered/.test(e.message)) events.push({ t: sec(t), kind: 'task-ready', text: `ALB에 ${n}개 등록 (손님 받기 시작)` });
  else if (/has stopped/.test(e.message)) events.push({ t: sec(t), kind: 'task-stop', text: `태스크 ${n}개 멈춤` });
}
events.sort((a, b) => a.t - b.t);

// 층별 요약: VU가 30초 넘게 그대로인 구간 (baseline-report.mjs와 같은 방식 · 같은 숫자)
const sorted = [...points.vus].sort((a, b) => a.time - b.time);
const floors = [];
for (let i = 0; i < sorted.length; ) {
  let j = i;
  while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;
  if (sorted[i].value > 0 && (sorted[j].time - sorted[i].time) / 1000 >= 30) {
    const rs = requests.filter((r) => r.start >= sorted[i].time && r.start < sorted[j].time);
    floors.push({
      vus: sorted[i].value, from: sec(sorted[i].time), to: sec(sorted[j].time), requests: rs.length,
      rps: +(rs.length / ((sorted[j].time - sorted[i].time) / 1000)).toFixed(1),
      errPct: +((100 * rs.filter((r) => !OK.includes(r.status)).length) / rs.length).toFixed(2),
      p95: Math.round(pct(rs.map((r) => r.blocked + r.duration), 0.95)),
    });
  }
  i = j + 1;
}

const td = json('task-def.json');
const doc = {
  id: name,
  kind: name.startsWith('coupon-') ? 'coupon' : 'baseline',
  measuredAt: new Date(t0).toISOString(),
  duration: sec(t1),
  conditions: { task: td ? `${td.cpu / 1024} vCPU · ${td.memory / 1024}GB` : null, imageTag: td?.image.split(':').pop() ?? null, infraCommit: existsSync(join(dir, 'commit.txt')) ? readFileSync(join(dir, 'commit.txt'), 'utf8').split('\n')[0].slice(0, 7) : null },
  series,
  events,
  summary: { requests: requests.length, floors },
};
writeFileSync(out, JSON.stringify(doc));
console.log(`${out}: ${(JSON.stringify(doc).length / 1024).toFixed(0)}KB, 시리즈 ${series.length}개, 사건 ${events.length}개, 층 ${floors.length}개`);
for (const f of floors) console.log(`  ${f.vus}명 ${f.rps}건/초 에러 ${f.errPct}% p95 ${f.p95}ms`);
