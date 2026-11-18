# 3단계 이관 · 검증용 일회성 태스크 (ADR-008, docs/experiments/migration.md). 서울만 만든다(var.migration_tasks). 태스크 정의는 무료
#   restore: S3에 올린 잠긴 덤프를 받아 풀고 RDS에 넣은 뒤 체크섬을 찍고 끝남 (덤프 주소는 RunTask 덮어쓰기 DUMP_URL, 키는 SSM)
#   sql:     덮어쓰기로 받은 SQL(SQL_B64)을 관리자 계정으로 돌리고 결과를 로그로 (정합성 검사 · 쿠폰 발급 확인. RDS가 비공개라 서울 안에서)
# 덤프 주소가 새도 덤프는 잠겨 있어 읽을 수 없다(키는 실행 역할만 읽음: bootstrap ReadDemoAccountPasswords의 /hotel-booking/*)
locals {
  # 두 태스크 공통: RDS 인증서와 주소까지 확인하는 접속. 비밀번호는 명령 인자 대신 MYSQL_PWD로(ps에 안 보이게)
  db_preamble = <<-EOT
    set -euo pipefail
    curl -fsS -o /tmp/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
    export MYSQL_PWD="$DB_ADMIN_PASSWORD"
    db() { mysql -h "$DB_HOST" -u "$DB_ADMIN_USER" --ssl-mode=VERIFY_IDENTITY --ssl-ca=/tmp/rds-ca.pem --default-character-set=utf8mb4 "$@"; }
    q() { db -N "$DB_NAME" -e "$1"; }
  EOT

  migration_scripts = {
    restore = <<-EOT
      ${local.db_preamble}
      echo "STEP restore-start $(date -u +%T)"
      curl -fsS "$DUMP_URL" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -md sha256 -pass env:MIGRATION_KEY | gunzip | db "$DB_NAME"
      echo "STEP restore-end $(date -u +%T)"
      ${file("${path.module}/../../../migration/checksum.sh")}
      echo "STEP checksum-end $(date -u +%T)"
    EOT
    sql     = <<-EOT
      ${local.db_preamble}
      echo "$SQL_B64" | base64 -d | db -t "$DB_NAME"
    EOT
  }

  migration_secrets = {
    restore = [
      # cutover.sh가 이관 날 만들고 끝나면 지움. 없을 때 RunTask하면 태스크가 못 뜸
      { name = "MIGRATION_KEY", valueFrom = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/hotel-booking/migration-key" },
    ]
    sql = []
  }
}

resource "aws_ecs_task_definition" "migration" {
  for_each                 = var.migration_tasks ? local.migration_scripts : {}
  family                   = "${local.name}-${each.key}" # ADR-030
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256 # 받기 · 풀기 · SQL 보내기만 하고 일은 DB가 함 (migrate와 같음)
  memory                   = 512
  execution_role_arn       = local.execution_role_arn

  container_definitions = jsonencode([{
    name       = each.key
    image      = "mysql:8.4" # 옛 DB와 같은 이미지: mysql · curl · openssl · gzip이 다 있음 (2026-11-18 확인)
    essential  = true
    entryPoint = ["bash", "-c"]
    command    = [replace(each.value, "\r", "")] # 윈도에서 이 .tf가 CRLF로 받아져도 bash가 깨지지 않게

    environment = [
      { name = "DB_HOST", value = aws_db_instance.this.address },
      { name = "DB_NAME", value = aws_db_instance.this.db_name },
      { name = "DB_ADMIN_USER", value = aws_db_instance.this.username },
    ]
    secrets = concat([
      { name = "DB_ADMIN_PASSWORD", valueFrom = "${aws_db_instance.this.master_user_secret[0].secret_arn}:password::" },
    ], local.migration_secrets[each.key])

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = each.key
      }
    }
  }])
}
