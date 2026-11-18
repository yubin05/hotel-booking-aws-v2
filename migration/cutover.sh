#!/usr/bin/env bash
# 덤프 이관 (3단계, ADR-008, docs/experiments/migration.md 1절): 옛 환경(IDC 역할) DB → 서울 RDS
#
#   bash migration/cutover.sh prep       사전 ②③: 새 주소 · 관리자 확인, 1회용 키를 SSM에, 점검 페이지 준비, 표지 손님 가입 (손님 영향 없음)
#   bash migration/cutover.sh rehearse   리허설 ⑥ ~ ⑧만: 점검 페이지 없이 덤프 · 잠가 올리기 → 복원 태스크 → 체크섬 비교 (손님 영향 없음)
#                                        AWS 쪽(S3 · 미리 서명 주소 · Fargate · RDS TLS · SSM 키)을 진짜 이관 전에 시험. 덤프가 테이블을 지우고 다시 만들어 run이 그대로 덮어씀
#   bash migration/cutover.sh run        중단 ⑤ ~ ⑩: 점검 페이지 → 덤프 · 잠가 올리기 → 복원 태스크 → 체크섬 비교 → migrate → 새 주소 예약
#   bash migration/cutover.sh rollback   되돌림: 점검 페이지를 내리고 옛 앱을 다시 켬 (검증 실패 · 40분 초과)
#   bash migration/cutover.sh cleanup    S3 덤프 · SSM 키 지우기 (run이 성공하면 자동)
#   bash migration/cutover.sh reset      다시 찍기: 옛 앱을 되살리고 새 DB를 비우고 앱 계정을 지워 이관 전 상태로 (yes 확인). 다음은 prep → run
#
# 결과: migration/results/<이름>/ steps.log(단계 시각), poll.log(1초마다 옛 주소 /api/health · 새 주소 /api/health/deep),
#       legacy.sum · rds.sum(체크섬), restore.log · migrate.log(태스크 로그)
# 필요: 옛 환경 · 서울 · global이 떠 있고 서울 migrate는 아직 안 돌림, 관리자 로그인(AWS_PROFILE=admin), ssh-agent에 legacy 키
set -Eeuo pipefail # -E: 함수 안 실패에도 되돌림 안내(ERR)가 뜨게
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1 # SSM 이름 · 로그 그룹(/로 시작)을 Git Bash가 윈도 경로로 바꾸지 않게

source lib.sh # admin() · run_task() · REGION · CLUSTER
LEGACY_DIR=${LEGACY_DIR:-../../hotel-booking-app/legacy} # 옛 환경 IP는 고객사 저장소 legacy state에서 (run-baseline.sh와 같음)
NEW=https://hotel.vundle34.cloud
KEY_PARAM=/hotel-booking/migration-key
MARKER=results/marker-email # prep이 가입시킨 표지 손님 (run이 읽음)
stamp() { echo "$(date +%T) $*" | tee -a "$OUT/steps.log"; }

cmd=${1:-}
REHEARSAL=0
case "$cmd" in prep | run | rollback | cleanup | reset) ;; rehearse) REHEARSAL=1 cmd=run ;; *) sed -n '4,10p' "$0" >&2; exit 1 ;; esac
ssh-add -l >/dev/null 2>&1 || { echo '먼저 실행: eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy' >&2; exit 1; }
APP=$(terraform -chdir="$LEGACY_DIR" output -raw web_instance_1_public_ip | tr -d '\r')
DB=$(terraform -chdir="$LEGACY_DIR" output -raw db_instance_1_private_ip | tr -d '\r')
OLD=http://$APP
ON_APP=(ssh "ec2-user@$APP")
ON_DB=(ssh -J "ec2-user@$APP" "ec2-user@$DB")
ARN=$(admin sts get-caller-identity --query Arn --output text)
[[ "$ARN" == *:assumed-role/* ]] || { echo "관리자 역할이 아님: $ARN (aws login --profile admin)" >&2; exit 1; }
ACCOUNT=$(cut -d: -f5 <<<"$ARN")
BUCKET=hotel-booking-aws-v2-migration-$ACCOUNT-$REGION-an # bootstrap migration.tf
code() { curl -s -m 5 -o /dev/null -w '%{http_code}' "$1" || true; }

cleanup() {
  admin s3 ls "s3://$BUCKET/" || true
  admin s3 rm --recursive --quiet "s3://$BUCKET/"   # 이관 전용 버킷이라 통째로 비움
  admin ssm delete-parameter --name "$KEY_PARAM" 2>/dev/null || true
  echo "덤프 · 키 지움 ($(date +%T))"
}

rollback() {
  "${ON_APP[@]}" 'sudo docker rm -f maintenance >/dev/null 2>&1; sudo docker start hotel-app >/dev/null'
  echo "옛 앱 다시 켬 ($(date +%T)), 옛 주소 /api/health: $(code "$OLD/api/health")"
}

# 같은 날 다시 찍기(녹화 등): 이관 뒤 상태를 이관 전으로 되돌림. 새 DB(서울 RDS)를 통째로 비우므로 확인을 받는다
reset() {
  local ok
  read -rp "새 DB(서울 RDS)를 비우고 앱 계정을 지웁니다(되돌릴 수 없음). 옛 DB는 그대로. 계속하려면 yes: " ok
  [ "$ok" = yes ] || { echo "멈춤" >&2; exit 1; }
  rollback
  mkdir -p results
  # migrate가 만든 'app'@'%'를 지워야 새 주소 /api/health/deep가 이관 전처럼 실패한다. DB는 같은 이름 · utf8mb4로 다시 만듦
  printf "DROP USER IF EXISTS 'app'@'%%';\nDROP DATABASE IF EXISTS hotel_booking;\nCREATE DATABASE hotel_booking CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\n" >results/reset.sql
  bash sql.sh results/reset.sql
  echo "이관 전 상태로 되돌림 ($(date +%T)). 새 주소 /api/health/deep: $(code "$NEW/api/health/deep") (200이 아니면 맞음). 다음: prep → run"
}

prep() {
  mkdir -p results
  [ "$(code "$NEW/api/health")" = 200 ] || { echo "새 주소가 안 뜸: 서울 · global apply 먼저" >&2; exit 1; }
  # deep은 app 계정으로 DB를 부른다. 200이면 migrate가 이미 돌아 시드가 들어간 RDS라 복원과 겹침
  [ "$(code "$NEW/api/health/deep")" != 200 ] || { echo "서울 RDS가 이미 migrate됨: 빈 RDS에만 복원한다(서울을 다시 올림)" >&2; exit 1; }
  [ "$(code "$OLD/api/health")" = 200 ] || { echo "옛 앱이 안 뜸: legacy start-app.sh 먼저" >&2; exit 1; }
  "${ON_DB[@]}" true # 처음 접속이면 지문 확인(yes)을 여기서
  # 1회용 키: 화면에 안 나오게 만들어 바로 SSM에 (복원 태스크는 실행 역할로 읽음)
  admin ssm put-parameter --name "$KEY_PARAM" --type SecureString --overwrite --value "$(openssl rand -base64 48)" >/dev/null
  # 점검 페이지: 503 + Retry-After (계획된 중단 안내, Google 권장). 이미지를 미리 받아 ⑤를 짧게
  "${ON_APP[@]}" 'sudo docker pull -q nginx:1.27-alpine >/dev/null && cat > ~/maintenance.conf' <<'CONF'
server {
  listen 80;
  default_type "text/html; charset=utf-8";
  add_header Retry-After 3600 always;
  location / {
    return 503 '<!doctype html><meta charset="utf-8"><title>서비스 점검 중</title><h1>서비스 점검 중입니다</h1><p>더 안정적인 서비스를 위해 서버를 옮기고 있습니다. 점검 시간: 03:00 ~ 04:00 (예정)</p>';
  }
}
CONF
  local email=migration-$(date +%m%d-%H%M%S)@example.com
  node marker.mjs register "$OLD" "$email"
  echo "$email" >"$MARKER"
  echo "준비 끝. 다음: bash migration/cutover.sh run"
}

run() {
  [ -s "$MARKER" ] || { echo "prep 먼저" >&2; exit 1; }
  local email name key t5 t10 sum_pid
  email=$(cat "$MARKER")
  name=$([ "$REHEARSAL" = 1 ] && echo rehearsal || echo cutover)-$(date +%m%d-%H%M)
  OUT=results/$name
  mkdir -p "$OUT"
  key=$(admin ssm get-parameter --name "$KEY_PARAM" --with-decryption --query Parameter.Value --output text)
  while :; do echo "$(date +%T) old=$(code "$OLD/api/health") new=$(code "$NEW/api/health/deep")"; sleep 1; done >"$OUT/poll.log" &
  POLL_PID=$! # 전역: 함수가 끝난 뒤 EXIT에서도 번호가 남아야 끔(지역 변수면 사라져 기록기가 계속 돎)
  trap 'kill $POLL_PID 2>/dev/null' EXIT
  trap 'echo "실패(위 단계). 40분 안에 다시 하거나 되돌림: bash migration/cutover.sh rollback" >&2' ERR

  t5=$(date +%s)
  if [ "$REHEARSAL" = 1 ]; then
    stamp "리허설 시작: 옛 앱은 그대로 (점검 페이지 · migrate 없이 ⑥ ~ ⑧만)"
  else
    stamp "⑤ 점검 시작: 옛 앱 멈춤 → 503 점검 페이지"
    "${ON_APP[@]}" 'sudo docker stop hotel-app >/dev/null && sudo docker run -d --name maintenance -p 80:80 -v "$HOME/maintenance.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine >/dev/null'
  fi

  # 옛 DB 체크섬은 덤프와 같이 돌림(쓰기가 멈춘 뒤라 둘이 같은 상태를 봄)
  { echo 'q() { MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4 -N "$MYSQL_DATABASE" -e "$1"; }'; cat checksum.sh; } |
    "${ON_DB[@]}" 'sudo docker exec -i hotel-db bash -s' >"$OUT/legacy.sum" &
  sum_pid=$!

  stamp "⑥ 덤프 → 압축 → 잠금(PC) → S3"
  # 평문 덤프는 SSH 통로 안과 메모리 파이프로만 지나가고 디스크에 남지 않는다. PC에는 잠근 파일만 잠깐 생겼다가 올린 뒤 지움
  "${ON_DB[@]}" "sudo docker exec hotel-db sh -c 'MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysqldump -uroot --single-transaction --order-by-primary --hex-blob \
    --default-character-set=utf8mb4 --routines=0 --triggers=0 --events=0 --set-gtid-purged=OFF --no-tablespaces \"\$MYSQL_DATABASE\" | gzip'" |
    MIGRATION_KEY="$key" openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -md sha256 -salt -pass env:MIGRATION_KEY -out "$OUT/dump.enc" # 상대 경로로: 윈도 openssl은 MSYS_NO_PATHCONV 아래서 /c/... 를 못 엶
  stamp "⑥ 덤프 크기 $(wc -c <"$OUT/dump.enc") 바이트(압축 · 잠금 후)"
  admin s3 cp --quiet "$OUT/dump.enc" "s3://$BUCKET/$name.sql.gz.enc"
  rm "$OUT/dump.enc"
  stamp "⑥ 올리기 끝"

  stamp "⑦ 복원 태스크 (주소 15분 유효)"
  local url
  url=$(admin s3 presign "s3://$BUCKET/$name.sql.gz.enc" --expires-in 900)
  run_task restore "{\"containerOverrides\":[{\"name\":\"restore\",\"environment\":[{\"name\":\"DUMP_URL\",\"value\":\"$url\"}]}]}" >"$OUT/restore.log"
  grep '^STEP' "$OUT/restore.log" | sed 's/^/    태스크 안(UTC) /' | tee -a "$OUT/steps.log"
  stamp "⑦ 복원 끝"

  wait "$sum_pid"
  grep -E '^(SUM|MARK) ' "$OUT/restore.log" >"$OUT/rds.sum"
  grep -E '^(SUM|MARK) ' "$OUT/legacy.sum" >"$OUT/legacy.only" && mv "$OUT/legacy.only" "$OUT/legacy.sum"
  grep -q "^MARK $email " "$OUT/legacy.sum" || { stamp "⑧ 옛 DB에 표지 손님이 없음"; exit 1; }
  if ! diff "$OUT/legacy.sum" "$OUT/rds.sum"; then stamp "⑧ 체크섬 불일치 (위 diff)"; exit 1; fi
  stamp "⑧ 체크섬 일치: 테이블 $(grep -c '^SUM' "$OUT/rds.sum")개, 표지 손님 이름 HEX 같음"
  if [ "$REHEARSAL" = 1 ]; then
    admin s3 rm --quiet "s3://$BUCKET/$name.sql.gz.enc" # 덤프는 지우고 키는 진짜 이관용으로 남김
    trap - ERR
    stamp "리허설 끝 ($(($(date +%s) - t5))초). 다음: bash migration/cutover.sh run"
    return
  fi

  stamp "⑨ migrate (app 계정 · 시연 계정, 숙소가 있어 시드는 건너뜀)"
  run_task migrate '{}' >"$OUT/migrate.log"
  stamp "⑨ migrate 끝"

  stamp "⑩ 새 주소에서 표지 손님 로그인 · 예약"
  node marker.mjs book "$NEW" "$email" | tee -a "$OUT/steps.log"
  t10=$(date +%s)
  stamp "⑩ 중단 끝. 중단 시간 $(((t10 - t5) / 60))분 $(((t10 - t5) % 60))초 (⑤ → ⑩)"
  sleep 3 # 1초 기록에 새 주소 200이 찍히게
  trap - ERR
  cleanup
  echo "1초 기록에서 옛 주소 503 줄 수: $(grep -c 'old=503' "$OUT/poll.log"), 결과: migration/$OUT/"
}

"$cmd"
