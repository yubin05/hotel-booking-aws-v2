data "aws_caller_identity" "current" {
}

locals {
  project_name  = "hotel-booking-aws-v2"
  account_id    = data.aws_caller_identity.current.account_id
  backup_region = "ap-northeast-1"
  bucket_name   = "${local.project_name}-tfstate-${local.account_id}-${local.backup_region}-an"
}

# Terraform State S3
resource "aws_s3_bucket" "tfstate" {
  bucket           = local.bucket_name
  bucket_namespace = "account-regional" # 계정별 이름 규칙 적용

  # Terraform에서 해당 리소스 삭제를 막아주기 위함
  lifecycle {
    prevent_destroy = true
  }
}

# Terraform State S3 버전 관리
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }

  # REVIEW(참고): 버킷의 prevent_destroy만으로도 `terraform destroy` 전체가 plan에서 거부됨. 그럼 여기 한 번 더 건 건 어떤 경우를 막나? (힌트: -target, 교체)
  # REVIEW(참고): 이 리소스가 destroy되면 버킷의 버전 관리는 실제로 어떻게 되나? (provider 문서) 답을 아래 주석에
  # Terraform에서 해당 리소스 삭제를 막아주기 위함
  lifecycle {
    prevent_destroy = true
  }
}

# Terraform State S3 공개 차단
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Terraform State S3 수명 주기
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  # 버전 관리가 먼저 활성화되어야 수명 주기 규칙이 정상 동작
  depends_on = [
    aws_s3_bucket_versioning.tfstate
  ]

  rule {
    id     = "cleanup-old-versions-and-lock-markers"
    status = "Enabled"

    # 모든 객체 적용
    filter {
    }

    # 이전 버전(Noncurrent) State 파일 삭제 정책
    # 30일이 지나고(AND) 5개 이전 버전이면 삭제
    #   - 30일이 지났지만 잘 되던 최신 버전 1개만 있으면 삭제하면 안됨
    #   - 단 기간에 걸쳐 버전을 많이 생성하는 데 5개가 넘었다고 해서 삭제하면 잘 되던 이전 버전이 삭제됨
    noncurrent_version_expiration {
      noncurrent_days           = 30
      newer_noncurrent_versions = 5
    }

    # use_lockfile 사용 시 생성/삭제를 반복하는 .tflock 파일의 만료된 삭제 마커(Delete Marker) 정리
    expiration {
      expired_object_delete_marker = true
    }
  }
}