module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.0.0.0/16" # ADR-033
  az_ids   = ["apne2-az1", "apne2-az3"]

  # 평소 1개(비용). AZ 장애 테스트 때 2로 바꿔 apply (ADR-034, RDS Multi-AZ와 같은 방식)
  nat_count   = 1
  db_multi_az = false # AZ 장애 테스트 때 true

  # 시각을 아는 급증(쿠폰 오픈 등)에 앱 태스크를 미리 늘려 둠 (ADR-015). 한국 시간, 끝난 이벤트는 지움
  # 준비까지 약 1분 반 + 예약 실행 지연(23~38초)이라 오픈 5분 전쯤 시작 (2026-11-16 시험)
  # 예: { name = "coupon-1120", start = "2026-11-20T19:55:00", end = "2026-11-20T20:30:00", min = 4 },
  scale_events = []

  # 시연용 호스트 · 관리자 계정 (ADR-060). SSM 파라미터 3개를 먼저 만들어야 migrate가 뜸 (런북 5-3)
  demo_accounts = true
}
