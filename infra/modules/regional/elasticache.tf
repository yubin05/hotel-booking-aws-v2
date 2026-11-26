# 쿠폰 수량 번호표 (ADR-080): 3,000명 쏠림에서 탈락자가 당첨자 발급(쿠폰 행 하나를 한 명씩)을 기다리다 3초 상한(503)에 걸려,
# 여러 서버가 같이 보는 원자적 카운터로 도착 즉시 당첨 · 탈락을 가름(docs/experiments/migration.md 회차 8)
# Serverless: 여러 AZ에 자동 저장 · 크기 계획 없음 · 쓴 만큼(Valkey는 저장 최소 100MB 과금). 항상 클러스터 모드 · TLS 필수
resource "aws_security_group" "valkey" {
  count       = var.valkey ? 1 : 0
  name        = "${local.name}-valkey"
  description = "Valkey serverless (coupon tickets)"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-valkey" }
}

# 앱 태스크에서만. 6380은 Serverless의 복제본 읽기 포트(우리는 안 쓰지만 Serverless 문서의 기본 짝)
resource "aws_vpc_security_group_ingress_rule" "valkey_from_app" {
  count                        = var.valkey ? 1 : 0
  security_group_id            = aws_security_group.valkey[0].id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6380
}

resource "aws_elasticache_serverless_cache" "valkey" {
  count                = var.valkey ? 1 : 0
  engine               = "valkey"
  name                 = "${local.name}-coupon"
  major_engine_version = "8"
  subnet_ids           = aws_subnet.app[*].id
  security_group_ids   = [aws_security_group.valkey[0].id]

  # 번호표 몇 개뿐이라 저장 상한을 낮게(요금 상한). 명령 수(ECPU)는 쏠림 때 막히지 않게 상한을 두지 않음
  cache_usage_limits {
    data_storage {
      maximum = 1
      unit    = "GB"
    }
  }
}
