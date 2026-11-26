# ALB 접근 로그 버킷 (서울). 요청마다 ALB에서 기다린 시간(request_processing_time)과 앱이 처리한 시간(target_processing_time)을
# 나눠 본다: 쿠폰 쏠림 때 조회 지연이 ALB · 앱 중 어디서 생기는지 진단(docs/experiments/migration.md 해결 (가) 다음)
# 서울 루트는 매일 지우므로 버킷은 여기 두고, 서울 ALB는 alb_access_logs = true인 날만 쓴다. 비어 있으면 무료, 7일 뒤 삭제
# 이름은 이관 버킷과 달리 계정 · 리전 이름 공간(-an)을 쓰지 않음: ELB 로그 전달이 그 버킷을 지원하는지 확인 못 함
locals {
  alb_logs_bucket = "${local.project_name}-alb-logs-${local.account_id}" # 서울 모듈 alb.tf와 같은 이름
}

# 2022-08 전부터 있던 리전(서울 포함으로 보임)은 리전별 ELB 계정, 그 뒤 리전은 서비스 주체에 쓰기를 허용 (ELB 접근 로그 문서)
# 어느 쪽인지 문서로 못 가려 둘 다 연다. 틀리면 ALB가 로그를 켤 때 거부해서 apply가 바로 실패함
data "aws_elb_service_account" "seoul" {
  provider = aws.seoul
}

resource "aws_s3_bucket" "alb_logs" {
  provider      = aws.seoul
  bucket        = local.alb_logs_bucket
  force_destroy = true # 로그만 들어 있음. 버킷을 지울 때 남은 로그도 같이
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  provider                = aws.seoul
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "alb_logs" {
  provider   = aws.seoul
  bucket     = aws_s3_bucket.alb_logs.id
  depends_on = [aws_s3_bucket_public_access_block.alb_logs]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "ElbAccountWrite"
        Effect    = "Allow"
        Principal = { AWS = data.aws_elb_service_account.seoul.arn }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs.arn}/AWSLogs/${local.account_id}/*"
      },
      {
        Sid       = "ElbLogDeliveryWrite"
        Effect    = "Allow"
        Principal = { Service = "logdelivery.elasticloadbalancing.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs.arn}/AWSLogs/${local.account_id}/*"
      },
      {
        # HTTPS가 아닌 요청은 누구든 거부 (S3 보안 권장, Security Hub S3.5)
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.alb_logs.arn, "${aws_s3_bucket.alb_logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  provider = aws.seoul
  bucket   = aws_s3_bucket.alb_logs.id
  rule {
    id     = "expire-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = 7 # 진단이 끝난 로그는 남기지 않음. 분석할 원본은 비공개 Drive로 옮김
    }
  }
}
