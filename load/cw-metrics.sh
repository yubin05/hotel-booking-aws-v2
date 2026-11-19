#!/usr/bin/env bash
# 3단계 k6(baseline-aws-*) 동안의 서울 서버 지표를 CloudWatch에서 1분 단위로 받아 결과 폴더에 cw.json으로 둔다 (migration.md 2 · 4절)
# 같이 받는 것: cw-1s.json(앱 1초) · scaling.json(스케일링 결정) · ecs-service.json(ECS 이벤트) · task-def.json(태스크 크기) · commit.txt
# baseline-report.mjs가 cw.json을 보면 층마다 붙인다. 1분 지표는 15일 남지만, ALB · 대상 그룹의 지표 차원(이름/id)은
# 서울이 떠 있을 때만 찾을 수 있어 서울 destroy 전에 실행. 관리자 로그인 필요(평소 정책에 CloudWatch 읽기 없음)
#   bash load/cw-metrics.sh load/results/<회차 폴더>...   회차가 끝날 때마다 (1초 지표는 3시간만 남음)
# ECS 평균 = 서비스 전체 사용량 ÷ 예약량(목표 추적이 보는 값), 최대 = 가장 바쁜 태스크 하나 (ECS 서비스 사용률 문서)
set -Eeuo pipefail
[ $# -gt 0 ] || { echo '사용: bash load/cw-metrics.sh load/results/baseline-aws-*' >&2; exit 1; }
export MSYS_NO_PATHCONV=1
source "$(dirname "$0")/../migration/lib.sh" # admin() · CLUSTER

lb=$(admin elbv2 describe-load-balancers --names "$CLUSTER" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
tg=$(admin elbv2 describe-target-groups --names "$CLUSTER-app" --query 'TargetGroups[0].TargetGroupArn' --output text)
LB=${lb#*:loadbalancer/} # 지표 차원 모양: app/<이름>/<id>
TG=${tg##*:}             # targetgroup/<이름>/<id>
dim() { printf '{"Name":"%s","Value":"%s"}' "$1" "$2"; }
ECS="[$(dim ClusterName "$CLUSTER"),$(dim ServiceName app)]"
ALB="[$(dim LoadBalancer "$LB")]"
ALB_TG="[$(dim TargetGroup "$TG"),$(dim LoadBalancer "$LB")]"
RDS="[$(dim DBInstanceIdentifier "$CLUSTER")]"
q() { # Id 이름공간 지표 통계 차원 [주기, 기본 60초]
  printf '{"Id":"%s","MetricStat":{"Metric":{"Namespace":"%s","MetricName":"%s","Dimensions":%s},"Period":%s,"Stat":"%s"}}' "$1" "$2" "$3" "$5" "${6:-60}" "$4"
}
# 앱이 EMF로 남기는 1초 지표 (ADR-061). 1초 데이터는 3시간만 남아 회차가 끝날 때마다 받아 둔다 (한 화면 페이지용)
APP_DIM="[$(dim Service app)]"
fast="[$(q requests HotelBooking/App Requests Sum "$APP_DIM" 1),$(q errors5xx HotelBooking/App Errors5xx Sum "$APP_DIM" 1),$(q p95 HotelBooking/App LatencyP95 Maximum "$APP_DIM" 1)]"
queries="[$(q ecs_cpu_avg AWS/ECS CPUUtilization Average "$ECS"),$(q ecs_cpu_max AWS/ECS CPUUtilization Maximum "$ECS"),\
$(q ecs_mem_avg AWS/ECS MemoryUtilization Average "$ECS"),$(q ecs_mem_max AWS/ECS MemoryUtilization Maximum "$ECS"),\
$(q healthy AWS/ApplicationELB HealthyHostCount Maximum "$ALB_TG"),$(q alb_5xx AWS/ApplicationELB HTTPCode_Target_5XX_Count Sum "$ALB"),\
$(q rds_cpu AWS/RDS CPUUtilization Average "$RDS"),$(q rds_conn AWS/RDS DatabaseConnections Maximum "$RDS"),\
$(q rds_freemem AWS/RDS FreeableMemory Minimum "$RDS"),$(q rds_credit AWS/RDS CPUCreditBalance Minimum "$RDS")]"

for d in "$@"; do
  n=$(basename "$d")
  ts=$(grep -oE '[0-9]{8}-[0-9]{6}$' <<<"$n") # 이름 끝의 시작 시각 YYYYmmdd-HHMMSS (한국 시간, baseline-aws-* · coupon-*)
  s=$(date -d "${ts:0:8} ${ts:9:2}:${ts:11:2}:${ts:13:2}" +%s)
  echo "$queries" >"$d/cw-queries.json"
  # 시험 37분 + 앞뒤 여유. "+45 minutes"는 시간대로 읽히는 함정이 있어 초로 계산
  admin cloudwatch get-metric-data --metric-data-queries "file://$d/cw-queries.json" \
    --start-time "$(date -u -d "@$((s - 120))" +%FT%TZ)" --end-time "$(date -u -d "@$((s + 2700))" +%FT%TZ)" --output json >"$d/cw.json"
  # 재생 화면용 태스크 수 · 사건 시각: Container Insights를 켜지 않아 CloudWatch에 태스크 수 지표가 없다. 원본 그대로 두고 구간은 변환 때 고름
  admin application-autoscaling describe-scaling-activities --service-namespace ecs --resource-id "service/$CLUSTER/app" \
    --include-not-scaled-activities --output json >"$d/scaling.json" # 늘리기 · 줄이기 결정 시각 · 이유(안 늘린 이유 포함), 6주 보관
  admin ecs describe-services --cluster "$CLUSTER" --services app --output json >"$d/ecs-service.json" # 최근 이벤트 100개(태스크 시작 · 대상 등록 시각)
  td=$(admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].taskDefinition' --output text)
  admin ecs describe-task-definition --task-definition "$td" \
    --query 'taskDefinition.{arn:taskDefinitionArn,cpu:cpu,memory:memory,image:containerDefinitions[0].image}' --output json >"$d/task-def.json"
  { git -C "$(dirname "$0")/.." rev-parse HEAD; git -C "$(dirname "$0")/.." status --short; } >"$d/commit.txt" # 인프라 코드 · 안 올린 변경(scale_events 등)
  if [ $(($(date +%s) - s)) -lt 10800 ]; then
    echo "$fast" >"$d/cw-1s-queries.json"
    admin cloudwatch get-metric-data --metric-data-queries "file://$d/cw-1s-queries.json" \
      --start-time "$(date -u -d "@$((s - 120))" +%FT%TZ)" --end-time "$(date -u -d "@$((s + 2700))" +%FT%TZ)" --output json >"$d/cw-1s.json"
    echo "$n → $d/cw.json · cw-1s.json"
  else
    echo "$n → $d/cw.json (시작 3시간이 지나 1초 지표는 이미 없음)" >&2
  fi
done
