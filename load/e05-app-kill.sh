#!/usr/bin/env bash
# E-05 앱 강제 종료 후 재시도 (docs/07-experiments.md). 예약 부하를 걸고, 부하 시작 15초 뒤 앱을 강제 종료(SIGKILL)했다가 5초 뒤 다시 띄운다.
# compose에 재시작 정책이 없어 다시 띄우는 것도 이 스크립트가 한다 (ECS는 대체 태스크를 자동으로 띄운다)
#   load/e05-app-kill.sh          # docker compose kill -s SIGKILL app → 5초 → docker compose start app
#   DRY=1 load/e05-app-kill.sh    # 종료·시작 명령은 출력만 하고 실행하지 않음 (스크립트 점검용)
# 결과: load/results/e05-app-kill-<시각>.txt/.html/.json.gz (run-k6.sh) + 같은 이름의 -fault.txt
#   -fault.txt: Docker가 기록한 app 컨테이너 사건, 앱 로그(시각 포함), DB에 생긴 k6 예약의 키와 예약 번호.
#   시각은 모두 Docker 쪽 시계라 k6 기록과 같은 시계다 (Windows 시계와는 어긋날 수 있다)
# 분석: node scripts/e05-report.mjs load/results/<이름>
set -euo pipefail
cd "$(dirname "$0")/.."
AFTER=15 # 부하 시작 → 강제 종료까지 (초)
DOWN=5   # 죽어 있는 시간 (초). ECS 대체 태스크 기동(분 단위)이 아니라 재시도가 여러 번 실패하게 하는 길이
export NAME="e05-app-kill-$(date +%Y%m%d-%H%M%S)"
out="load/results/$NAME"
app_id=$(docker compose ps -q app)
[ -n "$app_id" ] && [ -n "$(docker compose ps -q db)" ] || { echo "docker compose로 db·app이 떠 있어야 합니다" >&2; exit 1; }
since=$(($(date +%s) - 60)) # Windows 시계와 Docker 시계의 차이 여유

run() { if [ -n "${DRY:-}" ]; then echo "[장애] (DRY) $*"; else "$@"; fi; }
# 중간에 Ctrl+C로 끝나도 앱을 죽은 채로 두지 않는다
trap '[ -z "${DRY:-}" ] && docker compose start app >/dev/null 2>&1; true' EXIT

fault() {
  # 부하 시작 = setup이 끝나며 'run=k6-' 줄을 찍은 때
  for _ in $(seq 300); do grep -qs 'run=k6-' "$out.txt" && break; sleep 0.2; done
  grep -qs 'run=k6-' "$out.txt" || { echo "[장애] 60초 안에 부하가 시작되지 않아 장애를 넣지 않습니다" >&2; return 1; }
  sleep "$AFTER"
  echo "[장애] 앱 강제 종료"
  # 신호를 적어 둔다: 정상 종료(SIGTERM)는 E-06에서 따로 본다
  run docker compose kill -s SIGKILL app
  sleep "$DOWN"
  run docker compose start app
  echo "[장애] 앱 시작 명령 끝"
}

fault &
fault_pid=$!
# 실패해도 아래 장애 기록은 남긴다
load/run-k6.sh e05-app-kill.js || echo "k6 종료 코드 $?"
wait "$fault_pid" || echo "[장애] 장애 넣기 실패 (위 메시지 확인)"

{
  echo '# events'
  docker events --since "$since" --until "$(($(date +%s) + 3))" --filter "container=$app_id" \
    --format '{{.TimeNano}} {{.Action}}'
  echo '# app'
  docker compose logs --no-color --no-log-prefix --timestamps app 2>&1
  echo '# keys'
  docker compose exec -T db mysql -uroot -plocal-root-pw -N -B hotel_booking \
    -e "SELECT idempotency_key, id FROM bookings WHERE idempotency_key LIKE 'k6-%'" 2>/dev/null
} >"$out-fault.txt"
echo "장애 기록: $out-fault.txt"
echo "분석: node scripts/e05-report.mjs $out"
