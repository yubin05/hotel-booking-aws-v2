# 숙소 사진 창고 (ADR-035 · 055): 서울 원본 → 도쿄 복제, 사진은 상시 보관
# 버킷 정책(OAC: 그날 CloudFront 배포만 읽기)은 배포와 같은 수명이라 global에서 붙임

locals {
  photos_bucket       = "${local.project_name}-photos-${local.account_id}-${local.main_region}-an"
  photos_bucket_tokyo = "${local.project_name}-photos-${local.account_id}-${local.backup_region}-an"
}

# ---- 창고: 서울(원본) · 도쿄(복제본) ----

resource "aws_s3_bucket" "photos" {
  provider         = aws.seoul
  bucket           = local.photos_bucket
  bucket_namespace = "account-regional"
}

resource "aws_s3_bucket" "photos_tokyo" {
  bucket           = local.photos_bucket_tokyo
  bucket_namespace = "account-regional"
}

# 복제는 양쪽 모두 버전 관리가 켜져 있어야 함
resource "aws_s3_bucket_versioning" "photos" {
  provider = aws.seoul
  bucket   = aws_s3_bucket.photos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "photos_tokyo" {
  bucket = aws_s3_bucket.photos_tokyo.id
  versioning_configuration {
    status = "Enabled"
  }
}

# 손님은 CloudFront로만 (버킷 직접 공개 금지)
resource "aws_s3_bucket_public_access_block" "photos" {
  provider                = aws.seoul
  bucket                  = aws_s3_bucket.photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "photos_tokyo" {
  bucket                  = aws_s3_bucket.photos_tokyo.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 같은 이름으로 다시 올리면 옛 버전이 남으므로 7일 뒤 지움 (보관료가 몰래 늘지 않게)
resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  provider   = aws.seoul
  bucket     = aws_s3_bucket.photos.id
  depends_on = [aws_s3_bucket_versioning.photos]

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    expiration {
      expired_object_delete_marker = true
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "photos_tokyo" {
  bucket     = aws_s3_bucket.photos_tokyo.id
  depends_on = [aws_s3_bucket_versioning.photos_tokyo]

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    expiration {
      expired_object_delete_marker = true
    }
  }
}

# ---- 복제: 서울 → 도쿄 ----

# S3가 이 역할을 빌려 서울에서 읽고 도쿄에 씀
resource "aws_iam_role" "photos_replication" {
  name = "${local.project_name}-photos-replication"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "photos_replication" {
  name = "replicate-seoul-to-tokyo"
  role = aws_iam_role.photos_replication.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadSourceConfig"
        Effect   = "Allow"
        Action   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
        Resource = aws_s3_bucket.photos.arn
      },
      {
        Sid      = "ReadSourceObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging"]
        Resource = "${aws_s3_bucket.photos.arn}/*"
      },
      {
        Sid      = "WriteDestination"
        Effect   = "Allow"
        Action   = ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"]
        Resource = "${aws_s3_bucket.photos_tokyo.arn}/*"
      }
    ]
  })
}

# 사진을 올리기 전에 있어야 함 (규칙보다 먼저 있던 객체는 복제되지 않음)
resource "aws_s3_bucket_replication_configuration" "photos" {
  provider   = aws.seoul # 복제를 보내는 쪽
  bucket     = aws_s3_bucket.photos.id
  role       = aws_iam_role.photos_replication.arn
  depends_on = [aws_s3_bucket_versioning.photos, aws_s3_bucket_versioning.photos_tokyo]

  rule {
    id     = "seoul-to-tokyo"
    status = "Enabled"
    filter {} # 전체. filter를 쓰는 형식이라 지운 표시 복제를 따로 켜야 함

    # 서울에서 지운 사진이 도쿄에 남지 않게 (기본은 복제 안 함)
    delete_marker_replication {
      status = "Enabled"
    }

    destination {
      bucket        = aws_s3_bucket.photos_tokyo.arn
      storage_class = "STANDARD"
    }
  }
}
