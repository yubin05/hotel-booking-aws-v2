module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.0.0.0/16" # ADR-033
  az_ids   = ["apne2-az1", "apne2-az3"]

  # 평소 NAT 1개 · RDS 한 AZ(비용). 4단계 RDS · AZ 장애 테스트 날만 -var multi_az=true (ADR-034 · ADR-042)
  nat_count   = var.multi_az ? 2 : 1
  db_multi_az = var.multi_az

  # 시각을 아는 급증(쿠폰 오픈 등)에 앱 태스크를 미리 늘려 둠 (ADR-015). 한국 시간, 끝난 이벤트는 지움
  # 준비까지 약 1분 반 + 예약 실행 지연(23~38초)이라 오픈 5분 전쯤 시작 (2026-11-16 시험)
  # 예: { name = "coupon-1120", start = "2026-11-20T19:55:00", end = "2026-11-20T20:30:00", min = 4 },
  scale_events = []

  # 시연용 호스트 · 관리자 계정 (ADR-060). SSM 파라미터 3개를 먼저 만들어야 migrate가 뜸 (런북 5-3)
  demo_accounts = true

  # 결제 · 카카오 키(금고)와 메일, 장애 경보 → Slack (ADR-071). 금고에 키를 먼저 넣어야 앱 태스크가 뜸 (런북 5-9)
  app_integrations = true
  alerts           = true

  # 3단계 이관 · 검증용 일회성 태스크 정의 restore · sql (docs/experiments/migration.md). 태스크 정의는 무료
  migration_tasks = true
}
