#!/usr/bin/env bash
# DB EC2에 ProxyJump(PC → 앱 → DB)로 접속해 user_data 결과를 확인 = NAT 검증
#   (DB의 docker 설치·SQL 받기·이미지 받기는 모두 NAT를 거쳐야 성공한다)
# 사용: bash infra/legacy/check-db.sh   (apply 후, Git Bash)
# 그냥 접속만:  ssh -J ec2-user@<앱 공인IP> ec2-user@<DB 사설IP>   (IP는 terraform output)
set -euo pipefail
cd "$(dirname "$0")"

# ProxyJump는 두 서버 모두 PC의 키로 인증하므로 ssh-agent에 키가 있어야 한다 (-i는 앱 쪽에 안 넘어감)
ssh-add -l >/dev/null 2>&1 || {
  echo '먼저 실행: eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy' >&2
  exit 1
}

APP=$(terraform output -raw web_instance_1_public_ip | tr -d '\r')
DB=$(terraform output -raw db_instance_1_private_ip | tr -d '\r')
echo "앱: $APP / DB: $DB"

# 매일 destroy·apply라 같은 IP에 새 서버 키가 올 수 있음 → 예전 기록을 지워 "HOST IDENTIFICATION HAS CHANGED" 방지
ssh-keygen -R "$APP" >/dev/null 2>&1 || true
ssh-keygen -R "$DB" >/dev/null 2>&1 || true

# 처음엔 서버 지문을 두 번(앱·DB) 물음 → yes
ssh -o ConnectTimeout=15 -J "ec2-user@$APP" "ec2-user@$DB" '
  cloud-init status --wait
  echo "NAT 대기 시도 횟수: $(sudo grep -c "curl -fsS --max-time 5" /var/log/cloud-init-output.log) (1이면 바로 성공)"
  ls -l /opt/hotel-db/initdb
  sudo docker images mysql
' || {
  echo "실패: 멈췄다가 끊겼으면 DB SG 22번(출발지 = 앱 SG), 접속은 됐는데 status: error면 cloud-init-output.log 확인" >&2
  exit 1
}
