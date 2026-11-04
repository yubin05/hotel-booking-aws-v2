#!/usr/bin/env bash
# k6를 Docker로 실행한다 (설치 불필요). 앱이 docker compose로 떠 있어야 한다.
#   load/run-k6.sh e01-normal-traffic.js [k6 옵션...]
# 결과: 터미널 출력은 load/results/<이름>-<시각>.txt, 그래프 리포트는 같은 이름의 .html,
#       요청 하나하나의 기록은 .json.gz (리포트는 10초 단위라 1초 안에 끝나는 쏠림은 이것으로 그린다)
set -euo pipefail
cd "$(dirname "$0")"
script="$1"; shift
name="${script%.js}-$(date +%Y%m%d-%H%M%S)"
mkdir -p results
# Git Bash가 /load 같은 컨테이너 경로를 Windows 경로로 바꾸지 않게 한다
export MSYS_NO_PATHCONV=1
dir="$(pwd -W 2>/dev/null || pwd)"
docker run --rm -i --network hotel-booking-aws-v2_default \
  -v "$dir:/load" \
  -e BASE_URL=http://app:3000 \
  -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/load/results/$name.html" \
  grafana/k6:1.0.0 run --out "json=/load/results/$name.json.gz" "/load/$script" "$@" 2>&1 | tee "results/$name.txt"
