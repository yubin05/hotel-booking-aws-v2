#!/usr/bin/env bash
# E-04 예약 도중 DB 장애 (docs/07-experiments.md). 예약 부하를 걸고, 부하 시작 15초 뒤 DB에 장애를 넣는다.
# 사람이 다른 터미널에서 손으로 넣으면 시각·길이가 매번 달라져서 스크립트로 고정한다.
#   load/e04-db-outage.sh restart        # docker compose restart -t 3 db (종료 신호 → 3초 안에 안 끝나면 강제 종료 → 다시 뜸)
#   load/e04-db-outage.sh pause          # docker compose pause db → 15초 뒤 unpause (연결은 열린 채 응답만 멈춤)
#   DRY=1 load/e04-db-outage.sh restart  # 장애 명령은 출력만 하고 실행하지 않음 (스크립트 점검용)
# 결과: load/results/e04-db-outage-<모드>-<시각>.txt/.html/.json.gz (run-k6.sh) + 같은 이름의 -fault.txt
#   -fault.txt: Docker가 기록한 db·app 컨테이너 사건, MySQL 로그, DB에 생긴 k6 예약 키.
#   시각은 모두 Docker 쪽 시계라 k6 기록과 같은 시계다 (Windows 시계와는 어긋날 수 있다)
# 분석: node scripts/e04-report.mjs load/results/<이름>
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-}"
case "$mode" in restart | pause) ;; *) echo "사용법: load/e04-db-outage.sh restart|pause" >&2; exit 1 ;; esac
AFTER=15 # 부하 시작 → 장애까지 (초)
PAUSE=15 # pause 길이 (초). 앱 쪽 시간 제한(헬스 체크 2초, mysql2 연결 10초)보다 길게
export NAME="e04-db-outage-$mode-$(date +%Y%m%d-%H%M%S)"
out="load/results/$NAME"
db_id=$(docker compose ps -q db)
app_id=$(docker compose ps -q app)
[ -n "$db_id" ] && [ -n "$app_id" ] || { echo "docker compose로 db·app이 떠 있어야 합니다" >&2; exit 1; }
since=$(($(date +%s) - 60)) # Windows 시계와 Docker 시계의 차이 여유

run() { if [ -n "${DRY:-}" ]; then echo "[장애] (DRY) $*"; else "$@"; fi; }
# 중간에 Ctrl+C로 끝나도 DB를 멈춘 채로 두지 않는다
trap '[ "$mode" = pause ] && [ -z "${DRY:-}" ] && docker compose unpause db >/dev/null 2>&1; true' EXIT

fault() {
  # 부하 시작 = setup이 끝나며 'run=k6-' 줄을 찍은 때
  for _ in $(seq 300); do grep -qs 'run=k6-' "$out.txt" && break; sleep 0.2; done
  grep -qs 'run=k6-' "$out.txt" || { echo "[장애] 60초 안에 부하가 시작되지 않아 장애를 넣지 않습니다" >&2; return 1; }
  sleep "$AFTER"
  echo "[장애] $mode 시작"
  if [ "$mode" = restart ]; then
    # 3초: 첫 시도에서 -t 없이 실행했을 때 실제로 기다린 시간. 기본값이 바뀌어도 같은 조건이 되게 적어 둔다
    run docker compose restart -t 3 db
  else
    run docker compose pause db
    sleep "$PAUSE"
    run docker compose unpause db
  fi
  echo "[장애] $mode 명령 끝"
}

fault &
fault_pid=$!
# 실패해도 아래 장애 기록은 남긴다
load/run-k6.sh e04-db-outage.js || echo "k6 종료 코드 $?"
wait "$fault_pid" || echo "[장애] 장애 넣기 실패 (위 메시지 확인)"

# DB가 다시 받기 전에 끝났을 때를 대비해 준비될 때까지 기다린 뒤 키를 꺼낸다
until docker compose exec -T db mysqladmin ping -h127.0.0.1 -uroot -plocal-root-pw --silent >/dev/null 2>&1; do sleep 1; done
{
  echo '# events'
  docker events --since "$since" --until "$(($(date +%s) + 3))" --filter "container=$db_id" --filter "container=$app_id" \
    --format '{{.TimeNano}} {{index .Actor.Attributes "com.docker.compose.service"}} {{.Action}}'
  echo '# mysql'
  docker compose logs --no-color --no-log-prefix db 2>&1
  echo '# keys'
  docker compose exec -T db mysql -uroot -plocal-root-pw -N -B hotel_booking \
    -e "SELECT idempotency_key FROM bookings WHERE idempotency_key LIKE 'k6-%'" 2>/dev/null
} >"$out-fault.txt"
echo "장애 기록: $out-fault.txt"
echo "분석: node scripts/e04-report.mjs $out"
