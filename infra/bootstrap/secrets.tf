# 앱 비밀값 금고 (ADR-041)
# 값은 Terraform이 임시로 만들어 쓰기 전용으로 넣기만 하고 state에는 남기지 않음. 교체는 *_wo_version 숫자를 올려 apply
# 비밀번호는 데이터와 짝이라 매일 지우는 seoul이 아니라 여기(상시) 두고, 서울 장애에 대비해 도쿄로 복제

# ── 1. 금고 통: 서울이 원본, 도쿄가 복제본 ─────────────────────────────
resource "aws_secretsmanager_secret" "jwt" {
  provider = aws.seoul
  name     = "${local.project_name}/jwt-secret"

  replica {
    region = local.backup_region
  }
}

resource "aws_secretsmanager_secret" "db_app" {
  provider = aws.seoul
  name     = "${local.project_name}/db-app-password" # 앱 전용 DB 계정

  replica {
    region = local.backup_region
  }
}

# DB 관리자 비밀번호 (ADR-069). RDS가 금고를 관리하면 MySQL 읽기 복제본을 못 만들어(RDS 문서, 11-22 standby 거부) 여기로 옮김.
# 도쿄로 복제돼 서울 장애 중에도 승격한 도쿄 DB를 관리할 수 있다
resource "aws_secretsmanager_secret" "db_admin" {
  provider = aws.seoul
  name     = "${local.project_name}/db-admin-password"

  replica {
    region = local.backup_region
  }
}

# ── 2. 임시 랜덤 값: apply 동안만 메모리에 있고 state에 안 남음 ─────────
ephemeral "random_password" "jwt" {
  length  = 48
  special = false # 길이로 강도를 냄. 특수문자로 생기는 따옴표 · 이스케이프 문제를 피함
}

ephemeral "random_password" "db_app" {
  length  = 32
  special = false
}

ephemeral "random_password" "db_admin" {
  length  = 32
  special = false
}

# ── 3. 금고에 값 넣기: 쓰기 전용 ─────────────────────────────────────
resource "aws_secretsmanager_secret_version" "jwt" {
  provider                 = aws.seoul
  secret_id                = aws_secretsmanager_secret.jwt.id
  secret_string_wo         = ephemeral.random_password.jwt.result
  secret_string_wo_version = 1 # 교체할 때 2로 (그 순간 로그인 세션이 모두 풀림)
}

resource "aws_secretsmanager_secret_version" "db_app" {
  provider                 = aws.seoul
  secret_id                = aws_secretsmanager_secret.db_app.id
  secret_string_wo         = ephemeral.random_password.db_app.result
  secret_string_wo_version = 1 # 교체할 때는 DB 안의 앱 계정 비밀번호도 같이 바꿔야 함 (RDS 덩어리에서 절차)
}

resource "aws_secretsmanager_secret_version" "db_admin" {
  provider                 = aws.seoul
  secret_id                = aws_secretsmanager_secret.db_admin.id
  secret_string_wo         = ephemeral.random_password.db_admin.result
  secret_string_wo_version = 1 # 교체할 때 2로 올린 뒤 서울 apply(모듈의 password_wo_version도 같이 올림)
}
