#!/usr/bin/env bash
# 앱 서버에 비밀값을 보내고 앱 컨테이너를 띄운다 (start-db.sh 다음, 매일 1번. 새 이미지를 배포할 때도 다시 실행)
# 사용: bash infra/legacy/start-app.sh <Docker Hub 사용자>/<저장소>:<태그>
#
# 필요: PC의 ~/.hotel-legacy/app.env (저장소 밖, 한 번만 만듦)
#   cat > ~/.hotel-legacy/app.env <<EOF
#   JWT_SECRET=$(openssl rand -hex 32)
#   EOF
# DB 비밀번호는 여기에 넣지 않는다: 보낼 때 db.env의 MYSQL_PASSWORD를 꺼내 쓴다
set -euo pipefail
cd "$(dirname "$0")"

IMAGE=${1:?사용: bash start-app.sh <사용자>/<저장소>:<태그>}
DB_ENV=~/.hotel-legacy/db.env
APP_ENV=~/.hotel-legacy/app.env
for f in "$DB_ENV" "$APP_ENV"; do
  [ -f "$f" ] || { echo "$f 없음 (만드는 법은 start-db.sh · start-app.sh 맨 위)" >&2; exit 1; }
done
ssh-add -l >/dev/null 2>&1 || {
  echo '먼저 실행: eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy' >&2
  exit 1
}

APP=$(terraform output -raw web_instance_1_public_ip | tr -d '\r')
DB=$(terraform output -raw db_instance_1_private_ip | tr -d '\r')
# 서버 키 기록은 같은 날 먼저 실행한 start-db.sh가 정리했으므로 지우지 않는다

# 같은 비밀번호를 두 파일에 복사해 두면 한쪽만 바뀌었을 때 접속이 실패하므로 db.env 하나에서만 관리한다
DB_PASSWORD=$(grep '^MYSQL_PASSWORD=' "$DB_ENV" | cut -d= -f2-) || { echo "$DB_ENV에 MYSQL_PASSWORD 없음" >&2; exit 1; }
printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD" | cat - "$APP_ENV" | ssh "ec2-user@$APP" 'umask 077; cat > ~/app.env'

ssh "ec2-user@$APP" bash -s -- "$IMAGE" "$DB" <<'REMOTE'
set -euo pipefail
IMAGE=$1
DB_HOST=$2
trap 'rm -f ~/app.env' EXIT

cloud-init status --wait >/dev/null || { echo "user_data(도커 설치) 실패: /var/log/cloud-init-output.log 확인" >&2; exit 1; }

# run과 따로 먼저 받는다: 받기에 실패하면(태그 오타·비공개 저장소) 예전 컨테이너를 지우기 전에 멈추고,
# 같은 태그로 다시 올린 이미지도 새로 받는다 (run은 서버에 같은 태그가 있으면 받지 않음)
sudo docker pull "$IMAGE"
# 다시 배포할 때는 예전 컨테이너를 지우고 새로 띄운다 (그 몇 초는 접속이 끊김: 수동 배포의 한계)
sudo docker rm -f hotel-app >/dev/null 2>&1 || true
sudo docker run -d --name hotel-app --restart unless-stopped \
  --env-file ~/app.env \
  -e DB_HOST="$DB_HOST" \
  -p 80:3000 \
  "$IMAGE"

# /api/health/deep은 DB에 SELECT 1을 보내므로, 성공하면 앱 시작과 DB 연결(SG·비밀번호)이 모두 확인된다
for i in $(seq 30); do
  curl -fsS localhost/api/health/deep 2>/dev/null && { echo; exit 0; }
  sleep 2
done
echo "60초 안에 응답 없음. 마지막 로그:" >&2
sudo docker logs --tail 30 hotel-app >&2
exit 1
REMOTE

echo "브라우저: http://$APP"
