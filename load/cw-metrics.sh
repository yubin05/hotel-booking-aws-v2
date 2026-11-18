#!/usr/bin/env bash
# 3단계 k6(baseline-aws-*) 동안의 서울 서버 지표를 CloudWatch에서 1분 단위로 받아 결과 폴더에 cw.json으로 둔다 (migration.md 2 · 4절)
# baseline-report.mjs가 cw.json을 보면 층마다 붙인다. 1분 지표는 15일 남지만, ALB · 대상 그룹의 지표 차원(이름/id)은
# 서울이 떠 있을 때만 찾을 수 있어 서울 destroy 전에 실행. 관리자 로그인 필요(평소 정책에 CloudWatch 읽기 없음)
#   bash load/cw-metrics.sh load/results/baseline-aws-*
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
q() { # Id 이름공간 지표 통계 차원
  printf '{"Id":"%s","MetricStat":{"Metric":{"Namespace":"%s","MetricName":"%s","Dimensions":%s},"Period":60,"Stat":"%s"}}' "$1" "$2" "$3" "$5" "$4"
}
queries="[$(q ecs_cpu_avg AWS/ECS CPUUtilization Average "$ECS"),$(q ecs_cpu_max AWS/ECS CPUUtilization Maximum "$ECS"),\
$(q ecs_mem_avg AWS/ECS MemoryUtilization Average "$ECS"),$(q ecs_mem_max AWS/ECS MemoryUtilization Maximum "$ECS"),\
$(q healthy AWS/ApplicationELB HealthyHostCount Maximum "$ALB_TG"),$(q alb_5xx AWS/ApplicationELB HTTPCode_Target_5XX_Count Sum "$ALB"),\
$(q rds_cpu AWS/RDS CPUUtilization Average "$RDS"),$(q rds_conn AWS/RDS DatabaseConnections Maximum "$RDS"),\
$(q rds_freemem AWS/RDS FreeableMemory Minimum "$RDS"),$(q rds_credit AWS/RDS CPUCreditBalance Minimum "$RDS")]"

for d in "$@"; do
  n=$(basename "$d")
  ts=${n##*-aws-}
  ts=${ts#try-} # 이름의 시작 시각 YYYYmmdd-HHMMSS (한국 시간)
  s=$(date -d "${ts:0:8} ${ts:9:2}:${ts:11:2}:${ts:13:2}" +%s)
  echo "$queries" >"$d/cw-queries.json"
  # 시험 37분 + 앞뒤 여유. "+45 minutes"는 시간대로 읽히는 함정이 있어 초로 계산
  admin cloudwatch get-metric-data --metric-data-queries "file://$d/cw-queries.json" \
    --start-time "$(date -u -d "@$((s - 120))" +%FT%TZ)" --end-time "$(date -u -d "@$((s + 2700))" +%FT%TZ)" --output json >"$d/cw.json"
  echo "$n → $d/cw.json"
done
