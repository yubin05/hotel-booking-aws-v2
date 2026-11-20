#!/usr/bin/env bash
# 3단계 쿠폰 오픈 스파이크 1회 (docs/experiments/migration.md 3절): 새 쿠폰을 T에 열고, 발생기에서 1,000명이 T에 함께 누름
#   bash load/run-coupon.sh <T: HH:MM> <fixed2|scheduled|none>     T는 지금보다 12분 이상 뒤(오픈 전 1,000명이 가입하며 모이는 데 약 7분, 11-20 실측), 회차 사이 20분(한 회차 약 18분)
#   fixed2(서버 최대 2대로 묶음, 옛 IDC처럼 못 늘림) · scheduled(예약 스케일링으로 미리 4대) · none(목표 추적만, 몰려드는 동안 늘어날 수 있음). fixed2는 먼저 런북 5-5의 "2대로 묶기"
#   scheduled는 먼저 infra/seoul/main.tf의 scale_events에 첫 T 5분 전 ~ 마지막 T + 10분, min 4를 넣고 apply (런북 5-1)
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

t=${1:-}; cond=${2:-}
[[ $t =~ ^[0-2][0-9]:[0-5][0-9]$ && ($cond == fixed2 || $cond == none || $cond == scheduled) ]] || { sed -n '3,5p' "$0" >&2; exit 1; }
open=$(date -d "$t" +%s) # 오늘 그 시각 (한국 시간)
[ $((open - $(date +%s))) -ge 720 ] || { echo "T($t)는 지금보다 12분 이상 뒤여야 함 (오픈 전 1,000명 가입 약 7분, 11-20 실측)" >&2; exit 1; }
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

name=coupon-$cond-$(date +%Y%m%d-%H%M%S)
out=results/$name
mkdir -p "$out"
id=66666666-0000-0000-0000-$(date -d "@$open" +%m%d%H%M)0000 # 회차마다 새 쿠폰 (T로 구분, 같은 T로 두 번 만들면 키 중복으로 멈춤)
# 발급 시작은 T 2초 전: 발생기 · DB 시계가 조금 달라도 T에 누른 요청이 '시작 전'(400)에 걸리지 않게. DB는 UTC
utc() { date -u -d "@$1" '+%F %T'; }
cat >"$out/coupon.sql" <<SQL
INSERT INTO coupons (id, name, discount_amount, quantity, starts_at, ends_at, expires_at)
VALUES ('$id', '쿠폰 오픈 시험 $t', 10000, $COUPONS, '$(utc $((open - 2)))', '$(utc $((open + 3600)))', '$(utc $((open + 7 * 86400)))');
SELECT id, name, quantity, issued_count, starts_at FROM coupons WHERE id = '$id';
SQL
bash ../migration/sql.sh "$out/coupon.sql" | tee "$out/coupon.txt"

"${ON_LOAD[@]}" 'cloud-init status --wait >/dev/null; mkdir -p ~/load/results; sudo docker rm k6 >/dev/null 2>&1 || true'
scp -q coupon-spike.js "ec2-user@$LOAD:load/"
# Grafana Cloud(실험 관제실, ADR-064)로 실시간 전송: PC에 쓰기 토큰 파일이 있을 때만. 토큰은 명령줄에 안 나오게 파일(--env-file)로 넘기고 끝나면 지움
rw=0
if grep -q '^K6_PROMETHEUS_RW_PASSWORD=.' ~/.hotel-legacy/grafana.env 2>/dev/null; then # 토큰 칸이 비어 있으면 끔
  scp -q ~/.hotel-legacy/grafana.env "ec2-user@$LOAD:load/grafana.env" && "${ON_LOAD[@]}" 'chmod 600 ~/load/grafana.env' && rw=1
fi
echo "Grafana 전송: $([ $rw = 1 ] && echo 켬 || echo '끔 (~/.hotel-legacy/grafana.env 없음 또는 토큰 빈칸)')"
# 조회는 시나리오 시작(가입이 끝난 뒤)부터 T + 30초 넘어까지 이어지게
"${ON_LOAD[@]}" bash -s -- "$name" "$BASE" "$id" "$((open * 1000))" "$COUPONS" "$CLAIMERS" "$((open - $(date +%s) + 30))" "$rw" <<'REMOTE'
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
  -e BASE_URL="$2" -e COUPON_ID="$3" -e OPEN_AT="$4" -e COUPONS="$5" -e CLAIMERS="$6" -e READ_SEC="$7" \
  -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/load/results/$name.html" \
  grafana/k6:1.0.0 run "${out[@]}" /load/coupon-spike.js >/dev/null
REMOTE
echo "시작: $name (T $t, 쿠폰 $COUPONS장, $CLAIMERS명). Ctrl+C로 빠져나와도 시험은 발생기에서 계속됨"
bash record-tasks.sh "$out/tasks.log" & # 태스크 수 5초 기록, 이 스크립트가 끝나면 멈춤
rec=$!
trap 'kill $rec 2>/dev/null' EXIT
"${ON_LOAD[@]}" 'sudo docker logs -f k6 2>&1 | grep --line-buffered -v "Request Failed"' || true

"${ON_LOAD[@]}" 'sudo docker logs k6' >"$out/k6.txt" 2>&1
scp -q "ec2-user@$LOAD:load/results/$name.*" "$out/"
"${ON_LOAD[@]}" 'sudo docker rm k6 >/dev/null; rm -f ~/load/grafana.env'
# 발급 확인: 발급 수 = 장 수(초과 0), 받은 줄 수 = 받은 사람 수(1인 1매)
cat >"$out/verify.sql" <<SQL
SELECT c.quantity, c.issued_count, COUNT(uc.id) AS user_coupons, COUNT(DISTINCT uc.user_id) AS users
  FROM coupons c LEFT JOIN user_coupons uc ON uc.coupon_id = c.id WHERE c.id = '$id' GROUP BY c.id;
SQL
# 회차가 18분쯤이라 관리자 세션(1시간)이 여기서 끝나 있을 수 있음(11-20 두 번) → 끊겼으면 이 자리에서 로그인(브라우저가 열림)하고 이어 감
admin sts get-caller-identity >/dev/null 2>&1 || { echo "관리자 세션이 끝남 → 로그인 창을 엽니다"; aws login --profile admin; }
bash ../migration/sql.sh "$out/verify.sql" | tee "$out/verify.txt"
echo "지금 태스크 $(admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].runningCount' --output text)개"
bash cw-metrics.sh "$out" # CloudWatch 원본(1초 지표는 3시간만 남음) · 스케일링 결정 · ECS 이벤트
node ../scripts/coupon-report.mjs "$out/$name.json.gz"
echo "결과: load/$out/ (발급 확인 verify.txt: quantity · issued_count · user_coupons · users가 모두 쿠폰 수와 같아야 정상)"
