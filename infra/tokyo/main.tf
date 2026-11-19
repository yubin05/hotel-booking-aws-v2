# 리전 복원용 도쿄. 평소에는 없고 리전 전환 PoC · DR 드릴 때만 올림 (ADR-009 Backup & Restore, ADR-035)
module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.1.0.0/16" # ADR-033 (서울 10.0과 겹치지 않게)
  # apne1-az3은 CloudFront VPC Origin을 지원하지 않음(문서). 이 계정의 도쿄 AZ는 az1 · az2 · az4
  az_ids = ["apne1-az1", "apne1-az2"]

  nat_count   = 1
  db_multi_az = false

  # 5단계 리전 복원 (ADR-062): 서울에서 복제된 백업으로 DB를 살리고, 되돌릴 때 dump 태스크로 덤프를 서울에 넘김
  restore_backup_arn = var.restore_backup_arn
  restore_time       = var.restore_time
  migration_tasks    = true
}
