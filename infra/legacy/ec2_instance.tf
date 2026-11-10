# 웹 앱 인스턴스
resource "aws_instance" "web_instance_1" {
  ami           = var.al2023_ami_id
  instance_type = var.ec2_instance_type
  subnet_id     = aws_subnet.legacy_public_subnet_1.id

  vpc_security_group_ids = [
    aws_security_group.web_instance_sg.id
  ]

  key_name = aws_key_pair.ec2_key_pair.key_name

  user_data_replace_on_change = true
  user_data                   = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    # docker 설치
    dnf install -y docker
    systemctl enable --now docker
  EOF

  tags = {
    "Name" = "legacy-web_instance_1"
  }
}

# db 인스턴스
resource "aws_instance" "db_instance_1" {
  ami           = var.al2023_ami_id
  instance_type = var.ec2_instance_type
  subnet_id     = aws_subnet.legacy_private_subnet_1.id

  vpc_security_group_ids = [
    aws_security_group.db_instance_sg.id
  ]

  key_name = aws_key_pair.ec2_key_pair.key_name

  user_data_replace_on_change = true
  user_data                   = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    BASE=https://raw.githubusercontent.com/yubin05/hotel-booking-aws-v2/main/app/db
    DIR=/opt/hotel-db/initdb

    # NAT 준비 대기: 처음부터 apply하면 NAT와 DB가 같이 만들어져서
    # NAT의 iptables 설정보다 이 스크립트가 먼저 돌 수 있음. 인터넷이 될 때까지 최대 5분 재시도
    for i in $(seq 30); do
      curl -fsS --max-time 5 -o /dev/null "$BASE/schema.sql" && break
      sleep 10
    done

    # docker 설치 (NAT 경유)
    dnf install -y docker
    systemctl enable --now docker

    # 스키마·시드 받기: initdb가 이름 순서로 실행하므로 1-, 2- 를 붙임
    mkdir -p "$DIR"
    curl -fsS -o "$DIR/1-schema.sql" "$BASE/schema.sql"
    curl -fsS -o "$DIR/2-seed.sql" "$BASE/seed.sql"

    # 이미지만 미리 받아 둠 (Docker Hub, NAT 경유). 실행은 비밀값이 필요해서 SSH로 따로
    docker pull mysql:8.4
  EOF

  depends_on = [
    aws_instance.nat_instance_1
  ]

  tags = {
    "Name" = "legacy-db_instance_1"
  }
}
