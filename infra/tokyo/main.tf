# 리전 복원용 도쿄. 설계는 DB 복제본만 상시(Pilot Light, ADR-066), 포트폴리오는 DR 드릴 날만 올림 (ADR-035)
module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.1.0.0/16" # ADR-033 (서울 10.0과 겹치지 않게)
  # apne1-az3은 CloudFront VPC Origin을 지원하지 않음(문서). 이 계정의 도쿄 AZ는 az1 · az2 · az4
  az_ids = ["apne1-az1", "apne1-az2"]

  # 전환하면 도쿄가 메인이라 서울 설계와 같게 (ADR-073). NAT는 대기 상태에 없고 장애 때만 생겨 평소 비용 0
  nat_count = 2
  # 대기 복제본 · 장애 ① 복구는 Single-AZ, 손님을 받은 뒤 ② 보강에서 켬 (ADR-073, region.sh run이 terraform.tfvars에 씀)
  db_multi_az = var.multi_az
  rds_monitoring_role_arn = var.rds_enhanced_monitoring ? "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/hotel-booking-aws-v2-rds-enhanced-monitoring" : null
  rds_enhanced_monitoring = var.rds_enhanced_monitoring # 도쿄 승격+Multi-AZ 보강 때만 ON

  # 5단계 리전 복원 (ADR-066 Pilot Light): 평소 서울 DB의 읽기 복제본만 두고, 장애 때 승격. 되돌릴 때 dump 태스크로 덤프를 서울에 넘김
  replica_source_arn = var.replica_source_arn
  migration_tasks    = true

  # 전환해도 결제 · 메일 · 카톡이 돼야 복구 (ADR-071). 키는 금고 도쿄 복제본, 메일은 도쿄 SES
  app_integrations = true
  # v3 포인트 보류 경보는 꺼 둠(ADR-079): 전환 뒤에도 global의 DR 판단 알림(dr-alert)이 같은 주소(도쿄)를 봄. v3 때 v3_alarms = true(도쿄 주제 → 같은 Slack, ADR-073)
}

# Bootstrap에서 관리자가 생성한 역할의 ARN을 조합 (operator IAM GetRole 불필요).
data "aws_caller_identity" "current" {}
