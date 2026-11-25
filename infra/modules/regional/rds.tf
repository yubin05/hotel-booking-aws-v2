# RDS for MySQL (ADR-005). 데이터는 시드라 apply마다 새로 만들고 destroy 때 백업까지 지움 (ADR-042)

resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "RDS"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-db" }
}

# 보안 그룹 사슬의 끝: 태스크 → DB 3306만 (02 2절). DB는 밖으로 나갈 일이 없어 아웃바운드 규칙 없음
resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 3306
  to_port                      = 3306
}

# DB가 놓일 서브넷 묶음. RDS는 AZ 2개 이상이 필요 (az_ids 검사와 같은 이유)
resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.db[*].id
}

# 우리 설정표: 암호화(TLS)하지 않은 접속은 DB가 거부 (ADR-045)
# AWS 기본 설정표(default.mysql8.4)는 이 값이 비어 있어 MySQL 기본값 OFF가 적용됨 (2026-11-14 조회)
resource "aws_db_parameter_group" "this" {
  name   = local.name
  family = "mysql8.4"

  parameter {
    name  = "require_secure_transport"
    value = "1" # 동적 파라미터라 재부팅 없이 적용
  }
}

# 다른 리전 복제본은 받는 리전의 키를 지정해야 함(공급자 문서). AWS 관리 키, kms:DescribeKey만으로 조회(별칭 목록 권한 없이)
# Enhanced Monitoring IAM 역할은 bootstrap에서 생성, regional 모듈은 ARN만 받는다.
# IAM 역할 신규 생성에 따른 DR 보강 plan 변경과 운영자 AccessDenied를 방지한다.
data "aws_kms_key" "rds" {
  count  = var.replica_source_arn == null ? 0 : 1
  key_id = "alias/aws/rds"
}

# 관리자 비밀번호 (ADR-069): bootstrap 금고(리전마다 원본 · 복제본)에서 apply 동안만 읽고 state에 남기지 않음. 복제본은 원본 비밀번호를 물려받아 읽지 않음
ephemeral "aws_secretsmanager_secret_version" "db_admin" {
  count     = var.replica_source_arn == null ? 1 : 0
  secret_id = "${local.name}/db-admin-password"
}

resource "aws_db_instance" "this" {
  identifier     = local.name
  engine         = "mysql"
  engine_version = "8.4"          # 0단계 로컬과 같은 버전. 앞자리만 쓰면 최신 부 버전
  instance_class = "db.t4g.micro" # 1단계 DB 서버(t3.micro)와 같은 급이라 3단계에서 구조 효과만 비교. 3단계 뒤 확정

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true # AWS 관리 키(aws/rds), 추가 요금 없음
  kms_key_id        = one(data.aws_kms_key.rds[*].arn)

  # Pilot Light (ADR-066): 서울 주 DB의 복제본. 이 값을 빼고 apply하면 승격(공급자 문서) = 리전 전환의 DB 단계
  replicate_source_db = var.replica_source_arn

  # 복제본은 DB 이름 · 관리자 이름을 원본에서 받아 지정할 수 없음(공급자 문서). 앱 config의 기본 DB 이름
  db_name  = var.replica_source_arn == null ? "hotel_booking" : null
  username = var.replica_source_arn == null ? "admin" : null
  # RDS가 금고를 관리(manage_master_user_password)하면 MySQL 읽기 복제본을 못 만들어(RDS 문서) 우리 금고 값을 쓰기 전용으로 넣음.
  # 승격한 도쿄 DB도 같은 비밀번호라 도쿄 금고 복제본으로 바로 관리 (ADR-069). 교체는 bootstrap 금고 버전과 함께 숫자를 올림
  password_wo         = one(ephemeral.aws_secretsmanager_secret_version.db_admin[*].secret_string)
  password_wo_version = var.replica_source_arn == null ? 1 : null

  multi_az               = var.db_multi_az # 장애 실험 / 도쿄 승격 보강에서만 켬
  # RDSOSMetrics -secondary는 Enhanced Monitoring이 켜진 Multi-AZ 배포에서만 수집.
  # 기본 false 또는 db_multi_az=false -> OFF. 두 조건 모두 true일 때만 60초 수집.
  monitoring_interval    = var.rds_enhanced_monitoring && var.db_multi_az ? 60 : 0
  monitoring_role_arn    = var.rds_enhanced_monitoring && var.db_multi_az ? var.rds_monitoring_role_arn : null
  parameter_group_name   = aws_db_parameter_group.this.name
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  copy_tags_to_snapshot    = true # 스냅샷에도 태그가 붙어 누구 것인지 · 비용이 추적됨 (Security Hub RDS.17)
  backup_retention_period  = 7    # 시점 복구 범위 · 다른 리전 복제본의 전제 (끄면 그 기능들이 같이 꺼짐)
  delete_automated_backups = true # destroy 때 백업도 같이 지움 (남아서 요금이 쌓이지 않게)

  # 데이터는 시드라 매번 새로 만듦 (ADR-042). 실운영이면 최종 스냅샷 · 삭제 방지를 켬
  skip_final_snapshot = true
  deletion_protection = false
  apply_immediately   = true

  lifecycle {
    # 셋 다 바뀌면 DB를 새로 만드는 값. 승격 apply(복제본 → 독립 DB)에서 null → 값이 되어도 DB를 갈아 끼우지 않게
    ignore_changes = [db_name, username, kms_key_id]
  }
}
