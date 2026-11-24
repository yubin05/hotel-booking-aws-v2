#!/usr/bin/env bash
# 3단계 k6 비교 3회 묶음 (docs/experiments/migration.md 2절): 회차마다 태스크가 2개로 돌아온 뒤 시작하고,
# 끝나면 바로 서울 서버 지표를 받는다(1초 지표는 3시간만 남음). 다 끝나면 층별 표와 정합성 검사(RDS)까지
#   bash load/run-baseline-x3.sh       약 2시간 (37분 × 3 + 태스크가 줄기를 기다리는 시간)
#   SCRIPT=realistic.js bash load/run-baseline-x3.sh   실제 손님 행동 한계점 시험 3회 (ADR-074, 49분 × 3 + 기다리는 시간)
# 한 회차가 끊기면 멈춘다 → 그 회차는 bash load/run-baseline.sh collect <이름> → bash load/cw-metrics.sh <폴더>, 남은 회차는 RUNS=<남은 수>로 다시
# 필요: TARGET=aws run-baseline.sh와 같음(발생기 · 서울 · global 발생기 WAF 예외, ssh-agent), 관리자 로그인(지표 · 태스크 수 · 정합성 검사)
set -Eeuo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
source ../migration/lib.sh # admin() · CLUSTER
RUNS=${RUNS:-3}
running() { admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].runningCount' --output text; }

dirs=()
for i in $(seq "$RUNS"); do
  # 앞 회차에 늘어난 태스크가 2개로 줄 때까지 (k6 직후 15분 넘게 걸릴 수 있음, 최대 40분). 회차마다 같은 출발점
  for _ in $(seq 80); do
    n=$(running)
    [ "$n" = 2 ] && break
    echo "$(date +%T) 태스크 ${n}개 → 2개로 줄기를 기다림"
    sleep 30
  done
  [ "$(running)" = 2 ] || { echo "40분이 지나도 2개가 아님" >&2; exit 1; }
  echo "=== $i/$RUNS회 시작 $(date +%T)"
  TARGET=aws bash run-baseline.sh # SCRIPT=realistic.js를 앞에 붙여 실행하면 그대로 넘어감 (ADR-074)
  d=$(ls -td results/baseline-aws-$([ "${SCRIPT:-}" = realistic.js ] && echo real-)2* | head -1)
  bash cw-metrics.sh "$d"
  dirs+=("$d")
done
for d in "${dirs[@]}"; do
  node ../scripts/baseline-report.mjs "$d"/*.json.gz
  ! ls "$d"/*.journey.gz >/dev/null 2>&1 || node ../scripts/journey-report.mjs "$d" # 손님 여정 (11-24~)
done
bash ../migration/sql.sh ../scripts/check-consistency.sql | tee "results/consistency-aws-$(date +%Y%m%d-%H%M).txt"
echo "끝: ${dirs[*]}"
