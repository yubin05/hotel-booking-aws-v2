#!/usr/bin/env bash
# 부하 기준선 실행 (과제 3): 발생기에서 load/baseline.js를 돌리는 동안 서버 3대(앱·DB·발생기)의 CPU·메모리를 5초마다 남기고,
# 끝나면 결과를 PC의 load/results/<이름>/ 으로 가져온다.
# 순서(고객사 저장소 hotel-booking-app/legacy에서): terraform.tfvars에 is_load_test = true → apply → start-db.sh → start-app.sh <이미지:태그> → 이 스크립트
#
#   bash run-baseline.sh                         본 실행 (약 37분)
#   TARGET=aws bash run-baseline.sh              3단계: 이관 뒤 새 주소로 같은 시험 (이름 baseline-aws-*, 옛 서버 기록 · 정합성 검사 없음)
#   SCRIPT=realistic.js TARGET=aws bash run-baseline.sh   실제 손님 행동 한계점 시험(ADR-074, 이름 baseline-aws-real-*, FLOORS=8 → 4,000명 49분)
#   bash run-baseline.sh --stage 30s:5 --stage 10s:0   뒤에 붙인 k6 옵션으로 짧게 (스모크 점검, 이름에 -try)
#   bash run-baseline.sh collect <이름>          SSH가 끊겼을 때: k6는 발생기에서 계속 도니, 끝난 뒤 결과만 가져온다
#
# 가져오는 것: k6.txt(터미널 출력·요약), <이름>.html(리포트), <이름>.json.gz(요청별 기록), app·db.snap(30초마다 연결 상태),
#              app·db·load.vmstat(5초마다 CPU·메모리, 시각은 UTC), containers.txt(앱·DB 재시작·메모리 부족 종료 여부),
#              consistency.txt(정합성 검사, 첫 표의 bad가 모두 0이어야 함)
set -euo pipefail
cd "$(dirname "$0")"
# 서버 IP는 고객사 저장소의 legacy state에서 읽는다 (ADR-043). 두 저장소가 C:/dev 아래 나란히 있다고 보고, 다르면 LEGACY_DIR로 지정
LEGACY_DIR=${LEGACY_DIR:-../../hotel-booking-app/legacy}

ssh-add -l >/dev/null 2>&1 || {
  echo '먼저 실행: eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy' >&2
  exit 1
}
APP=$(terraform -chdir="$LEGACY_DIR" output -raw web_instance_1_public_ip | tr -d '\r')
DB=$(terraform -chdir="$LEGACY_DIR" output -raw db_instance_1_private_ip | tr -d '\r')
LOAD=$(terraform -chdir="$LEGACY_DIR" output -raw load_test_instance_1_public_ip 2>/dev/null | tr -d '\r' || true)
[ -n "$LOAD" ] && [ "$LOAD" != null ] || {
  echo "발생기가 없음: legacy terraform.tfvars에 is_load_test = true → terraform apply" >&2
  exit 1
}
ON_APP=(ssh "ec2-user@$APP")
ON_DB=(ssh -J "ec2-user@$APP" "ec2-user@$DB")
ON_LOAD=(ssh "ec2-user@$LOAD")
RESULTS=results
STOP_SNAP='kill "$(cat ~/snap.pid 2>/dev/null)" 2>/dev/null; rm -f ~/snap.pid; cat ~/snap.log'

collect() {
  local name=$1 out="$RESULTS/$1"
  if [ "$("${ON_LOAD[@]}" "sudo docker inspect -f '{{.State.Running}}' k6 2>/dev/null")" = true ]; then
    echo "k6가 아직 도는 중. 끝난 뒤 다시: bash run-baseline.sh collect $name" >&2
    exit 1
  fi
  mkdir -p "$out"
  # 시험 직후에는 앱 서버의 연결 추적 표가 아직 차 있어 SSH 새 연결도 버려질 수 있다(1.5단계: db.vmstat를 못 가져옴).
  # 닫힌 연결 기록은 120초 뒤 사라지므로 앱·DB에 접속될 때까지 최대 약 3분 기다린다
  [[ $name == baseline-aws-* ]] || for i in $(seq 12); do ssh -o ConnectTimeout=10 "ec2-user@$APP" true 2>/dev/null && ssh -o ConnectTimeout=10 -J "ec2-user@$APP" "ec2-user@$DB" true 2>/dev/null && break; echo "서버 접속 대기 중 ($i/12)" >&2; sleep 15; done
  "${ON_LOAD[@]}" 'sudo docker logs k6' >"$out/k6.txt" 2>&1
  # 손님 여정 k6(3단계만)는 준비가 짧아 몇 초 늦게 끝난다 → 최대 3분 기다린 뒤 로그를 받는다 (결과 파일은 아래 scp가 같이 받음)
  for _ in $(seq 36); do [ "$("${ON_LOAD[@]}" "sudo docker inspect -f '{{.State.Running}}' k6-journey 2>/dev/null")" = true ] || break; sleep 5; done
  "${ON_LOAD[@]}" 'sudo docker logs k6-journey' >"$out/journey.txt" 2>&1 || rm -f "$out/journey.txt"
  scp -q "ec2-user@$LOAD:load/results/$name.*" "$out/"
  # 기록을 멈추고 가져온다 (pkill은 이미 멈췄으면 실패하므로 무시)
  "${ON_LOAD[@]}" 'pkill vmstat; cat ~/vmstat.log' >"$out/load.vmstat" || true
  if [[ $name != baseline-aws-* ]]; then # 옛 환경 서버(앱 · DB)의 기록 · 정합성 검사. 3단계 서버 지표는 CloudWatch에서 (migration.md 2절)
  "${ON_APP[@]}" 'pkill vmstat; cat ~/vmstat.log' >"$out/app.vmstat" || true
  "${ON_DB[@]}" 'pkill vmstat; cat ~/vmstat.log' >"$out/db.vmstat" || true
  "${ON_APP[@]}" "$STOP_SNAP" >"$out/app.snap" || true
  "${ON_DB[@]}" "$STOP_SNAP" >"$out/db.snap" || true
  # 부하 중 앱·DB가 죽었다 다시 떴는지(재시작 횟수, 메모리 부족 종료)와 커널의 OOM 기록
  {
    echo "[app] 재시작 횟수 · OOMKilled"; "${ON_APP[@]}" "sudo docker inspect -f '{{.RestartCount}} {{.State.OOMKilled}}' hotel-app"
    "${ON_APP[@]}" "sudo dmesg -T | grep -iE 'out of memory|killed process' || echo '커널 OOM 기록 없음'"
    "${ON_APP[@]}" "sudo dmesg -T | grep -i conntrack | tail -3 || echo '연결 추적 표(conntrack) 경고 없음'"
    echo "[db] 재시작 횟수 · OOMKilled"; "${ON_DB[@]}" "sudo docker inspect -f '{{.RestartCount}} {{.State.OOMKilled}}' hotel-db"
    "${ON_DB[@]}" "sudo dmesg -T | grep -iE 'out of memory|killed process' || echo '커널 OOM 기록 없음'"
  } >"$out/containers.txt" 2>&1
  "${ON_DB[@]}" "sudo docker exec -i hotel-db sh -c 'mysql -uapp -p\"\$MYSQL_PASSWORD\" --default-character-set=utf8mb4 -t hotel_booking' 2>/dev/null" \
    <../scripts/check-consistency.sql >"$out/consistency.txt"
  fi
  "${ON_LOAD[@]}" 'sudo docker rm k6 >/dev/null && { sudo docker rm k6-journey >/dev/null 2>&1 || true; }'
  echo "결과: load/results/$name/"
  ls -1 "$out"
  grep -E 'http_reqs\.|http_req_failed|bookings_created|vus_max' "$out/k6.txt" || true
  cat "$out/containers.txt" "$out/consistency.txt" 2>/dev/null || true
}

if [ "${1:-}" = collect ]; then
  collect "${2:?사용: bash run-baseline.sh collect <이름>}"
  exit 0
fi

# 3단계(이관 뒤): TARGET=aws bash run-baseline.sh → 새 주소를 부르고 옛 서버 기록은 건너뜀.
# 발생기 IP는 global terraform.tfvars의 loadtest_ips = ["<발생기 IP>/32"]로 WAF 요청 수 한도에서 빼 둔다 (infra/README.md 5-4)
if [ "${TARGET:-legacy}" = aws ]; then pre=baseline-aws; base=https://hotel.vundle34.cloud; else pre=baseline; base=http://$APP; fi
# 실제 손님 행동 한계점 시험(ADR-074): SCRIPT=realistic.js TARGET=aws → 이름 baseline-aws-real-*, 계단 FLOORS층(기본 8 = 4,000명)
SCRIPT=${SCRIPT:-baseline.js}
case $SCRIPT in
  baseline.js) floors=6 tag= ;;
  realistic.js) floors=${FLOORS:-8} tag=real-; [ "$pre" = baseline-aws ] || { echo 'realistic.js는 TARGET=aws에서만' >&2; exit 1; } ;;
  *) echo "SCRIPT는 baseline.js 또는 realistic.js" >&2; exit 1 ;;
esac
name=$pre-$tag$(date +%Y%m%d-%H%M%S)
[ $# -gt 0 ] && name=$pre-${tag}try-$(date +%Y%m%d-%H%M%S)

# 발생기는 매일 새 서버라 같은 IP에 다른 서버 키가 올 수 있음 → 예전 기록 삭제 (앱·DB는 start-db.sh가 지움)
ssh-keygen -R "$LOAD" >/dev/null 2>&1 || true
if [ "$("${ON_LOAD[@]}" "sudo docker inspect -f '{{.State.Running}}' k6 2>/dev/null")" = true ]; then
  echo '발생기에서 k6가 이미 도는 중 (앞 실행이 안 끝남)' >&2
  exit 1
fi
"${ON_LOAD[@]}" 'cloud-init status --wait >/dev/null; mkdir -p ~/load/results; sudo docker rm k6 k6-journey >/dev/null 2>&1 || true'
scp -q baseline.js realistic.js journey.js "ec2-user@$LOAD:load/"

# 5초마다 CPU·메모리(MB) 기록 시작. SSH가 끊겨도 서버에서 계속 돈다
START_VMSTAT='pkill vmstat; nohup vmstat -t -S M 5 >~/vmstat.log 2>&1 </dev/null &'
"${ON_LOAD[@]}" "$START_VMSTAT"
if [ "$pre" = baseline ]; then # 옛 환경 서버(앱 · DB)만. 3단계 서버 지표는 CloudWatch에서
"${ON_APP[@]}" "$START_VMSTAT"
"${ON_DB[@]}" "$START_VMSTAT"

# 30초마다 연결 상태 스냅샷(앱 입구 · DB 처리 목록). 무너지는 순간을 사람이 지켜보며 찍지 않아도 되게 한다
# 프로세스 번호를 파일에 적어 두고 그 번호로 멈춘다 (pkill -f로 이름을 찾으면 같은 명령줄의 snap.sh 글자에 걸려 자기 자신을 죽임)
START_SNAP='[ -f ~/snap.pid ] && kill "$(cat ~/snap.pid)" 2>/dev/null; chmod +x ~/snap.sh; nohup ~/snap.sh >~/snap.log 2>&1 </dev/null & echo $! >~/snap.pid'
"${ON_APP[@]}" 'cat > ~/snap.sh' <snap-app.sh && "${ON_APP[@]}" "$START_SNAP"
"${ON_DB[@]}" 'cat > ~/snap.sh' <snap-db.sh && "${ON_DB[@]}" "$START_SNAP"
fi

# k6는 발생기에서 따로 띄운다(-d): PC와의 SSH가 끊겨도 시험은 끝까지 간다.
# --network host: 컨테이너 네트워크 변환 없이 발생기 네트워크를 그대로 씀. --user: 결과 폴더(ec2-user 소유)에 쓸 수 있게
# Grafana Cloud(실험 관제실, ADR-064)로 실시간 전송: 3단계(aws)이고 PC의 토큰 칸이 채워져 있을 때만. 토큰은 파일(--env-file)로 넘기고 컨테이너가 뜨면 지움
rw=0
if [ "$pre" = baseline-aws ] && grep -q '^K6_PROMETHEUS_RW_PASSWORD=.' ~/.hotel-legacy/grafana.env 2>/dev/null; then
  scp -q ~/.hotel-legacy/grafana.env "ec2-user@$LOAD:load/grafana.env" && "${ON_LOAD[@]}" 'chmod 600 ~/load/grafana.env' && rw=1
fi
[ "$pre" = baseline-aws ] && echo "Grafana 전송: $([ $rw = 1 ] && echo 켬 || echo '끔 (~/.hotel-legacy/grafana.env 없음 또는 토큰 빈칸)')"
"${ON_LOAD[@]}" bash -s -- "$name" "$base" "$rw" "$SCRIPT" "$floors" "$@" <<'REMOTE'
set -euo pipefail
name=$1; base=$2; rw=$3; script=$4; floors=$5; shift 5
grafana=() out=(--out "json=/load/results/$name.json.gz")
if [ "$rw" = 1 ]; then # 쿠폰과 같게 1초마다 p95 · p99 · 최대. 요청 주소(url) 태그는 빼서 숙소마다 시리즈가 늘지 않게 (이름 태그로 구분)
  grafana=(--env-file "$HOME/load/grafana.env" -e 'K6_PROMETHEUS_RW_TREND_STATS=p(95),p(99),max' -e K6_PROMETHEUS_RW_PUSH_INTERVAL=1s -e K6_PROMETHEUS_RW_STALE_MARKERS=true
    -e K6_SYSTEM_TAGS=status,method,name,group,check,error,error_code,scenario,expected_response)
  out+=(-o experimental-prometheus-rw --tag "testid=$name")
fi
sudo docker run -d --name k6 --network host --user "$(id -u):$(id -g)" -v ~/load:/load "${grafana[@]}" \
  -e BASE_URL="$base" -e FLOORS="$floors" -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/load/results/$name.html" \
  grafana/k6:1.0.0 run "${out[@]}" "$@" "/load/$script" >/dev/null
rm -f ~/load/grafana.env # docker는 컨테이너를 만들 때 읽어 이제 필요 없음
# 손님 여정(journey.js, 3단계만): 같은 시간 동안 손님 20명이 첫 화면부터 예약까지 반복. 부하와 따로 띄워 baseline.js는 그대로 (2026-11-24)
if [[ $name == baseline-aws-* ]]; then
  # 계단(층마다 6분) + 내려오기 1분 + 부하 쪽 준비(계정 가입) 시간만큼 2분 더. 짧은 스모크면 2분(여정 1회 약 1분)
  jd=$((floors * 6 + 3))m; [ $# -gt 0 ] && jd=2m
  sudo docker run -d --name k6-journey --network host --user "$(id -u):$(id -g)" -v ~/load:/load -e BASE_URL="$base" -e DURATION="$jd" \
    grafana/k6:1.0.0 run --out "json=/load/results/$name.journey.gz" /load/journey.js >/dev/null
fi
REMOTE
echo "시작: $name (대상 $base, 발생기 $LOAD). 진행을 따라 보여 줌. Ctrl+C로 빠져나와도 시험은 계속됨"
if [ "$pre" = baseline-aws ]; then # 태스크 수 5초 기록 (이 스크립트가 끝나면 멈춤. 연결이 끊기면 그 뒤는 scaling.json · ECS 이벤트로)
  mkdir -p "$RESULTS/$name"
  bash record-tasks.sh "$RESULTS/$name/tasks.log" &
  rec=$!
  trap 'kill $rec 2>/dev/null' EXIT
fi
# 무너진 뒤에는 Request Failed 경고가 초당 수백 줄이라 Git Bash의 SSH가 끊긴 적이 있음(2회차) → 화면에서만 거른다. 전체 로그는 collect가 k6.txt로 받음
"${ON_LOAD[@]}" 'sudo docker logs -f k6 2>&1 | grep --line-buffered -v "Request Failed"' || {
  echo "연결이 끊김. 시험은 발생기에서 계속 돎. 끝난 뒤: bash run-baseline.sh collect $name" >&2
  exit 1
}
collect "$name"
