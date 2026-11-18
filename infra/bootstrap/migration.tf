# 덤프 이관 버킷 (3단계, ADR-008, docs/experiments/migration.md): 운영 PC가 잠근 덤프를 잠깐 맡겨 두는 택배 보관함
# 덤프에는 손님 개인정보가 있다. 올리기 전에 잠그고(클라이언트 측 암호화), 복원 뒤 cutover.sh가 바로 지우고, 남아도 1일 뒤 자동 삭제
# 버전 관리는 켜지 않는다: 켜면 지운 덤프가 옛 버전으로 남음. 비어 있으면 무료라 상시로 둔다
locals {
  migration_bucket = "${local.project_name}-migration-${local.account_id}-${local.main_region}-an"
}

resource "aws_s3_bucket" "migration" {
  provider         = aws.seoul # RDS와 같은 리전
  bucket           = local.migration_bucket
  bucket_namespace = "account-regional"
}

resource "aws_s3_bucket_public_access_block" "migration" {
  provider                = aws.seoul
  bucket                  = aws_s3_bucket.migration.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# HTTPS가 아닌 요청은 누구든 거부 (S3 보안 권장, Security Hub S3.5)
resource "aws_s3_bucket_policy" "migration" {
  provider   = aws.seoul
  bucket     = aws_s3_bucket.migration.id
  depends_on = [aws_s3_bucket_public_access_block.migration]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.migration.arn, "${aws_s3_bucket.migration.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# 지우기를 잊어도 1일 뒤 사라짐 (수명 주기 최소 단위가 1일)
resource "aws_s3_bucket_lifecycle_configuration" "migration" {
  provider = aws.seoul
  bucket   = aws_s3_bucket.migration.id
  rule {
    id     = "expire-dumps"
    status = "Enabled"
    filter {}
    expiration {
      days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1 # 올리다 끊긴 조각도 남기지 않음
    }
  }
}
