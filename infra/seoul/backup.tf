# 5단계 리전 복원 드릴 (ADR-062): 서울 RDS 자동 백업(스냅샷 + 변경 로그)을 도쿄로 계속 복제. 드릴 날만 -var backup_replication=true
# 복제본은 서울 DB를 지워도 남아 요금이 쌓인다(RDS 문서) → 드릴 끝에 bash drill/region.sh cleanup

# 원본이 암호화(aws/rds)라 받는 리전의 키가 필요. kms:DescribeKey만으로 조회(별칭 목록 권한 없이)
data "aws_kms_key" "rds_tokyo" {
  count    = var.backup_replication ? 1 : 0
  provider = aws.tokyo
  key_id   = "alias/aws/rds"
}

resource "aws_db_instance_automated_backups_replication" "tokyo" {
  count                  = var.backup_replication ? 1 : 0
  provider               = aws.tokyo
  source_db_instance_arn = module.regional.db_instance_arn
  # shortcut: AWS 관리 키를 받는 쪽 키로 쓸 수 있는지는 문서에 없음(가설). 첫 apply에서 거부되면 도쿄에 고객 관리 키를 만듦
  kms_key_id = data.aws_kms_key.rds_tokyo[0].arn
  # 드릴은 가장 최근 시점만 쓴다. 남는 기간만큼 요금 (1일이 허용되는지는 첫 apply에서 확인)
  retention_period = 1
}
