module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.0.0.0/16" # ADR-033
  az_ids   = ["apne2-az1", "apne2-az3"]

  # 평소 NAT 1개 · RDS 한 AZ(비용). 4단계 RDS · AZ 장애 테스트 · 리전 드릴 날만 terraform.tfvars에 multi_az = true (ADR-034 · ADR-042)
  nat_count   = var.multi_az ? 2 : 1
  db_multi_az = var.multi_az
  rds_monitoring_role_arn = var.rds_enhanced_monitoring ? "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/hotel-booking-aws-v2-rds-enhanced-monitoring" : null
  rds_enhanced_monitoring = var.rds_enhanced_monitoring # 기본 OFF · Multi-AZ 드릴 때만 선택적 ON
  # DB 한계 시험(ADR-074 ②) 날만 terraform.tfvars에 db_pool_size = [5, 1] (서버 8대 고정 × 6 = 48 연결)
  db_pool_size = var.db_pool_size
  # 늘리기 개선 시험(ADR-074) 날만 terraform.tfvars에 app_requests_target = 4800 (태스크 1대 1분 요청 수)
  app_requests_target = var.app_requests_target

  # 시각을 아는 급증(쿠폰 오픈 등)에 앱 태스크를 미리 늘려 둠 (ADR-015). 한국 시간, 끝난 이벤트는 지움
  # end가 지난 뒤에 지울 것: 전에 지우면 최소를 되돌리는 예약도 사라져 최소 4가 남음(autoscaling.tf가 min · max를 ignore_changes, 11-26)
  # 준비까지 약 1분 반 + 예약 실행 지연(23~38초)이라 오픈 5분 전쯤 시작 (2026-11-16 시험)
  # 예: { name = "coupon-1120", start = "2026-11-20T19:55:00", end = "2026-11-20T20:30:00", min = 4 },
  scale_events = []

  # 쿠폰 격벽 실험 · ALB 접근 로그 (docs/experiments/migration.md). 그날만 terraform.tfvars에 coupon_service = true · alb_access_logs = true
  coupon_service  = var.coupon_service
  coupon_tasks    = var.coupon_tasks
  alb_access_logs = var.alb_access_logs

  # 쿠폰 수량 번호표 Valkey Serverless(ADR-080). 스위치 없이 서울과 같이 올리고 내림(켜 둔 동안 시간당 약 $0.01, 미확인). 도쿄는 꺼서 DB 경로
  valkey = true

  # 시연용 호스트 · 관리자 계정 (ADR-060). SSM 파라미터 3개를 먼저 만들어야 migrate가 뜸 (런북 5-3)
  demo_accounts = true

  # 결제 · 카카오 키(금고)와 메일 (ADR-071). 금고에 키를 먼저 넣어야 앱 태스크가 뜸 (런북 5-9)
  app_integrations = true
  # v3 포인트 보류 경보 → Slack은 꺼 둠(ADR-079). v3 시나리오 A 때: v3_alarms = true

  # 3단계 이관 · 검증용 일회성 태스크 정의 restore · sql (docs/experiments/migration.md). 태스크 정의는 무료
  migration_tasks = true
}

# Bootstrap에서 관리자가 생성한 역할의 ARN을 조합 (operator IAM GetRole 불필요).
data "aws_caller_identity" "current" {}
