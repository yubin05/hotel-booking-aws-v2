# 리전 복원용 도쿄. 설계는 DB 복제본만 상시(Pilot Light, ADR-066), 포트폴리오는 DR 드릴 날만 올림 (ADR-035)
module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.1.0.0/16" # ADR-033 (서울 10.0과 겹치지 않게)
  # apne1-az3은 CloudFront VPC Origin을 지원하지 않음(문서). 이 계정의 도쿄 AZ는 az1 · az2 · az4
  az_ids = ["apne1-az1", "apne1-az2"]

  nat_count   = 1
  db_multi_az = false

  # 5단계 리전 복원 (ADR-066 Pilot Light): 평소 서울 DB의 읽기 복제본만 두고, 장애 때 승격. 되돌릴 때 dump 태스크로 덤프를 서울에 넘김
  replica_source_arn = var.replica_source_arn
  migration_tasks    = true
}
