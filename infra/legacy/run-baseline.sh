#!/usr/bin/env bash
# 부하 기준선 실행 (과제 3): 발생기에서 load/baseline.js를 돌리는 동안 서버 3대(앱·DB·발생기)의 CPU·메모리를 5초마다 남기고,
# 끝나면 결과를 PC의 load/results/<이름>/ 으로 가져온다.
# 순서: terraform apply -var is_load_test=true → start-db.sh → start-app.sh <이미지:태그> → 이 스크립트
#
#   bash run-baseline.sh                         본 실행 (약 37분)
#   bash run-baseline.sh --stage 30s:5 --stage 10s:0   뒤에 붙인 k6 옵션으로 짧게 (스모크 점검, 이름에 -try)
#   bash run-baseline.sh collect <이름>          SSH가 끊겼을 때: k6는 발생기에서 계속 도니, 끝난 뒤 결과만 가져온다
#
# 가져오는 것: k6.txt(터미널 출력·요약), <이름>.html(리포트), <이름>.json.gz(요청별 기록),
#              app·db·load.vmstat(5초마다 CPU·메모리, 시각은 UTC), containers.txt(앱·DB 재시작·메모리 부족 종료 여부),
#              consistency.txt(정합성 검사, 첫 표의 bad가 모두 0이어야 함)
set -euo pipefail
cd "$(dirname "$0")"

ssh-add -l >/dev/null 2>&1 || {
  echo '먼저 실행: eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy' >&2
  exit 1
}
APP=$(terraform output -raw web_instance_1_public_ip | tr -d '\r')
DB=$(terraform output -raw db_instance_1_private_ip | tr -d '\r')
LOAD=$(terraform output -raw load_test_instance_1_public_ip 2>/dev/null | tr -d '\r' || true)
[ -n "$LOAD" ] && [ "$LOAD" != null ] || {
  echo '발생기가 없음: terraform apply -var is_load_test=true 로 켜기' >&2
  exit 1
}
ON_APP=(ssh "ec2-user@$APP")
ON_DB=(ssh -J "ec2-user@$APP" "ec2-user@$DB")
ON_LOAD=(ssh "ec2-user@$LOAD")
RESULTS=../../load/results

collect() {
  local name=$1 out="$RESULTS/$1"
  if [ "$("${ON_LOAD[@]}" "sudo docker inspect -f '{{.State.Running}}' k6 2>/dev/null")" = true ]; then
    echo "k6가 아직 도는 중. 끝난 뒤 다시: bash run-baseline.sh collect $name" >&2
    exit 1
  fi
  mkdir -p "$out"
  "${ON_LOAD[@]}" 'sudo docker logs k6' >"$out/k6.txt" 2>&1
  scp -q "ec2-user@$LOAD:load/results/$name.*" "$out/"
  # 기록을 멈추고 가져온다 (pkill은 이미 멈췄으면 실패하므로 무시)
  "${ON_APP[@]}" 'pkill vmstat; cat ~/vmstat.log' >"$out/app.vmstat" || true
  "${ON_DB[@]}" 'pkill vmstat; cat ~/vmstat.log' >"$out/db.vmstat" || true
  "${ON_LOAD[@]}" 'pkill vmstat; cat ~/vmstat.log' >"$out/load.vmstat" || true
  # 부하 중 앱·DB가 죽었다 다시 떴는지(재시작 횟수, 메모리 부족 종료)와 커널의 OOM 기록
  {
    echo "[app] 재시작 횟수 · OOMKilled"; "${ON_APP[@]}" "sudo docker inspect -f '{{.RestartCount}} {{.State.OOMKilled}}' hotel-app"
    "${ON_APP[@]}" "sudo dmesg -T | grep -iE 'out of memory|killed process' || echo '커널 OOM 기록 없음'"
    echo "[db] 재시작 횟수 · OOMKilled"; "${ON_DB[@]}" "sudo docker inspect -f '{{.RestartCount}} {{.State.OOMKilled}}' hotel-db"
    "${ON_DB[@]}" "sudo dmesg -T | grep -iE 'out of memory|killed process' || echo '커널 OOM 기록 없음'"
  } >"$out/containers.txt" 2>&1
  "${ON_DB[@]}" "sudo docker exec -i hotel-db sh -c 'mysql -uapp -p\"\$MYSQL_PASSWORD\" --default-character-set=utf8mb4 -t hotel_booking' 2>/dev/null" \
    <../../scripts/check-consistency.sql >"$out/consistency.txt"
  "${ON_LOAD[@]}" 'sudo docker rm k6 >/dev/null'
  echo "결과: load/results/$name/"
  ls -1 "$out"
  grep -E 'http_reqs\.|http_req_failed|bookings_created|vus_max' "$out/k6.txt" || true
  cat "$out/containers.txt" "$out/consistency.txt"
}

if [ "${1:-}" = collect ]; then
  collect "${2:?사용: bash run-baseline.sh collect <이름>}"
  exit 0
fi

name=baseline-$(date +%Y%m%d-%H%M%S)
[ $# -gt 0 ] && name=baseline-try-$(date +%Y%m%d-%H%M%S)

# 발생기는 매일 새 서버라 같은 IP에 다른 서버 키가 올 수 있음 → 예전 기록 삭제 (앱·DB는 start-db.sh가 지움)
ssh-keygen -R "$LOAD" >/dev/null 2>&1 || true
if [ "$("${ON_LOAD[@]}" "sudo docker inspect -f '{{.State.Running}}' k6 2>/dev/null")" = true ]; then
  echo '발생기에서 k6가 이미 도는 중 (앞 실행이 안 끝남)' >&2
  exit 1
fi
"${ON_LOAD[@]}" 'cloud-init status --wait >/dev/null; mkdir -p ~/load/results; sudo docker rm k6 >/dev/null 2>&1 || true'
scp -q ../../load/baseline.js "ec2-user@$LOAD:load/"

# 5초마다 CPU·메모리(MB) 기록 시작. SSH가 끊겨도 서버에서 계속 돈다
START_VMSTAT='pkill vmstat; nohup vmstat -t -S M 5 >~/vmstat.log 2>&1 </dev/null &'
"${ON_APP[@]}" "$START_VMSTAT"
"${ON_DB[@]}" "$START_VMSTAT"
"${ON_LOAD[@]}" "$START_VMSTAT"

# k6는 발생기에서 따로 띄운다(-d): PC와의 SSH가 끊겨도 시험은 끝까지 간다.
# --network host: 컨테이너 네트워크 변환 없이 발생기 네트워크를 그대로 씀. --user: 결과 폴더(ec2-user 소유)에 쓸 수 있게
"${ON_LOAD[@]}" bash -s -- "$name" "$APP" "$@" <<'REMOTE'
set -euo pipefail
name=$1; app=$2; shift 2
sudo docker run -d --name k6 --network host --user "$(id -u):$(id -g)" -v ~/load:/load \
  -e BASE_URL="http://$app" -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/load/results/$name.html" \
  grafana/k6:1.0.0 run --out "json=/load/results/$name.json.gz" "$@" /load/baseline.js >/dev/null
REMOTE
echo "시작: $name (앱 http://$APP, 발생기 $LOAD). 진행을 따라 보여 줌. Ctrl+C로 빠져나와도 시험은 계속됨"
# 무너진 뒤에는 Request Failed 경고가 초당 수백 줄이라 Git Bash의 SSH가 끊긴 적이 있음(2회차) → 화면에서만 거른다. 전체 로그는 collect가 k6.txt로 받음
"${ON_LOAD[@]}" 'sudo docker logs -f k6 2>&1 | grep --line-buffered -v "Request Failed"' || {
  echo "연결이 끊김. 시험은 발생기에서 계속 돎. 끝난 뒤: bash run-baseline.sh collect $name" >&2
  exit 1
}
collect "$name"
