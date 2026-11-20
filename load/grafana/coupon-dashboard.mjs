// 쿠폰 오픈 실험 관제 대시보드 JSON을 만든다 (Grafana에서 Import, ADR-064). 실행: node load/grafana/coupon-dashboard.mjs
// 처음 보는 사람도 읽게 제목은 쉬운 말, IT 용어는 설명(ⓘ)에. 순서는 손님이 몰림 → 서버의 반응 → 데이터베이스
// 공유 대시보드는 변수를 못 써서 변수 없이, 회차는 testid 범례로. 입구(ALB)는 날마다 새로 만들어 ID가 바뀌므로 차원 값 '*'
import { writeFileSync } from 'node:fs';

const P = { type: 'prometheus', uid: '${DS_PROMETHEUS}' };
const C = { type: 'cloudwatch', uid: '${DS_CLOUDWATCH}' };
const ecs = { ClusterName: 'hotel-booking-aws-v2', ServiceName: 'app' };
const db = { DBInstanceIdentifier: 'hotel-booking-aws-v2' };
let id = 0;
const ref = () => String.fromCharCode(65 + (ref.n = (ref.n ?? -1) + 1) % 26);
const prom = (expr, legend) => ({ refId: ref(), datasource: P, expr, legendFormat: legend, range: true });
const cw = (namespace, metricName, dimensions, statistic, period, label) => ({
  refId: ref(), datasource: C, queryMode: 'Metrics', region: 'ap-northeast-2', namespace, metricName, dimensions, statistic,
  period: String(period), matchExact: !Object.values(dimensions).includes('*'), metricQueryType: 0, metricEditorMode: 0, label, id: '', expression: '',
});
const thresholds = (v) => ({ mode: 'absolute', steps: [{ color: 'transparent', value: null }, ...(v == null ? [] : [{ color: 'orange', value: v }])] });
const ts = (title, description, unit, targets, { w = 12, h = 8, line, noValue } = {}) => ({
  id: ++id, type: 'timeseries', title, description, gridPos: { w, h }, datasource: targets[0].datasource, targets,
  fieldConfig: {
    defaults: { unit, min: 0, noValue, thresholds: thresholds(line),
      custom: { lineWidth: 2, fillOpacity: 0, showPoints: 'never', spanNulls: false, lineInterpolation: 'stepAfter', thresholdsStyle: { mode: line == null ? 'off' : 'dashed' } } },
    overrides: [],
  },
  options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi', sort: 'none' } },
});
const stat = (title, description, expr) => ({
  id: ++id, type: 'stat', title, description, gridPos: { w: 6, h: 4 }, datasource: P, targets: [prom(expr, '{{testid}}')],
  fieldConfig: { defaults: { unit: 'none', decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'text', value: null }] } }, overrides: [] },
  options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'none', graphMode: 'none', textMode: 'value_and_name', justifyMode: 'auto' },
});
const row = (title) => ({ id: ++id, type: 'row', title, collapsed: false, gridPos: { w: 24, h: 1 }, panels: [] });
const text = (content, h) => ({ id: ++id, type: 'text', title: '', gridPos: { w: 24, h }, options: { mode: 'markdown', content } });

const panels = [
  text(
    '**선착순 쿠폰 오픈 실험** · 정해진 시각에 손님 1,000명이 쿠폰 100장을 동시에 누릅니다. 위에서 아래로 **① 손님이 몰림 → ② 서버의 반응 → ③ 데이터베이스** 순서로 읽습니다. 그래프가 비어 있으면 지금 실험하지 않는 것입니다.\n\n' +
      '용어: **서버** = 앱이 도는 컴퓨터 한 대(AWS ECS Fargate 태스크) · **입구** = 손님 요청을 서버들에 나눠 주는 곳(ALB) · **데이터베이스** = 예약 · 쿠폰이 저장되는 곳(RDS MySQL) · **느린 쪽 5% 시간**(p95) = 100명 중 95번째로 오래 기다린 사람의 시간 · 범례의 `coupon-…` = 회차 이름',
    4,
  ),
  row('① 손님이 몰림 (부하 도구 k6가 1초마다 보냄)'),
  stat('쿠폰 받음', '발급 성공(201) 누적. 100이 넘으면 초과 발급(실패)', 'max by (testid) (k6_coupons_issued_total)'),
  stat('품절 안내 (정상)', '쿠폰이 다 나간 뒤 받은 "품절" 응답(409) 누적. 정상적인 거절', 'max by (testid) (k6_coupons_sold_out_total)'),
  stat('실패', '쿠폰 받음 · 품절 안내가 아닌 응답(오픈 전 거절, 서버 오류, 연결 실패 등) 누적. 0이어야 함', 'max by (testid) (k6_claims_unexpected_total)'),
  stat('가상 손님 수', '부하 도구(k6)가 흉내 내는 손님(VU) 수, 지금 값', 'max by (testid) (k6_vus)'),
  ts('쿠폰이 나간 순간', '받음 · 품절 안내 누적. 받음이 100(점선)에서 멈춰야 정상. 품절 안내가 오르기 시작한 때가 다 나간 순간', 'none', [
    prom('max by (testid) (k6_coupons_issued_total)', '받음 {{testid}}'),
    prom('max by (testid) (k6_coupons_sold_out_total)', '품절 안내 {{testid}}')], { line: 100 }),
  ts('초당 요청 수 (손님 쪽)', '손님이 1초에 보낸 요청 수(쿠폰 + 같은 때 숙소 조회)', 'reqps', [prom('sum by (testid) (irate(k6_http_reqs_total[10s]))', '{{testid}}')]),
  ts('손님 대기 시간 (느린 쪽 5%)', 'p95. 쿠폰 누름 = 연결 대기 + 응답, 조회 = 숙소 검색 · 상세. 점선 1초 = 판정 기준. 1초 묶음마다 계산해 회차 보고서(요청 원본)와 조금 다를 수 있음', 's', [
    prom('max by (testid) (k6_claim_duration_p95)', '쿠폰 누름 {{testid}}'),
    prom('max by (testid) (k6_http_req_duration_p95{name=~"search|hotel"})', '조회 {{testid}}')], { line: 1 }),
  ts('실패한 요청 (초당)', '정상(200 · 201 · 409) 밖의 응답. 0이어야 함', 'reqps', [prom('sum by (testid) (irate(k6_http_reqs_total{expected_response="false"}[10s]))', '{{testid}}')]),
  row('② 서버의 반응 (AWS)'),
  ts('서버 대수', '목표 = 오토스케일링이 정한 대수, 실행 = 실제로 켜진 대수(ECS Container Insights), 손님 받는 중 = 입구(ALB)가 정상으로 본 대수. 켜진 뒤 손님을 받기까지 수십 초 걸림. 점선 = 최대 4대. 1분 값이라 몇 초짜리 쏠림 안의 변화는 안 보임', 'none', [
    cw('ECS/ContainerInsights', 'DesiredTaskCount', ecs, 'Average', 60, '목표'),
    cw('ECS/ContainerInsights', 'RunningTaskCount', ecs, 'Average', 60, '실행'),
    cw('AWS/ApplicationELB', 'HealthyHostCount', { TargetGroup: '*', LoadBalancer: '*' }, 'Maximum', 60, '손님 받는 중')], { line: 4 }),
  ts('서버 바쁨 정도', 'CPU 평균(오토스케일링이 보는 값, 점선 60%를 3분 넘으면 서버를 늘림) · 가장 바쁜 서버의 CPU · 가장 바쁜 서버의 메모리 (1분 값)', 'percent', [
    cw('AWS/ECS', 'CPUUtilization', ecs, 'Average', 60, 'CPU 평균'),
    cw('AWS/ECS', 'CPUUtilization', ecs, 'Maximum', 60, '가장 바쁜 서버 CPU'),
    cw('AWS/ECS', 'MemoryUtilization', ecs, 'Maximum', 60, '가장 바쁜 서버 메모리')], { line: 60 }),
  ts('서버가 받은 요청 · 서버 오류 (1초)', '앱이 1초마다 직접 남기는 값(헬스 체크 제외). 서버 오류 = 5xx', 'reqps', [
    cw('HotelBooking/App', 'Requests', { Service: 'app' }, 'Sum', 1, '받은 요청'),
    cw('HotelBooking/App', 'Errors5xx', { Service: 'app' }, 'Sum', 1, '서버 오류')]),
  ts('서버 응답 시간 (느린 쪽 5%, 1초)', '서버마다 1초 동안의 p95 중 가장 큰 값. 손님 대기 시간과 달리 연결 · 입구를 지나는 시간은 빠짐. 점선 1초', 'ms', [
    cw('HotelBooking/App', 'LatencyP95', { Service: 'app' }, 'Maximum', 1, '느린 쪽 5%')], { line: 1000 }),
  ts('오류가 난 곳 (1분)', '입구 오류 = 받을 서버가 없거나 서버가 응답하지 못해 입구(ALB)가 대신 낸 502 · 503 · 504. 서버 오류 = 서버가 낸 5xx. 오류가 없으면 비어 보임', 'none', [
    cw('AWS/ApplicationELB', 'HTTPCode_ELB_5XX_Count', { LoadBalancer: '*' }, 'Sum', 60, '입구 오류'),
    cw('AWS/ApplicationELB', 'HTTPCode_Target_5XX_Count', { LoadBalancer: '*' }, 'Sum', 60, '서버 오류')], { w: 24, h: 6, noValue: '오류 없음' }),
  row('③ 데이터베이스 (AWS RDS MySQL)'),
  ts('데이터베이스 바쁨 정도', 'DB 서버 CPU (1분 값). 오늘 k6 3,000명에서도 43%', 'percent', [cw('AWS/RDS', 'CPUUtilization', db, 'Average', 60, 'DB CPU')]),
  ts('데이터베이스 연결 수', '서버들이 DB에 열어 둔 연결 수 (1분 최대). 점선 48 = 서버 4대 × 12개, 우리가 정한 상한', 'none', [cw('AWS/RDS', 'DatabaseConnections', db, 'Maximum', 60, '연결')], { line: 48 }),
];

// 자리 배치: 왼쪽부터 채우고 넘치면 다음 줄
let x = 0, y = 0, rowH = 0;
for (const p of panels) {
  const { w, h } = p.gridPos;
  if (x + w > 24) { y += rowH; x = 0; rowH = 0; }
  Object.assign(p.gridPos, { x, y });
  x += w;
  rowH = Math.max(rowH, h);
  if (x >= 24) { y += rowH; x = 0; rowH = 0; }
}
const dash = {
  __inputs: [
    { name: 'DS_PROMETHEUS', label: 'Prometheus (k6)', description: 'Grafana Cloud 스택의 Prometheus', type: 'datasource', pluginId: 'prometheus', pluginName: 'Prometheus' },
    { name: 'DS_CLOUDWATCH', label: 'CloudWatch', description: 'Grafana Assume Role로 만든 CloudWatch', type: 'datasource', pluginId: 'cloudwatch', pluginName: 'CloudWatch' },
  ],
  title: 'Cloud Lab · 쿠폰 오픈 실험 관제', uid: 'cloudlab-coupon', tags: ['cloud-lab', 'k6'], timezone: 'browser',
  editable: true, schemaVersion: 39, refresh: '10s', time: { from: 'now-30m', to: 'now' },
  templating: { list: [] }, annotations: { list: [] }, panels,
};
writeFileSync(new URL('./coupon-dashboard.json', import.meta.url), JSON.stringify(dash, null, 2));
console.log(`패널 ${panels.length}개`);
