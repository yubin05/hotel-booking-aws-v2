#!/usr/bin/env bash
# DB 서버에 비밀값을 보내고 MySQL 컨테이너를 띄운다 (apply 다음, 매일 1번)
# user_data가 끝날 때까지 스스로 기다리므로 check-db.sh는 건너뛰어도 된다 (NAT 대기 횟수 등 자세히 볼 때만)
# 사용: bash infra/legacy/start-db.sh
#
# 필요: PC의 ~/.hotel-legacy/db.env (저장소 밖, 한 번만 만듦)
#   mkdir -p ~/.hotel-legacy
#   cat > ~/.hotel-legacy/db.env <<EOF
#   MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
#   MYSQL_DATABASE=hotel_booking
#   MYSQL_USER=app
#   MYSQL_PASSWORD=$(openssl rand -hex 16)
#   EOF
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=~/.hotel-legacy/db.env
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE 없음 (만드는 법은 이 파일 맨 위)" >&2; exit 1; }
ssh-add -l >/dev/null 2>&1 || {
  echo '먼저 실행: eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy' >&2
  exit 1
}

APP=$(terraform output -raw web_instance_1_public_ip | tr -d '\r')
DB=$(terraform output -raw db_instance_1_private_ip | tr -d '\r')

# 매일 새 서버라 같은 IP에 다른 서버 키가 올 수 있음 → 예전 기록 삭제 (check-db.sh와 같음)
ssh-keygen -R "$APP" >/dev/null 2>&1 || true
ssh-keygen -R "$DB" >/dev/null 2>&1 || true

# 비밀값은 SSH 통로로만 보내고 처음부터 600으로 만든다 (ADR-021)
ssh -J "ec2-user@$APP" "ec2-user@$DB" 'umask 077; cat > ~/db.env' < "$ENV_FILE"

ssh -J "ec2-user@$APP" "ec2-user@$DB" bash -s <<'REMOTE'
set -euo pipefail
# 성공·실패와 상관없이 서버에 비밀값 사본을 남기지 않는다 (값은 컨테이너 설정에 들어가고 재시작도 그걸 씀)
trap 'rm -f ~/db.env' EXIT

# user_data(도커 설치·SQL 받기)가 끝나기 전에 띄우면 -v가 빈 폴더를 만들어 테이블 없는 DB로 초기화됨
cloud-init status --wait >/dev/null || { echo "user_data 실패: bash check-db.sh로 로그 확인" >&2; exit 1; }
test -s /opt/hotel-db/initdb/2-seed.sql || { echo "SQL 파일 없음: bash check-db.sh로 확인" >&2; exit 1; }

sudo docker run -d --name hotel-db --restart unless-stopped \
  --env-file ~/db.env \
  -v /opt/hotel-db/initdb:/docker-entrypoint-initdb.d:ro \
  -p 3306:3306 \
  mysql:8.4

# initdb가 끝나고 실제 서버가 뜰 때까지 (임시 서버는 port: 0, X 플러그인은 port: 33060)
for i in $(seq 60); do
  sudo docker logs hotel-db 2>&1 | grep -q "port: 3306 " && break
  sleep 3
done
sudo docker exec hotel-db sh -c 'mysql -uapp -p"$MYSQL_PASSWORD" --default-character-set=utf8mb4 hotel_booking -e "SELECT COUNT(*) AS hotels FROM hotels; SELECT name FROM hotels LIMIT 1;"' 2>/dev/null
REMOTE
