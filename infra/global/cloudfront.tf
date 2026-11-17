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
