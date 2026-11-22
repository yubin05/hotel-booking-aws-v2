# 앱 진입점: hotel.vundle34.cloud → CloudFront(+WAF) → VPC Origin → Internal ALB (ADR-006 · 035)
# 서울과 함께 매일 만들고 지움. 올릴 때 seoul → global, 내릴 때 global → seoul (ADR-052)

# ---- 안내데스크: CloudFront ----

# AWS 관리형 정책 (ADR-051). 이름 앞에 Managed-가 붙고 UseOriginCacheControlHeaders만 예외
data "aws_cloudfront_cache_policy" "use_origin_headers" {
  name = "UseOriginCacheControlHeaders"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# HSTS · nosniff · X-Frame-Options 등 보안 헤더 (docs/10-security.md 4절)
data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "app" {
  enabled    = true
  comment    = "${local.name} app"
  aliases    = [local.app_domain]
  web_acl_id = aws_wafv2_web_acl.app.arn # WAFv2는 ID가 아니라 ARN

  # 입구가 열린 뒤에 원본을 바꿈 (리전 전환 순서: 새 리전 입구 열기 → 원본 교체 → 옛 리전 입구 닫기)
  depends_on = [aws_vpc_security_group_ingress_rule.alb_from_vpc_origin]

  origin {
    origin_id = "app"
    # ALB 인증서 이름. 길은 VPC Origin이 정하고, 이 이름은 TLS 이름 확인에 쓰임 (2026-11-15 확인, ADR-049)
    domain_name = local.origin_domain

    vpc_origin_config {
      vpc_origin_id = local.origin.vpc_origin_id # 손님을 보낼 리전의 통로 (origin.tf)
    }
  }

  # 점검 안내 페이지 (ADR-070): 사진 창고의 maintenance/index.html. 앱이 죽어도 받을 수 있게 앱과 다른 곳(S3), 서울이 안 되면 도쿄
  dynamic "origin" {
    for_each = local.photos_buckets
    content {
      origin_id                = "maintenance-${origin.key}"
      domain_name              = "${origin.value.name}.s3.${origin.value.region}.amazonaws.com"
      origin_access_control_id = aws_cloudfront_origin_access_control.photos.id
    }
  }

  origin_group {
    origin_id = "maintenance"
    failover_criteria {
      status_codes = [403, 404, 500, 502, 503, 504]
    }
    member {
      origin_id = "maintenance-seoul"
    }
    member {
      origin_id = "maintenance-tokyo"
    }
  }

  # 화면 파일: 앱이 붙인 Cache-Control을 따름 (assets 1년, index.html은 매번 확인)
  default_cache_behavior {
    target_origin_id           = "app"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.use_origin_headers.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
    compress                   = true
  }

  # API: 보관하지 않고 통로로만. 손님마다 응답이 달라 보관하면 남의 정보가 나감
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "app"
    viewer_protocol_policy     = "https-only" # POST를 리다이렉트하면 본문이 사라지므로 HTTP는 거절
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  ordered_cache_behavior {
    path_pattern               = "/maintenance/*"
    target_origin_id           = "maintenance"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id # 파일의 Cache-Control(5분)을 따름
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
    compress                   = true
  }

  # 앱 서버가 없을 때(ALB 대상 없음 503, 원본 연결 실패 502 · 504) 글자 대신 안내 페이지. 상태 코드는 그대로 둬 측정기 · 모니터링이 실패로 셈.
  # 배포 전체에 걸려 앱이 일부러 보낸 503(DB 혼잡 등)의 본문도 바뀔 수 있음 (ADR-070). 500(앱 일반 오류)은 그대로
  dynamic "custom_error_response" {
    for_each = [502, 503, 504]
    content {
      error_code            = custom_error_response.value
      response_code         = custom_error_response.value
      response_page_path    = "/maintenance/index.html"
      error_caching_min_ttl = 5 # 기본 10초. 복구 뒤 안내 페이지가 오래 남지 않게
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.app.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2025" # 2021은 CloudFront.15 통과 목록에 없음 (11 점검 보고서)
  }
}
