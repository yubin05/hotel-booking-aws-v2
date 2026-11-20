#!/usr/bin/env bash
# 3단계 쿠폰 오픈 스파이크 3회 묶음 (docs/experiments/migration.md 3절): T를 25분 간격으로(한 회차가 T 13분 전 ~ T 6분 뒤 + 확인 3분) 잡아 run-coupon.sh를 3번, 회차마다 서버 지표까지
#   bash load/run-coupon-x3.sh none                     없이: 회차마다 태스크가 2개로 돌아온 뒤 '지금 + 6분'을 T로
#   bash load/run-coupon-x3.sh plan <첫 T HH:MM>         있게 전에: infra/seoul/main.tf scale_events에 넣을 한 줄 (첫 T 5분 전 ~ 마지막 T + 10분, 최소 4)
#   bash load/run-coupon-x3.sh scheduled <첫 T HH:MM>    있게: plan과 같은 T (첫 T, +25분, +50분). 서울 apply로 예약이 걸린 뒤
# 필요: run-coupon.sh와 같음(발생기 · 서울 · global 발생기 WAF 예외, ssh-agent, 관리자 로그인)
set -Eeuo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
source ../migration/lib.sh # admin() · CLUSTER
cmd=${1:-}
first=${2:-}
hm() { date -d "@$1" +%H:%M; }

if [[ $cmd == plan || $cmd == scheduled ]]; then
  [[ $first =~ ^[0-2][0-9]:[0-5][0-9]$ ]] || { sed -n '3,5p' "$0" >&2; exit 1; }
  t1=$(date -d "$first" +%s)
  ts=("$t1" $((t1 + 1500)) $((t1 + 3000)))
fi
if [ "$cmd" = plan ]; then
  echo "{ name = \"coupon-$(date +%m%d)\", start = \"$(date -d "@$((t1 - 300))" +%FT%T)\", end = \"$(date -d "@$((t1 + 3600))" +%FT%T)\", min = 4 },"
  echo "→ infra/seoul/main.tf scale_events에 넣고 서울 apply. 그다음: bash load/run-coupon-x3.sh scheduled $first"
  exit 0
fi
[[ $cmd == none || $cmd == scheduled ]] || { sed -n '3,5p' "$0" >&2; exit 1; }
running() { admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].runningCount' --output text; }

for i in 0 1 2; do
  if [ "$cmd" = none ]; then
    # 없이: 앞 회차 · k6로 늘어난 태스크가 2개로 줄 때까지 (최대 40분), 그 뒤 T = 다음 정각 분 + 6분
    for _ in $(seq 80); do
      n=$(running)
      [ "$n" = 2 ] && break
      echo "$(date +%T) 태스크 ${n}개 → 2개로 줄기를 기다림"
      sleep 30
    done
    t=$(( ($(date +%s) / 60 + 1) * 60 + 720 ))  # 오픈 전 가입 약 7분 + 여유 (11-20)
  else
    t=${ts[$i]}
    [ $((t - $(date +%s))) -ge 720 ] || { echo "$(hm "$t")까지 12분이 안 남음: 첫 T를 늦춰 plan부터 다시" >&2; exit 1; }
    # T 13분 전까지 기다렸다 시작 (일찍 시작하면 회차가 길어져 다음 T를 놓침, 11-20)
    w=$((t - 780 - $(date +%s)))
    [ "$w" -le 0 ] || { echo "$(hm $((t - 780)))까지 기다렸다 시작 (T $(hm "$t") 13분 전)"; sleep "$w"; }
  fi
  echo "=== $((i + 1))/3회 T $(hm "$t") ($cmd)"
  bash run-coupon.sh "$(hm "$t")" "$cmd"
done
echo "끝. 있게(scheduled)를 마쳤으면 scale_events를 비우고 서울 apply"
