#!/usr/bin/env bash
# 3단계 쿠폰 오픈 스파이크 1회 (docs/experiments/migration.md 3절): 새 쿠폰을 T에 열고, 발생기에서 1,000명이 T에 함께 누름
#   bash load/run-coupon.sh <T: HH:MM> <fixed2|scheduled|none>     T는 지금보다 12분 이상 뒤(오픈 전 1,000명이 가입하며 모이는 데 약 7분, 11-20 실측), 회차 사이 20분(한 회차 약 18분)
#   fixed2(서버 최대 2대로 묶음, 옛 IDC처럼 못 늘림) · scheduled(예약 스케일링으로 미리 4대) · none(목표 추적만, 몰려드는 동안 늘어날 수 있음). fixed2는 먼저 런북 5-5의 "2대로 묶기"
#   scheduled는 먼저 infra/seoul/main.tf의 scale_events에 첫 T 5분 전 ~ 마지막 T + 10분, min 4를 넣고 apply (런북 5-1)
# 촬영 전용: VIDEO_DEMO=1 CLAIMERS=2999 COUPONS=100 bash load/run-coupon.sh <T> scheduled
# 실제 손님이 T-90초에 1장 선발급받고 T-30초까지 확인. k6는 T에 2,999명, 99장 발급 기대. 성능 검증 회차와 분리.
# 결과: load/results/coupon-<조건>-<시작 시각>/ k6.txt · .json.gz · .html, coupon.txt(만든 쿠폰), verify.txt(발급 확인 SQL)
# 필요: 옛 환경 발생기(legacy is_load_test=true) · 서울 · global(발생기 WAF 예외), 관리자 로그인(쿠폰 만들기 · 확인 · 태스크 수)
set -Eeuo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
source ../migration/lib.sh # admin() · CLUSTER
LEGACY_DIR=${LEGACY_DIR:-../../hotel-booking-app/legacy}
BASE=https://hotel.vundle34.cloud
COUPONS=${COUPONS:-100}
CLAIMERS=${CLAIMERS:-1000}
VIDEO_DEMO=${VIDEO_DEMO:-0}
[[ $VIDEO_DEMO == 0 || $VIDEO_DEMO == 1 ]] || { echo "VIDEO_DEMO는 0 또는 1" >&2; exit 1; }
[[ $COUPONS =~ ^[1-9][0-9]*$ && $CLAIMERS =~ ^[1-9][0-9]*$ ]] || { echo "COUPONS/CLAIMERS는 양의 정수" >&2; exit 1; }
expected_issued=$COUPONS
open_lead=2
read_tail=30
if [ "$VIDEO_DEMO" = 1 ]; then
  [[ $COUPONS -ge 2 && $CLAIMERS -ge $((COUPONS - 1)) ]] || { echo "촬영 모드는 쿠폰 2장 이상, 발급 가능한 인원이 필요" >&2; exit 1; }
  expected_issued=$((COUPONS - 1))
  open_lead=60 # 실제 손님은 T-1분(예: 1:00)에 받고 바로 예약, k6는 T(1:01)에 몰림
  read_tail=240 # 예약/결제 동안에도 일반 조회 부하 유지(메일이 늦으면 이후 구분)
fi

t=${1:-}; cond=${2:-}
[[ $t =~ ^[0-2][0-9]:[0-5][0-9]$ && ($cond == fixed2 || $cond == none || $cond == scheduled) ]] || { sed -n '3,5p' "$0" >&2; exit 1; }
open=$(date -d "$t" +%s) # 오늘 그 시각 (한국 시간)
# 가입을 시작 ~ T 2분 전에 나눠 함(coupon-spike.js). 1,000명당 7분(초당 약 2.4명, 서버가 버틴 가입 속도 초당 3명 아래) + 여유 5분: 1,000명 12분 · 3,000명 26분 · 스모크 20명 6분
lead=$(( (CLAIMERS * 7 + 999) / 1000 + 5 ))
if [ "$VIDEO_DEMO" = 1 ]; then lead=$((lead + 4)); fi # 촬영: 가입을 T-6분까지 끝내고(화면 밖), T-5분부터 몰려오는 장면을 찍음
[ $((open - $(date +%s))) -ge $((lead * 60)) ] || { echo "T($t)는 지금보다 ${lead}분 이상 뒤여야 함 ($CLAIMERS명 가입을 1,000명당 약 7분에 나눠 함 + 여유 5분)" >&2; exit 1; }
ssh-add -l >/dev/null 2>&1 || { echo '먼저 실행: eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy' >&2; exit 1; }
LOAD=$(terraform -chdir="$LEGACY_DIR" output -raw load_test_instance_1_public_ip | tr -d '\r')
ON_LOAD=(ssh "ec2-user@$LOAD")

# 조건 확인: 없이는 태스크 2개(앞 회차에 늘었으면 목표 추적이 줄일 때까지 기다림), 있게는 예약이 걸려 있어야 함
running=$(admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].runningCount' --output text)
scheduled=$(admin application-autoscaling describe-scheduled-actions --service-namespace ecs --resource-id "service/$CLUSTER/app" --query 'length(ScheduledActions)' --output text)
max=$(admin application-autoscaling describe-scalable-targets --service-namespace ecs --resource-ids "service/$CLUSTER/app" --query 'ScalableTargets[0].MaxCapacity' --output text)
echo "지금 태스크 $running개, 예약 작업 $scheduled개, 최대 $max대"
if [ "$cond" != scheduled ]; then
  [ "$running" = 2 ] && [ "$scheduled" = 0 ] || { echo "$cond: 태스크 2개 · 예약 0이어야 함 (줄어들 때까지 기다리거나 scale_events를 비우고 apply)" >&2; exit 1; }
  [ "$cond" != fixed2 ] || [ "$max" = 2 ] || { echo "fixed2: 먼저 최대 2대로 묶기 (런북 5-5)" >&2; exit 1; }
  [ "$cond" != none ] || [ "$max" != 2 ] || { echo "none: 최대가 2대로 묶여 있음. 풀고 다시 (런북 5-5)" >&2; exit 1; }
else
  [ "$scheduled" -gt 0 ] || { echo "있게: scale_events에 예약을 넣고 서울 apply 먼저" >&2; exit 1; }
fi

prefix=coupon
[ "$VIDEO_DEMO" = 0 ] || prefix=coupon-video
name=$prefix-$cond-$(date +%Y%m%d-%H%M%S)
out=results/$name
mkdir -p "$out"
id=66666666-0000-0000-0000-$(date -d "@$open" +%m%d%H%M)0000 # 회차마다 새 쿠폰 (T로 구분, 같은 T로 두 번 만들면 키 중복으로 멈춤)
# 일반 회차는 발급 시작 T-2초(시계 차이). 촬영 회차는 T-90초(손님 1장 선발급). DB는 UTC.
utc() { date -u -d "@$1" '+%F %T'; }
coupon_title="쿠폰 오픈 시험 $t"
if [ "$VIDEO_DEMO" = 1 ]; then
  coupon_title="깜짝 할인 이벤트"
  printf '촬영용 회차(실험 기록과 섞지 말 것)\nT=%s\n촬영 손님 오픈=%s\n쿠폰=%s\nk6=%s\n촬영 손님=1\nk6 기대 발급=%s\n' "$t" "$(date -d "@$((open - open_lead))" +%T)" "$COUPONS" "$CLAIMERS" "$expected_issued" >"$out/video-demo.txt"
fi
cat >"$out/coupon.sql" <<SQL
INSERT INTO coupons (id, name, discount_amount, quantity, starts_at, ends_at, expires_at)
VALUES ('$id', '$coupon_title', 10000, $COUPONS, '$(utc $((open - open_lead)))', '$(utc $((open + 3600)))', '$(utc $((open + 7 * 86400)))');
SELECT id, name, quantity, issued_count, starts_at FROM coupons WHERE id = '$id';
SQL
bash ../migration/sql.sh "$out/coupon.sql" | tee "$out/coupon.txt"

"${ON_LOAD[@]}" 'cloud-init status --wait >/dev/null; mkdir -p ~/load/results; sudo docker rm -f k6 k6-browser >/dev/null 2>&1 || true' # 앞 회차가 중간에 멈추면 브라우저 손님이 남아 이름이 겹침(11-25)
scp -q coupon-spike.js journey-browser.js "ec2-user@$LOAD:load/"
# Grafana Cloud(실험 관제실, ADR-064)로 실시간 전송: PC에 쓰기 토큰 파일이 있을 때만. 토큰은 명령줄에 안 나오게 파일(--env-file)로 넘기고 끝나면 지움
rw=0
if grep -q '^K6_PROMETHEUS_RW_PASSWORD=.' ~/.hotel-legacy/grafana.env 2>/dev/null; then # 토큰 칸이 비어 있으면 끔
  scp -q ~/.hotel-legacy/grafana.env "ec2-user@$LOAD:load/grafana.env" && "${ON_LOAD[@]}" 'chmod 600 ~/load/grafana.env' && rw=1
fi
echo "Grafana 전송: $([ $rw = 1 ] && echo 켬 || echo '끔 (~/.hotel-legacy/grafana.env 없음 또는 토큰 빈칸)')"
# 조회는 일반 회차 T+30초, 촬영 회차 T+240초까지. 그동안 가입/예약/결제 촬영.
"${ON_LOAD[@]}" bash -s -- "$name" "$BASE" "$id" "$((open * 1000))" "$COUPONS" "$CLAIMERS" "$((open - $(date +%s) + read_tail))" "$rw" "$expected_issued" "$VIDEO_DEMO" <<'REMOTE'
set -euo pipefail
name=$1
grafana=() out=(--out "json=/load/results/$name.json.gz")
if [ "$8" = 1 ]; then # p95 · p99 · 최대를 1초마다 보냄(쏠림이 몇 초라 기본 5초는 거침), 회차 이름을 testid로
  # 요청 주소(url) 태그는 빼서 숙소 상세 50곳이 따로 시리즈가 되지 않게 (이름 태그 search · hotel · claim으로 구분, 분석 스크립트는 url을 안 씀)
  grafana=(--env-file "$HOME/load/grafana.env" -e 'K6_PROMETHEUS_RW_TREND_STATS=p(95),p(99),max' -e K6_PROMETHEUS_RW_PUSH_INTERVAL=1s -e K6_PROMETHEUS_RW_STALE_MARKERS=true
    -e K6_SYSTEM_TAGS=status,method,name,group,check,error,error_code,scenario,expected_response)
  out+=(-o experimental-prometheus-rw --tag "testid=$name")
fi
sudo docker run -d --name k6 --network host --user "$(id -u):$(id -g)" -v ~/load:/load "${grafana[@]}" \
  -e BASE_URL="$2" -e COUPON_ID="$3" -e OPEN_AT="$4" -e COUPONS="$5" -e CLAIMERS="$6" -e READ_SEC="$7" -e EXPECTED_ISSUED="$9" -e VIDEO_BROWSE="${10}" \
  -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/load/results/$name.html" \
  grafana/k6:1.0.0 run "${out[@]}" /load/coupon-spike.js >/dev/null
# 브라우저 손님 1명(journey-browser.js, 11-25): 오픈 전 ~ 예약 쏠림 뒤까지 첫 화면 LCP. 조회 시간 + 4분
sudo docker run -d --name k6-browser --network host --shm-size=512m --user "$(id -u):$(id -g)" -e HOME=/tmp -v ~/load:/load \
  -e BASE_URL="$2" -e DURATION="$(($7 + 240))s" -e BROWSERS=1 \
  grafana/k6:1.0.0-with-browser run --out "json=/load/results/$name.browser.gz" /load/journey-browser.js >/dev/null
REMOTE
echo "시작: $name (T $t, 쿠폰 $COUPONS장, $CLAIMERS명). Ctrl+C로 빠져나와도 시험은 발생기에서 계속됨"
bash record-tasks.sh "$out/tasks.log" & # 태스크 수 5초 기록, 이 스크립트가 끝나면 멈춤
rec=$!
trap 'kill $rec 2>/dev/null' EXIT
if [ "$VIDEO_DEMO" = 1 ]; then
  echo "촬영 전용: $(date -d "@$((open - open_lead))" +%T)에 쿠폰 1장을 실제 손님이 먼저 발급."
  # 사용자가 터미널을 안 보도록: 공개 쿠폰 목록의 남은 수가 줄면 손님이 받은 것으로 봄(3초마다, T-30초까지). 못 받아도 회차는 계속(기록만)
  claimed=no
  while [ $(date +%s) -lt $((open - 30)) ]; do
    left=$(curl -s -m 5 "$BASE/api/coupons" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const c=JSON.parse(s).data.find(x=>x.id===process.argv[1]);console.log(c?c.remaining:"")}catch{console.log("")}})' "$id")
    if [ -n "$left" ] && [ "$left" -lt "$COUPONS" ]; then claimed=yes; break; fi
    sleep 3
  done
  printf '손님 선발급 자동 확인: %s (%s)\n' "$claimed" "$(date --iso-8601=seconds)" >>"$out/video-demo.txt"
  echo "손님 선발급: $claimed"
fi
"${ON_LOAD[@]}" 'sudo docker logs -f k6 2>&1 | grep --line-buffered -v "Request Failed"' || true

"${ON_LOAD[@]}" 'sudo docker logs k6' >"$out/k6.txt" 2>&1
# 브라우저 손님은 조회 시간 + 4분이라 k6보다 늦게 끝날 수 있음 → 최대 6분 기다린 뒤 로그
for _ in $(seq 72); do [ "$("${ON_LOAD[@]}" "sudo docker inspect -f '{{.State.Running}}' k6-browser 2>/dev/null")" = true ] || break; sleep 5; done
"${ON_LOAD[@]}" 'sudo docker logs k6-browser' >"$out/browser.txt" 2>&1 || rm -f "$out/browser.txt"
scp -q "ec2-user@$LOAD:load/results/$name.*" "$out/"
"${ON_LOAD[@]}" 'sudo docker rm k6 >/dev/null; sudo docker rm -f k6-browser >/dev/null 2>&1; rm -f ~/load/grafana.env'
# 발급 확인: 발급 수 = 장 수(초과 0), 받은 줄 수 = 받은 사람 수(1인 1매)
cat >"$out/verify.sql" <<SQL
SELECT c.quantity, c.issued_count, COUNT(uc.id) AS user_coupons, COUNT(DISTINCT uc.user_id) AS users
  FROM coupons c LEFT JOIN user_coupons uc ON uc.coupon_id = c.id WHERE c.id = '$id' GROUP BY c.id;
-- 이 쿠폰으로 한 예약 (11-25~): 받은 사람 수 이하, 쿠폰 하나에 예약 하나
SELECT COUNT(*) AS bookings_with_coupon, COUNT(DISTINCT b.user_coupon_id) AS coupons_used
  FROM bookings b JOIN user_coupons uc ON uc.id = b.user_coupon_id WHERE uc.coupon_id = '$id';
SQL
# 회차가 18분쯤이라 관리자 세션(1시간)이 여기서 끝나 있을 수 있음(11-20 두 번) → 끊겼으면 이 자리에서 로그인(브라우저가 열림)하고 이어 감
admin sts get-caller-identity >/dev/null 2>&1 || { echo "관리자 세션이 끝남 → 로그인 창을 엽니다"; aws login --profile admin; }
bash ../migration/sql.sh "$out/verify.sql" | tee "$out/verify.txt"
echo "지금 태스크 $(admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].runningCount' --output text)개"
bash cw-metrics.sh "$out" # CloudWatch 원본(1초 지표는 3시간만 남음) · 스케일링 결정 · ECS 이벤트
node ../scripts/coupon-report.mjs "$out/$name.json.gz"
echo "결과: load/$out/ (발급 확인 verify.txt: quantity · issued_count · user_coupons · users가 모두 쿠폰 수와 같아야 정상)"
if [ "$VIDEO_DEMO" = 1 ]; then
  echo "촬영 회차: k6 발급 $expected_issued + 손님 1 = $COUPONS; verify.txt와 k6.txt, 손님 실제 예약·결제·메일을 함께 확인. 일반 실험 기록에 섞지 말 것."
fi
