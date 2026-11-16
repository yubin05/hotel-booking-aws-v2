# 사진 진열대: img.hotel.vundle34.cloud → 사진 CloudFront(+WAF) → S3 서울, 안 되면 도쿄 (ADR-035 · 055)
# 창고(버킷) · 복제 · 사진은 bootstrap에 상시. 여기는 진열대와 출입증(버킷 정책)만, 앱과 함께 매일 만들고 지움

data "aws_caller_identity" "current" {}

# AWS 관리형 캐시 정책: 쿼리 문자열 · 헤더 · 쿠키를 캐시 키에서 뺌. `?x=1`처럼 바꿔 캐시를 우회해 S3로 몰리는 요청을 막음 (ADR-035)
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

locals {
  # bootstrap/photos.tf와 같은 이름 규칙 (평소 사용자는 bootstrap state를 못 읽음, ADR-028)
  photos_buckets = {
    seoul = { region = "ap-northeast-2", name = "${local.name}-photos-${data.aws_caller_identity.current.account_id}-ap-northeast-2-an" }
    tokyo = { region = "ap-northeast-1", name = "${local.name}-photos-${data.aws_caller_identity.current.account_id}-ap-northeast-1-an" }
  }
}

# 신분증: CloudFront가 S3로 보내는 요청마다 서명(SigV4)
resource "aws_cloudfront_origin_access_control" "photos" {
  name                              = "${local.name}-photos"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "photos" {
  enabled    = true
  comment    = "${local.name} photos"
  aliases    = [local.img_domain]
  web_acl_id = aws_wafv2_web_acl.app.arn # 앱과 같은 웹 ACL, 사진 요청 한도는 waf.tf에서 따로

  dynamic "origin" {
    for_each = local.photos_buckets
    content {
      origin_id                = origin.key
      domain_name              = "${origin.value.name}.s3.${origin.value.region}.amazonaws.com"
      origin_access_control_id = aws_cloudfront_origin_access_control.photos.id
    }
  }

  # 서울이 이 코드들을 주면 같은 요청을 도쿄로 다시 보냄 (GET · HEAD만 해당, 사진은 읽기뿐이라 충분)
  # 403: 버킷 정책이 없거나 파일이 없을 때(목록 권한을 안 줘서 404 대신 403), 5xx: 서울 S3 장애
  origin_group {
    origin_id = "photos"
    failover_criteria {
      status_codes = [403, 404, 500, 502, 503, 504]
    }
    member {
      origin_id = "seoul"
    }
    member {
      origin_id = "tokyo"
    }
  }

  # 사진 파일은 올릴 때 붙인 Cache-Control(1년)을 따름
  default_cache_behavior {
    target_origin_id           = "photos"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.app.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# 출입증: 오늘 만든 사진 배포만 읽기. 배포를 다시 만들면 ARN이 바뀌어 같은 수명으로 둠
# 배포 ARN을 고정값으로 적어 S3가 "공개 아님"으로 판단 → 버킷의 공개 차단에 막히지 않음
resource "aws_s3_bucket_policy" "photos" {
  for_each = local.photos_buckets
  region   = each.value.region
  bucket   = each.value.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowPhotoCloudFrontReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "arn:aws:s3:::${each.value.name}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.photos.arn }
      }
    }]
  })
}
