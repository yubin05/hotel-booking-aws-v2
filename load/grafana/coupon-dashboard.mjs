// 쿠폰 오픈 실험 관제 대시보드 JSON을 만든다 (Grafana에서 Import, ADR-064). 실행: node load/grafana/coupon-dashboard.mjs
// 지표의 의미를 쉽게 알 수 있도록 제목에 기술 용어를 병기하고 상세 풀이를 ⓘ에 둔다. 순서는 손님이 몰림 → 서버의 반응 → 데이터베이스
// 공유 대시보드는 변수를 못 써서 변수 없이, 회차는 testid 범례로. 입구(ALB)는 날마다 새로 만들어 ID가 바뀌므로 차원 값 '*'
import { writeFileSync } from 'node:fs';

const P = { type: 'prometheus', uid: '${DS_PROMETHEUS}' };
const C = { type: 'cloudwatch', uid: '${DS_CLOUDWATCH}' };
const ecs = { ClusterName: 'hotel-booking-aws-v2', ServiceName: 'app' };
const couponEcs = { ...ecs, ServiceName: 'coupon' };
const db = { DBInstanceIdentifier: 'hotel-booking-aws-v2' };
let id = 0;
const ref = () => String.fromCharCode(65 + (ref.n = (ref.n ?? -1) + 1) % 26);
const prom = (expr, legend) => ({ refId: ref(), datasource: P, expr, legendFormat: legend, range: true });
const cw = (namespace, metricName, dimensions, statistic, period, label) => ({
  refId: ref(), datasource: C, queryMode: 'Metrics', region: 'ap-northeast-2', namespace, metricName, dimensions, statistic,
  period: String(period), matchExact: !Object.values(dimensions).includes('*'), metricQueryType: 0, metricEditorMode: 0, label, id: '', expression: '',
});
// 대상 그룹 ARN의 마지막 ID는 매번 달라진다. 이름 토큰으로 app/coupon을 구분한다.
const healthy = (service) => ({
  refId: ref(), datasource: C, queryMode: 'Metrics', region: 'ap-northeast-2',
  metricQueryType: 0, metricEditorMode: 1, period: '60', id: '',
  expression: `SEARCH('{AWS/ApplicationELB,LoadBalancer,TargetGroup} MetricName="HealthyHostCount" AND TargetGroup=hotel AND TargetGroup=booking AND TargetGroup=${service}', 'Maximum', 60)`,
  label: `${service} 정상 대상 ${"${PROP('Dim.TargetGroup')}"}`,
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
    '**쿠폰 이벤트 부하 실험** · k6 가상 사용자가 선착순 쿠폰 발급을 시도합니다. 규모와 수량은 회차별 기록으로 확인합니다. coupon-video- 회차는 촬영용(손님 1장 선발급)이며 성능 검증 회차와 분리합니다. **① 부하(k6) → ② 앱(ECS·ALB) → ③ DB(RDS)** 순서로 보세요. `No data`는 오류 0건이 아닙니다. 수집 상태와 조회 시간 범위를 확인해야 합니다.\n\n' +
      '용어: **VU** = k6 가상 사용자 · **RPS** = 초당 요청 수 · **ECS 태스크** = 컨테이너 실행 단위(물리 서버 대수가 아님) · **ALB** = 요청 분배기 · **RDS** = 관리형 DB · **p95** = 95%의 요청이 해당 시간 이내에 완료됨 · `coupon-…` = 회차 이름',
    4,
  ),
  row('① 부하 테스트 · k6 (가상 사용자·쿠폰)'),
  stat('쿠폰 발급 성공 (201)', '발급 성공(201) 누적. 100장 회차에서 일반 회차는 100, 촬영 회차는 k6 99 + 실제 손님 1로 검증', 'max by (testid) (k6_coupons_issued_total)'),
  stat('쿠폰 품절 응답 (409 · 정상)', '쿠폰이 다 나간 뒤 받은 "품절" 응답(409) 누적. 정상적인 거절', 'max by (testid) (k6_coupons_sold_out_total)'),
  stat('예상 밖 응답 (오류)', '쿠폰 받음 · 품절 안내가 아닌 응답(오픈 전 거절, 서버 오류, 연결 실패 등) 누적. 0이어야 함', 'max by (testid) (k6_claims_unexpected_total)'),
  stat('가상 사용자 수 (k6 VU)', 'k6가 생성한 가상 사용자(VU) 수. 실제 접속자 수와 다릅니다.', 'max by (testid) (k6_vus)'),
  ts('쿠폰 발급·품절 누적', '받음 · 품절 안내 누적. 100장 실험 기준 점선은 100; 촬영 회차는 k6 발급 99가 기대값. 품절 안내가 오르기 시작한 때가 다 나간 순간', 'none', [
    prom('max by (testid) (k6_coupons_issued_total)', '발급 성공 {{testid}}'),
    prom('max by (testid) (k6_coupons_sold_out_total)', '정상 품절 {{testid}}')], { line: 100 }),
  ts('초당 요청 수 (RPS · k6)', '손님이 1초에 보낸 요청 수(쿠폰 + 같은 때 숙소 조회)', 'reqps', [prom('sum by (testid) (irate(k6_http_reqs_total[10s]))', '{{testid}}')]),
  ts('쿠폰·조회 응답 시간 (p95)', 'p95는 전체 요청의 95%가 이 시간 안에 완료된다는 뜻. 쿠폰은 연결 대기와 응답, 조회는 검색·상세 응답. 1초 구간별 값이므로 전체 회차 p95와 차이가 날 수 있음.', 's', [
    prom('max by (testid) (k6_claim_duration_p95)', '쿠폰 누름 {{testid}}'),
    prom('max by (testid) (k6_http_req_duration_p95{name=~"search|hotel"})', '조회 {{testid}}')], { line: 1 }),
  ts('실패 요청 수 (건/초 · k6)', '정상(200 · 201 · 409) 밖의 응답. 0이어야 함', 'reqps', [prom('sum by (testid) (irate(k6_http_reqs_total{expected_response="false"}[10s]))', '{{testid}}')]),
  row('② 애플리케이션 · ECS / ALB'),
  ts('일반 서버 수 (ECS app)', 'Desired = 목표 태스크, Running = 실제 실행 태스크, ALB Healthy = 트래픽을 받을 준비가 된 정상 대상. 태스크는 물리 서버가 아닌 컨테이너 실행 단위. 1분 단위 관측.', 'none', [
    cw('ECS/ContainerInsights', 'DesiredTaskCount', ecs, 'Average', 60, 'app 목표 태스크 (Desired)'),
    cw('ECS/ContainerInsights', 'RunningTaskCount', ecs, 'Average', 60, 'app 실행 태스크 (Running)'),
    healthy('app')], { line: 4 }),
  ts('일반 서버 CPU·메모리 (ECS app · %)', 'ECS 서비스 CPU 평균, CPU 최대, 메모리 최대 사용률(1분 단위). CPU 최대 · 메모리 최대 = 사용률이 가장 높은 태스크 하나의 값(20초 측정 중 최댓값, ECS 서비스 사용률 문서). 점선은 CPU 60% 스케일링 기준.', 'percent', [
    cw('AWS/ECS', 'CPUUtilization', ecs, 'Average', 60, 'CPU 평균'),
    cw('AWS/ECS', 'CPUUtilization', ecs, 'Maximum', 60, 'CPU 최대'),
    cw('AWS/ECS', 'MemoryUtilization', ecs, 'Maximum', 60, '메모리 최대')], { line: 60 }),
  ts('서비스별 요청·5xx 오류 (1초)', '헬스 체크 제외. 일반 app과 쿠폰 coupon의 요청 및 5xx를 별도 관측. 쿠폰 서버를 끄면 No Data일 수 있음.', 'reqps', [
    cw('HotelBooking/App', 'Requests', { Service: 'app' }, 'Sum', 1, 'app 요청'),
    cw('HotelBooking/App', 'Requests', { Service: 'coupon' }, 'Sum', 1, 'coupon 요청'),
    cw('HotelBooking/App', 'Errors5xx', { Service: 'app' }, 'Sum', 1, 'app 5xx'),
    cw('HotelBooking/App', 'Errors5xx', { Service: 'coupon' }, 'Sum', 1, 'coupon 5xx')]),
  ts('서비스별 응답 시간 (p95 · 1초)', 'app/coupon 각각 서버마다 1초 동안의 p95 중 가장 큰 값. 손님 연결 · 입구를 지나는 시간은 제외. 점선 1초.', 'ms', [
    cw('HotelBooking/App', 'LatencyP95', { Service: 'app' }, 'Maximum', 1, 'app p95'),
    cw('HotelBooking/App', 'LatencyP95', { Service: 'coupon' }, 'Maximum', 1, 'coupon p95')], { line: 1000 }),
  ts('5xx 오류 발생 위치 (ALB / 앱)', 'ALB 자체가 반환한 5xx(예: 502·503·504)와 앱 대상이 반환한 5xx를 구분. ALB 5xx는 0일 때 미보고될 수 있으나 No Data만으로 0건이라고 단정하지 않음. k6 기록과 함께 검증.', 'none', [
    cw('AWS/ApplicationELB', 'HTTPCode_ELB_5XX_Count', { LoadBalancer: '*' }, 'Sum', 60, 'ALB 5xx'),
    cw('AWS/ApplicationELB', 'HTTPCode_Target_5XX_Count', { LoadBalancer: '*' }, 'Sum', 60, '앱 5xx (Target)')], { w: 24, h: 6, noValue: '데이터 없음' }),
  row('③ 데이터베이스 · RDS MySQL'),
  ts('DB CPU 사용률 (RDS · %)', 'RDS MySQL CPU 사용률(CloudWatch 1분 평균).', 'percent', [cw('AWS/RDS', 'CPUUtilization', db, 'Average', 60, 'DB CPU')]),
  ts('DB 연결 수 (RDS)', '서버들이 DB에 열어 둔 연결 수 (1분 최대). 점선 48 = 평소 연결 예산(8대 × 6); 쿠폰 서버를 분리한 이벤트 구성은 별도 연결 예산 확인', 'none', [cw('AWS/RDS', 'DatabaseConnections', db, 'Maximum', 60, '연결')], { line: 48 }),
  row('④ 쿠폰 전용 서버 · ECS / ALB'),
  ts('쿠폰 서버 수 (ECS coupon)', '쿠폰 발급 경로 전용 서비스. Desired/Running/ALB Healthy는 1분 관측이며 지연될 수 있음. 쿠폰 서버를 끄면 No Data.', 'none', [
    cw('ECS/ContainerInsights', 'DesiredTaskCount', couponEcs, 'Average', 60, 'coupon 목표 태스크'),
    cw('ECS/ContainerInsights', 'RunningTaskCount', couponEcs, 'Average', 60, 'coupon 실행 태스크'),
    healthy('coupon')]),
  ts('쿠폰 서버 CPU·메모리 (ECS coupon · %)', '쿠폰 전용 서비스 CPU 평균·최대와 메모리 최대. 이벤트 동안만 사용. 1분 단위.', 'percent', [
    cw('AWS/ECS', 'CPUUtilization', couponEcs, 'Average', 60, 'coupon CPU 평균'),
    cw('AWS/ECS', 'CPUUtilization', couponEcs, 'Maximum', 60, 'coupon CPU 최대'),
    cw('AWS/ECS', 'MemoryUtilization', couponEcs, 'Maximum', 60, 'coupon 메모리 최대')]),
  stat('HTTP 503 (k6 관측 누적)', '조회 구간에 관측된 회차별 k6 503 누적 카운터. 다른 HTTP 요청 샘플이 있을 때만 503 미관측을 0으로 표시하며 No Data와 구분. 최종 수치는 원본 k6 기록으로 확인.',
    'sum by (testid) (max_over_time(k6_http_reqs_total{status="503"}[$__range])) or (0 * sum by (testid) (max_over_time(k6_http_reqs_total[$__range])))'),
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
// QHD OBS 우측 40% 전용: 실제 촬영 화면 기준 그래프 9칸씩, 오류 카드 3칸(총 30칸).
// 상세 관제 패널의 질의·ID를 유지하고 촬영용 화면만 짧은 제목/범례를 사용한다.
const videoSpecs = [
  { source: '초당 요청 수 (RPS · k6)', title: '둘러보는 손님 수(추정)', description: '둘러보기 요청률 × 10초로 추정한 활성 손님 수. 실제 접속자 집계가 아님.', h: 9, legend: false, labels: ['손님'], expr: 'sum by (testid) (rate(k6_http_reqs_total{name=~"browse|warm"}[30s])) * 10', unit: 'none' },
  { source: '쿠폰 서버 수 (ECS coupon)', title: '서버 수', description: '일반·쿠폰 서버의 실행 중인 ECS 태스크 수(1분 관측)', h: 9, legend: true, metric: 'RunningTaskCount', services: ['app', 'coupon'], labels: ['일반 서버', '쿠폰 서버'] },
  { source: '쿠폰·조회 응답 시간 (p95)', title: '응답 시간 (Latency · p95)', description: '낮을수록 좋음. 쿠폰/일반 요청의 시점별 p95 최댓값(겹친 회차 포함). k6 밖의 요청 제외.', h: 9, legend: true, labels: ['쿠폰', '일반 요청'],
    exprs: ['max(k6_claim_duration_p95)', 'max(k6_http_req_duration_p95{name=~"register|search|hotel|warm|my-coupons|booking"})'] },
  { source: 'HTTP 503 (k6 관측 누적)', title: 'HTTP 503 오류', description: 'k6 503 누적 관측. 미수집은 0건이 아님.', h: 3, labels: ['오류'] },
];
let videoY = 0;
const videoPanels = videoSpecs.map((spec) => {
  const source = panels.find((p) => p.title === spec.source);
  if (!source) throw new Error(`촬영 패널 없음: ${spec.source}`);
  const panel = structuredClone(source);
  panel.title = spec.title;
  panel.description = spec.description;
  panel.gridPos = { x: 0, y: videoY, w: 24, h: spec.h };
  videoY += spec.h;
  if (spec.metric) panel.targets = panel.targets.filter((target) => target.metricName === spec.metric);
  if (spec.expr) panel.targets[0].expr = spec.expr;
  if (spec.unit) Object.assign(panel.fieldConfig.defaults, { unit: spec.unit, decimals: 0 });
  if (spec.services) {
    const target = panel.targets[0];
    panel.targets = spec.services.map((service, i) => ({
      ...target, refId: String.fromCharCode(65 + i), dimensions: { ...target.dimensions, ServiceName: service },
    }));
  }
  if (panel.targets.length !== spec.labels.length) throw new Error(`촬영 범례 불일치: ${spec.title}`);
  panel.targets.forEach((target, i) => {
    if (spec.exprs?.[i]) target.expr = spec.exprs[i];
    if ('legendFormat' in target) target.legendFormat = spec.labels[i];
    if ('label' in target) target.label = spec.labels[i];
  });
  if (panel.type === 'timeseries') {
    panel.options.legend.showLegend = spec.legend;
  } else if (panel.type === 'stat') {
    panel.fieldConfig.defaults = {
      ...panel.fieldConfig.defaults,
      noValue: 'No Data', color: { mode: 'thresholds' },
      thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 1 }] },
    };
    panel.options = { ...panel.options, colorMode: 'value', textMode: 'value' };
  }
  return panel;
});
const videoDash = {
  ...dash, title: 'Cloud Lab · 쿠폰 이벤트 관제', uid: 'cloudlab-coupon-video',
  tags: ['cloud-lab', 'k6', 'video-demo'], refresh: '5s', time: { from: 'now-5m', to: 'now' },
  panels: videoPanels,
};
writeFileSync(new URL('./coupon-video-dashboard.json', import.meta.url), JSON.stringify(videoDash, null, 2));
console.log(`패널 ${panels.length}개 · 촬영용 ${videoPanels.length}개`);
