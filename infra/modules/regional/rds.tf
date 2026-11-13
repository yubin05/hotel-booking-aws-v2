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

resource "aws_db_instance" "this" {
  identifier     = local.name
  engine         = "mysql"
  engine_version = "8.4"          # 0단계 로컬과 같은 버전. 앞자리만 쓰면 최신 부 버전
  instance_class = "db.t4g.micro" # 1단계 DB 서버(t3.micro)와 같은 급이라 3단계에서 구조 효과만 비교. 3단계 뒤 확정

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true # AWS 관리 키(aws/rds), 추가 요금 없음

  db_name  = "hotel_booking" # 앱 config의 기본 DB 이름
  username = "admin"
  # 관리자 비밀번호는 RDS가 직접 만들어 Secrets Manager에 넣음. Terraform · 사람 모두 모름 (ADR-041)
  manage_master_user_password = true

  multi_az               = var.db_multi_az # 설계는 켬, 포트폴리오는 평소 끔 (NAT와 같은 방식)
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  backup_retention_period  = 7    # 시점 복구 범위 · 리전 간 백업 복제의 전제 (끄면 그 기능들이 같이 꺼짐)
  delete_automated_backups = true # destroy 때 백업도 같이 지움 (남아서 요금이 쌓이지 않게)

  # 데이터는 시드라 매번 새로 만듦 (ADR-042). 실운영이면 최종 스냅샷 · 삭제 방지를 켬
  skip_final_snapshot = true
  deletion_protection = false
  apply_immediately   = true
}
