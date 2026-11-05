#!/usr/bin/env bash
# E-06 배포 중 정상 종료 (docs/07-experiments.md). E-05와 같은 예약 부하(load/e05-app-kill.js)를 걸고, 부하 시작 15초 뒤
# DB를 2초 멈춰(pause) 그 사이 들어온 예약을 '처리 중'으로 붙잡아 둔다. 멈춘 지 1초 뒤 앱에 정상 종료 신호(SIGTERM)를 보내고
# 앱이 끝나면 바로 다시 띄운다 (서버 1대 배포: 옛 버전 종료 → 새 버전 시작)
#   load/e06-graceful-stop.sh          # docker compose pause db → 1초 → stop -t 10 app → 1초 → unpause db → (앱 종료 뒤) start app
#   DRY=1 load/e06-graceful-stop.sh    # 멈춤·종료·시작 명령은 출력만 하고 실행하지 않음 (스크립트 점검용)
# 결과: load/results/e06-graceful-stop-<시각>.txt/.html/.json.gz (run-k6.sh) + 같은 이름의 -fault.txt
#   -fault.txt: Docker가 기록한 app·db 컨테이너 사건(보낸 신호, 종료 코드 포함), 앱 로그(시각 포함), DB에 생긴 k6 예약의 키와 예약 번호.
#   시각은 모두 Docker 쪽 시계라 k6 기록과 같은 시계다 (Windows 시계와는 어긋날 수 있다)
# 분석: node scripts/e06-report.mjs load/results/<이름>
set -euo pipefail
cd "$(dirname "$0")/.."
AFTER=15 # 부하 시작 → DB 멈춤 (초)
HOLD=1   # DB 멈춤 → 종료 신호, 종료 신호 → DB 풀기 (초). 멈춤 2초는 앱의 DB 작업 상한 3초(TS-09)보다 짧아 503이 나지 않는다
GRACE=10 # 종료 신호 뒤 강제 종료(SIGKILL)까지 기다리는 시간 (초). Docker 기본값에 기대지 않고 적는다. ECS stopTimeout 기본은 30초
export NAME="e06-graceful-stop-$(date +%Y%m%d-%H%M%S)"
out="load/results/$NAME"
app_id=$(docker compose ps -q app)
db_id=$(docker compose ps -q db)
[ -n "$app_id" ] && [ -n "$db_id" ] || { echo "docker compose로 db·app이 떠 있어야 합니다" >&2; exit 1; }
since=$(($(date +%s) - 60)) # Windows 시계와 Docker 시계의 차이 여유

run() { if [ -n "${DRY:-}" ]; then echo "[장애] (DRY) $*"; else "$@"; fi; }
# 중간에 Ctrl+C로 끝나도 DB를 멈춘 채, 앱을 꺼진 채로 두지 않는다
trap '[ -z "${DRY:-}" ] && { docker compose unpause db; docker compose start app; } >/dev/null 2>&1; true' EXIT

fault() {
  # 부하 시작 = setup이 끝나며 'run=k6-' 줄을 찍은 때
  for _ in $(seq 300); do grep -qs 'run=k6-' "$out.txt" && break; sleep 0.2; done
  grep -qs 'run=k6-' "$out.txt" || { echo "[장애] 60초 안에 부하가 시작되지 않아 장애를 넣지 않습니다" >&2; return 1; }
  sleep "$AFTER"
  echo "[장애] DB 멈춤 (처리 중인 예약 만들기)"
  run docker compose pause db
  sleep "$HOLD"
  echo "[장애] 앱 정상 종료 신호"
  # stop은 앱이 끝날 때까지 기다리므로 뒤에서 돌리고, 그동안 DB를 푼다
  run docker compose stop -t "$GRACE" app &
  stop_pid=$!
  sleep "$HOLD"
  run docker compose unpause db
  echo "[장애] DB 풀기 끝"
  wait "$stop_pid"
  echo "[장애] 앱 종료 끝 → 새 버전 시작"
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
  # 시각 서비스 사건 signal=보낸 신호(15 SIGTERM, 9 SIGKILL) exitCode=종료 코드(0 정상, 137 강제 종료)
  docker events --since "$since" --until "$(($(date +%s) + 3))" --filter "container=$app_id" --filter "container=$db_id" \
    --format '{{.TimeNano}} {{index .Actor.Attributes "com.docker.compose.service"}} {{.Action}} signal={{index .Actor.Attributes "signal"}} exitCode={{index .Actor.Attributes "exitCode"}}'
  echo '# app'
  docker compose logs --no-color --no-log-prefix --timestamps app 2>&1
  echo '# keys'
  docker compose exec -T db mysql -uroot -plocal-root-pw -N -B hotel_booking \
    -e "SELECT idempotency_key, id FROM bookings WHERE idempotency_key LIKE 'k6-%'" 2>/dev/null
} >"$out-fault.txt"
echo "장애 기록: $out-fault.txt"
echo "분석: node scripts/e06-report.mjs $out"
