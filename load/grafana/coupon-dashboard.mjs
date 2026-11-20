// 쿠폰 오픈 실험 관제 대시보드 JSON을 만든다 (Grafana에서 Import, ADR-064). 실행: node load/grafana/coupon-dashboard.mjs
// 지표의 의미를 쉽게 알 수 있도록 제목에 기술 용어를 병기하고 상세 풀이를 ⓘ에 둔다. 순서는 손님이 몰림 → 서버의 반응 → 데이터베이스
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
    '**쿠폰 이벤트 부하 실험** · 가상 사용자 1,000명(k6)이 선착순 쿠폰 100장 발급을 시도합니다. **① 부하(k6) → ② 앱(ECS·ALB) → ③ DB(RDS)** 순서로 보세요. `No data`는 오류 0건이 아닙니다. 수집 상태와 조회 시간 범위를 확인해야 합니다.\n\n' +
      '용어: **VU** = k6 가상 사용자 · **RPS** = 초당 요청 수 · **ECS 태스크** = 컨테이너 실행 단위(물리 서버 대수가 아님) · **ALB** = 요청 분배기 · **RDS** = 관리형 DB · **p95** = 95%의 요청이 해당 시간 이내에 완료됨 · `coupon-…` = 회차 이름',
    4,
  ),
  row('① 부하 테스트 · k6 (가상 사용자·쿠폰)'),
  stat('쿠폰 발급 성공 (201)', '발급 성공(201) 누적. 100이 넘으면 초과 발급(실패)', 'max by (testid) (k6_coupons_issued_total)'),
  stat('쿠폰 품절 응답 (409 · 정상)', '쿠폰이 다 나간 뒤 받은 "품절" 응답(409) 누적. 정상적인 거절', 'max by (testid) (k6_coupons_sold_out_total)'),
  stat('예상 밖 응답 (오류)', '쿠폰 받음 · 품절 안내가 아닌 응답(오픈 전 거절, 서버 오류, 연결 실패 등) 누적. 0이어야 함', 'max by (testid) (k6_claims_unexpected_total)'),
  stat('가상 사용자 수 (k6 VU)', 'k6가 생성한 가상 사용자(VU) 수. 실제 접속자 수와 다릅니다.', 'max by (testid) (k6_vus)'),
  ts('쿠폰 발급·품절 누적', '받음 · 품절 안내 누적. 받음이 100(점선)에서 멈춰야 정상. 품절 안내가 오르기 시작한 때가 다 나간 순간', 'none', [
    prom('max by (testid) (k6_coupons_issued_total)', '발급 성공 {{testid}}'),
    prom('max by (testid) (k6_coupons_sold_out_total)', '정상 품절 {{testid}}')], { line: 100 }),
  ts('초당 요청 수 (RPS · k6)', '손님이 1초에 보낸 요청 수(쿠폰 + 같은 때 숙소 조회)', 'reqps', [prom('sum by (testid) (irate(k6_http_reqs_total[10s]))', '{{testid}}')]),
  ts('쿠폰·조회 응답 시간 (p95)', 'p95는 전체 요청의 95%가 이 시간 안에 완료된다는 뜻. 쿠폰은 연결 대기와 응답, 조회는 검색·상세 응답. 1초 구간별 값이므로 전체 회차 p95와 차이가 날 수 있음.', 's', [
    prom('max by (testid) (k6_claim_duration_p95)', '쿠폰 누름 {{testid}}'),
    prom('max by (testid) (k6_http_req_duration_p95{name=~"search|hotel"})', '조회 {{testid}}')], { line: 1 }),
  ts('실패 요청 수 (건/초 · k6)', '정상(200 · 201 · 409) 밖의 응답. 0이어야 함', 'reqps', [prom('sum by (testid) (irate(k6_http_reqs_total{expected_response="false"}[10s]))', '{{testid}}')]),
  row('② 애플리케이션 · ECS / ALB'),
  ts('서버 수 (ECS 태스크)', 'Desired = 목표 태스크, Running = 실제 실행 태스크, ALB Healthy = 트래픽을 받을 준비가 된 정상 대상. 태스크는 물리 서버가 아닌 컨테이너 실행 단위. 1분 단위 관측.', 'none', [
    cw('ECS/ContainerInsights', 'DesiredTaskCount', ecs, 'Average', 60, '목표 태스크 (Desired)'),
    cw('ECS/ContainerInsights', 'RunningTaskCount', ecs, 'Average', 60, '실행 태스크 (Running)'),
    cw('AWS/ApplicationELB', 'HealthyHostCount', { TargetGroup: '*', LoadBalancer: '*' }, 'Maximum', 60, '정상 대상 (ALB Healthy)')], { line: 4 }),
  ts('CPU·메모리 사용률 (ECS · %)', 'ECS 서비스 CPU 평균, CPU 최대, 메모리 최대 사용률(1분 단위). 최대 통계값을 개별 태스크의 실측 사용률과 동일시하면 안 됨. 점선은 CPU 60% 스케일링 기준.', 'percent', [
    cw('AWS/ECS', 'CPUUtilization', ecs, 'Average', 60, 'CPU 평균'),
    cw('AWS/ECS', 'CPUUtilization', ecs, 'Maximum', 60, 'CPU 최대'),
    cw('AWS/ECS', 'MemoryUtilization', ecs, 'Maximum', 60, '메모리 최대')], { line: 60 }),
  ts('앱 요청·5xx 오류 (1초)', '앱이 1초마다 직접 남기는 값(헬스 체크 제외). 서버 오류 = 5xx', 'reqps', [
    cw('HotelBooking/App', 'Requests', { Service: 'app' }, 'Sum', 1, '받은 요청'),
    cw('HotelBooking/App', 'Errors5xx', { Service: 'app' }, 'Sum', 1, '서버 오류')]),
  ts('앱 응답 시간 (p95 · 1초)', '서버마다 1초 동안의 p95 중 가장 큰 값. 손님 대기 시간과 달리 연결 · 입구를 지나는 시간은 빠짐. 점선 1초', 'ms', [
    cw('HotelBooking/App', 'LatencyP95', { Service: 'app' }, 'Maximum', 1, '앱 p95')], { line: 1000 }),
  ts('5xx 오류 발생 위치 (ALB / 앱)', 'ALB 자체가 반환한 5xx(예: 502·503·504)와 앱 대상이 반환한 5xx를 구분. No data는 오류 0건이 아니라 조회된 데이터가 없다는 뜻.', 'none', [
    cw('AWS/ApplicationELB', 'HTTPCode_ELB_5XX_Count', { LoadBalancer: '*' }, 'Sum', 60, 'ALB 5xx'),
    cw('AWS/ApplicationELB', 'HTTPCode_Target_5XX_Count', { LoadBalancer: '*' }, 'Sum', 60, '서버 오류')], { w: 24, h: 6, noValue: '데이터 없음' }),
  row('③ 데이터베이스 · RDS MySQL'),
  ts('DB CPU 사용률 (RDS · %)', 'RDS MySQL CPU 사용률(CloudWatch 1분 평균).', 'percent', [cw('AWS/RDS', 'CPUUtilization', db, 'Average', 60, 'DB CPU')]),
  ts('DB 연결 수 (RDS)', '서버들이 DB에 열어 둔 연결 수 (1분 최대). 점선 48 = 서버 4대 × 12개, 우리가 정한 상한', 'none', [cw('AWS/RDS', 'DatabaseConnections', db, 'Maximum', 60, '연결')], { line: 48 }),
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
