# 감사 로그 창고 (서울): CloudTrail(모든 리전) + Config(점검 켠 리전)이 같이 씀
# 경로가 AWSLogs/<계정>/CloudTrail/... 와 AWSLogs/<계정>/Config/... 로 갈려 섞이지 않음

resource "aws_s3_bucket" "audit_logs" {
  bucket           = local.audit_logs_bucket
  bucket_namespace = "account-regional"
}

resource "aws_s3_bucket_public_access_block" "audit_logs" {
  bucket                  = aws_s3_bucket.audit_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 시연 계정이라 90일 (실제 회사는 감사 제출용으로 1년 이상, ADR-057)
resource "aws_s3_bucket_lifecycle_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    id     = "expire-90-days"
    status = "Enabled"

    filter {
    }

    expiration {
      days = 90
    }
  }
}

# 문서의 버킷 정책 그대로: 쓰기 전에 버킷 권한 확인(GetBucketAcl) → 자기 경로에만 쓰기(PutObject)
# CloudTrail은 우리 트레일만(SourceArn), Config는 우리 계정만(SourceAccount)
resource "aws_s3_bucket_policy" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  # 공개 차단이 먼저 걸린 뒤 정책을 붙임 (둘을 동시에 바꾸면 S3가 거부할 때가 있음)
  depends_on = [aws_s3_bucket_public_access_block.audit_logs]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.audit_logs.arn
        Condition = {
          StringEquals = { "aws:SourceArn" = "arn:aws:cloudtrail:${local.main_region}:${local.account_id}:trail/${local.trail_name}" }
        }
      },
      {
        Sid       = "CloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.audit_logs.arn}/AWSLogs/${local.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "aws:SourceArn" = "arn:aws:cloudtrail:${local.main_region}:${local.account_id}:trail/${local.trail_name}"
          }
        }
      },
      {
        Sid       = "ConfigAclCheck"
        Effect    = "Allow"
        Principal = { Service = "config.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.audit_logs.arn
        Condition = {
          StringEquals = { "AWS:SourceAccount" = local.account_id }
        }
      },
      {
        Sid       = "ConfigExistenceCheck"
        Effect    = "Allow"
        Principal = { Service = "config.amazonaws.com" }
        Action    = "s3:ListBucket"
        Resource  = aws_s3_bucket.audit_logs.arn
        Condition = {
          StringEquals = { "AWS:SourceAccount" = local.account_id }
        }
      },
      {
        Sid       = "ConfigWrite"
        Effect    = "Allow"
        Principal = { Service = "config.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.audit_logs.arn}/AWSLogs/${local.account_id}/Config/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"      = "bucket-owner-full-control"
            "AWS:SourceAccount" = local.account_id
          }
        }
      },
      {
        # 암호화 안 된(HTTP) 요청은 누구든 거절 (Security Hub S3.5, 11 점검 보고서)
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.audit_logs.arn, "${aws_s3_bucket.audit_logs.arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}
