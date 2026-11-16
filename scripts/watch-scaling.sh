#!/bin/bash
# 오토스케일링 시연 · 기록: 서울 앱 태스크 수와 ALB 건강 상태가 바뀔 때마다 한 줄씩 (ADR-015)
# 실행(Git Bash, 평소 사용자): bash scripts/watch-scaling.sh 17:30   ← 끝낼 시각, 생략하면 Ctrl+C까지
# 끝난 뒤 이유가 붙은 기록: aws application-autoscaling describe-scaling-activities --service-namespace ecs --region ap-northeast-2
export MSYS_NO_PATHCONV=1
R=ap-northeast-2
CLUSTER=hotel-booking-aws-v2
TG=$(aws ecs describe-services --cluster $CLUSTER --services app --region $R --query 'services[0].loadBalancers[0].targetGroupArn' --output text) || exit 1
end=$([ -n "$1" ] && date -d "$1" +%s || echo 9999999999)
last=""
while [ "$(date +%s)" -lt "$end" ]; do
  s=$(aws ecs describe-services --cluster $CLUSTER --services app --region $R \
    --query 'services[0].[desiredCount,runningCount,pendingCount]' --output text | tr -d '\r' | tr '\t' ' ')
  h=$(aws elbv2 describe-target-health --target-group-arn "$TG" --region $R \
    --query 'TargetHealthDescriptions[].TargetHealth.State' --output text | tr -d '\r' | tr '\t' '\n' | sort | uniq -c | xargs)
  cur="목표/실행/대기 $s | ALB $h"
  [ "$cur" != "$last" ] && echo "$(date '+%H:%M:%S') $cur" && last="$cur"
  sleep 10
done
