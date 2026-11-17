# 계정 기본값: 아무도 안 쓰는 기능이라도 "실수로 공개 · 암호화 안 됨"이 생기지 않게 막아 둠 (11 점검 보고서)
# 모두 무료. 리전 단위 설정은 쓰는 리전 3곳 모두에

# 계정의 모든 S3 버킷에 공개 차단 (버킷마다 걸어도 새 버킷이 빠질 수 있음) (S3.1)
# 사진은 CloudFront OAC로만 읽어 공개가 아님 → 영향 없음
resource "aws_s3_account_public_access_block" "this" {
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 평소 사용자 vundle34가 콘솔 비밀번호를 씀 (IAM.7). 지금 비밀번호는 다음에 바꿀 때부터 적용
# 만료(max_password_age)는 두지 않음: 강제 교체는 짧고 약한 비밀번호를 부른다는 게 최근 권고
resource "aws_iam_account_password_policy" "this" {
  minimum_password_length        = 14
  require_uppercase_characters   = true
  require_lowercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
  password_reuse_prevention      = 24
}

# 새 EBS 볼륨은 자동 암호화 (EC2.7). 우리는 EBS를 안 쓰지만 누가 만들어도 암호화되게
resource "aws_ebs_encryption_by_default" "this" {
  for_each = local.used_regions
  region   = each.key
  enabled  = true
}

# EBS 스냅샷을 전체 공개로 공유하지 못하게 (EC2.182)
resource "aws_ebs_snapshot_block_public_access" "this" {
  for_each = local.used_regions
  region   = each.key
  state    = "block-all-sharing"
}

# SSM 문서를 전체 공개로 공유하지 못하게 (SSM.7)
resource "aws_ssm_service_setting" "block_public_document_sharing" {
  for_each      = local.used_regions
  region        = each.key
  setting_id    = "arn:aws:ssm:${each.key}:${local.account_id}:servicesetting/ssm/documents/console/public-sharing-permission"
  setting_value = "Disable"
}
