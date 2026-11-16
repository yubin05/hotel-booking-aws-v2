module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.0.0.0/16" # ADR-033
  az_ids   = ["apne2-az1", "apne2-az3"]

  # 평소 1개(비용). AZ 장애 테스트 때 2로 바꿔 apply (ADR-034, RDS Multi-AZ와 같은 방식)
  nat_count   = 1
  db_multi_az = false # AZ 장애 테스트 때 true

  # 시각을 아는 급증(쿠폰 오픈 등)에 앱 태스크를 미리 늘려 둠 (ADR-015). 한국 시간, 끝난 이벤트는 지움
  scale_events = [
    { name = "test-20261116", start = "2026-11-16T16:45:00", end = "2026-11-16T17:00:00", min = 4 }, # 2단계 장치 시험
  ]
}
