#!/usr/bin/env bash
# NAT 인스턴스 user_data 실행 결과를 시스템 로그에서 확인 (apply 후 2~3분 뒤 실행)
# 사용: bash infra/legacy/check-nat-log.sh
set -euo pipefail

# Windows의 aws.exe 출력에 붙는 \r 제거
ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=legacy-nat_instance_1" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" --output text | tr -d '\r')

if [ "$ID" = "None" ]; then
  echo "실행 중인 legacy-nat_instance_1이 없음" >&2
  exit 1
fi

echo "NAT: $ID"
LOG=$(aws ec2 get-console-output --instance-id "$ID" --latest --output text)
echo "$LOG" | grep -E '^\+|iptables|Failed|ERROR' || echo "아직 로그 없음 - 1~2분 뒤 다시 실행"
