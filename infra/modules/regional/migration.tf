# 덤프 이관 복원 태스크 (3단계, ADR-008, docs/experiments/migration.md): S3에 올린 잠긴 덤프를 받아 풀고 RDS에 넣은 뒤 체크섬을 찍고 끝남
# 서울만 만든다(var.migration_restore). 덤프 주소(미리 서명한 GET, 15분)는 RunTask 덮어쓰기 DUMP_URL로, 푸는 키는 SSM에서 받음
# 주소가 새도 덤프는 잠겨 있어 읽을 수 없다(키는 실행 역할만 읽음: bootstrap ReadDemoAccountPasswords의 /hotel-booking/*)
locals {
  # q(): checksum.sh가 쓰는 조회 함수. 비밀번호는 명령 인자 대신 MYSQL_PWD로(ps에 안 보이게), RDS 인증서와 주소까지 확인
  restore_script = <<-EOT
    set -euo pipefail
    curl -fsS -o /tmp/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
    export MYSQL_PWD="$DB_ADMIN_PASSWORD"
    db() { mysql -h "$DB_HOST" -u "$DB_ADMIN_USER" --ssl-mode=VERIFY_IDENTITY --ssl-ca=/tmp/rds-ca.pem --default-character-set=utf8mb4 "$@"; }
    q() { db -N "$DB_NAME" -e "$1"; }
    echo "STEP restore-start $(date -u +%T)"
    curl -fsS "$DUMP_URL" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -md sha256 -pass env:MIGRATION_KEY | gunzip | db "$DB_NAME"
    echo "STEP restore-end $(date -u +%T)"
    ${file("${path.module}/../../../migration/checksum.sh")}
    echo "STEP checksum-end $(date -u +%T)"
  EOT
}

resource "aws_ecs_task_definition" "restore" {
  count                    = var.migration_restore ? 1 : 0
  family                   = "${local.name}-restore" # ADR-030
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256 # 받기 · 풀기 · SQL 보내기만 하고 일은 DB가 함 (migrate와 같음)
  memory                   = 512
  execution_role_arn       = local.execution_role_arn

  container_definitions = jsonencode([{
    name       = "restore"
    image      = "mysql:8.4" # 옛 DB와 같은 이미지: mysql · curl · openssl · gzip이 다 있음 (2026-11-18 확인)
    essential  = true
    entryPoint = ["bash", "-c"]
    command    = [replace(local.restore_script, "\r", "")] # 윈도에서 이 .tf가 CRLF로 받아져도 bash가 깨지지 않게

    environment = [
      { name = "DB_HOST", value = aws_db_instance.this.address },
      { name = "DB_NAME", value = aws_db_instance.this.db_name },
      { name = "DB_ADMIN_USER", value = aws_db_instance.this.username },
    ]
    secrets = [
      { name = "DB_ADMIN_PASSWORD", valueFrom = "${aws_db_instance.this.master_user_secret[0].secret_arn}:password::" },
      # 이관 날 cutover.sh가 만들고 끝나면 지움. 없을 때 RunTask하면 태스크가 못 뜸
      { name = "MIGRATION_KEY", valueFrom = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/hotel-booking/migration-key" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "restore"
      }
    }
  }])
}
