#!/usr/bin/env bash
# 회차 동안 서울 앱 서비스의 목표 · 실행 · 대기 태스크 수를 5초마다 한 줄씩 남긴다 (재생 페이지의 태스크 수 원본, ADR-063)
# Container Insights를 켜지 않아 CloudWatch에 태스크 수 지표가 없다. run-baseline.sh(TARGET=aws) · run-coupon.sh가 뒤에서 띄우고 끝날 때 멈춘다
#   bash load/record-tasks.sh <파일>
# 줄: <조회 시작 유닉스 초> <한국 시각> <목표> <실행> <대기>. 조회 실패는 숫자 대신 error (aws 프로그램 시작이 느려 실제 간격은 5초 + 1 ~ 2초)
# 평소 사용자로 조회 (watch-scaling.sh와 같은 권한)
export MSYS_NO_PATHCONV=1
while :; do
  t=$(date +%s)
  s=$(aws ecs describe-services --cluster hotel-booking-aws-v2 --services app --region ap-northeast-2 \
    --query 'services[0].[desiredCount,runningCount,pendingCount]' --output text 2>/dev/null | tr -d '\r' | tr '\t' ' ')
  echo "$t $(date -d "@$t" +%T) ${s:-error}" >>"$1"
  sleep 5
done
