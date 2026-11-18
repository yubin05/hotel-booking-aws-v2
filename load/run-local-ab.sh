#!/usr/bin/env bash
# 로컬 앱 변경 효과 (03 "3단계" 표 첫 줄): 기능을 더하기 전 앱(02096dc)과 지금 앱을 같은 DB(0.3코어, 1.5단계 조건)에서
# baseline.js(1·3단계와 같은 손님 행동)로 번갈아 잰다. 준비 명령은 docs/experiments/app-change.md
#
#   bash load/run-local-ab.sh warmup     1분 예열 (기록 안 함, 지금 앱)
#   bash load/run-local-ab.sh old 1      옛 앱 1회차 (약 10분). 순서: old 1 → new 1 → old 2 → new 2 → old 3 → new 3
#
# 결과: load/results/local-ab-<old|new>-<회차>/ 에 k6.txt(출력·요약), .html(리포트), .json.gz(요청별 기록),
#       db-digest.tsv(조회 모양별 DB 시간, 이 실행 동안만)
# 정리: node scripts/ab-report.mjs load/results/local-ab-*
set -euo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1 # Git Bash가 /load 같은 컨테이너 경로를 Windows 경로로 바꾸지 않게

NET=${NET:-hotel-booking-app_default} # 고객사 저장소 폴더 이름에서 나온 compose 네트워크
DB=${DB:-hotel-booking-app-db-1}
mode=${1:-}; n=${2:-}
case "$mode" in
  warmup) image=hotel-app:new; name=local-ab-warmup; stages=(--stage 30s:500 --stage 30s:500 --stage 10s:0) ;;
  old | new) [[ "$n" =~ ^[1-9]$ ]] || { echo '회차를 숫자로: run-local-ab.sh old 1' >&2; exit 1; }
    image=hotel-app:$mode; name=local-ab-$mode-$n
    stages=(--stage 30s:500 --stage 4m:500 --stage 30s:1000 --stage 4m:1000 --stage 30s:0) ;;
  *) echo '사용: run-local-ab.sh warmup | old <회차> | new <회차>' >&2; exit 1 ;;
esac
[ $# -le 2 ] || stages=("${@:3}") # 스모크 점검: 뒤에 붙인 k6 옵션이 단계를 대신함 (예: old 9 --stage 30s:2 --stage 30s:4 --stage 5s:0)
out=results/$name
[ ! -e "$out" ] || { echo "이미 있음: load/$out (다시 재려면 지우고 실행)" >&2; exit 1; }
sql() { docker exec -i "$DB" mysql -uroot -plocal-root-pw --batch -e "$1" 2>/dev/null; }

# 조건 확인: DB 0.3코어, compose의 app이 떠 있으면 이름 app이 겹친다
[ "$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$DB")" = 300000000 ] || { echo "DB가 0.3코어가 아님: docker update --cpus 0.3 $DB" >&2; exit 1; }
[ -z "$(docker ps -q --filter name=hotel-booking-app-app)" ] || { echo 'compose의 app을 먼저 멈춤: docker compose stop app' >&2; exit 1; }
[ "$(sql 'SELECT COUNT(*) FROM hotel_booking.hotels' | tail -1)" -gt 1000 ] || { echo '운영 규모 데이터가 없음 (숙소 1,000개 넘어야 함)' >&2; exit 1; }

# 앱 바꾸기: 결제 · 알림 키 없이 띄운다 (.env를 안 읽음 → 1단계와 같은 동작)
docker rm -f app >/dev/null 2>&1 || true
docker run -d --name app --network "$NET" -e DB_HOST=db -e DB_PASSWORD=local-app-pw -e JWT_SECRET=local-only-jwt-secret "$image" >/dev/null
for i in $(seq 30); do
  docker exec app node -e "fetch('http://localhost:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" 2>/dev/null && break
  [ "$i" = 30 ] && { echo '앱이 30초 안에 안 뜸: docker logs app' >&2; exit 1; }
  sleep 1
done
echo "시작: $name ($image, $(date +%T))"

mkdir -p "$out"
sql 'TRUNCATE TABLE performance_schema.events_statements_summary_by_digest' # 이 실행 동안의 DB 시간만 남게
docker run --rm -i --network "$NET" -v "$(pwd -W 2>/dev/null || pwd):/load" -e BASE_URL=http://app:3000 \
  -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/load/$out/$name.html" \
  grafana/k6:1.0.0 run --out "json=/load/$out/$name.json.gz" "${stages[@]}" /load/baseline.js 2>&1 | tee "$out/k6.txt"
# 조회 모양(digest)별 DB 안 실행 시간. 타이머 단위는 피코초
sql "SELECT ROUND(SUM_TIMER_WAIT/1e12, 3) AS total_s, COUNT_STAR AS calls, ROUND(AVG_TIMER_WAIT/1e9, 3) AS avg_ms, LEFT(DIGEST_TEXT, 160) AS query
     FROM performance_schema.events_statements_summary_by_digest WHERE SCHEMA_NAME = 'hotel_booking' ORDER BY SUM_TIMER_WAIT DESC" >"$out/db-digest.tsv"
echo "끝: $name ($(date +%T)) → load/$out/"
