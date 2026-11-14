# 앱 진입점: hotel.vundle34.cloud → CloudFront(+WAF) → VPC Origin → Internal ALB (ADR-006 · 035)
# 서울과 함께 매일 만들고 지움. 올릴 때 seoul → global, 내릴 때 global → seoul (ADR-052)

variable "origin_region" {
  description = "앱 원본(ALB)이 있는 리전. 리전 전환 때 도쿄로 바꿔 apply (ADR-012, 전환 PoC는 다음 덩어리)"
  type        = string
  default     = "ap-northeast-2"
}

locals {
  name          = "hotel-booking-aws-v2"
  zone_name     = "vundle34.cloud"
  app_domain    = "hotel.${local.zone_name}"
  origin_domain = "origin.${local.app_domain}" # regional 모듈이 ALB에 단 인증서와 같은 이름
}

data "aws_route53_zone" "main" {
  name = local.zone_name
}

# seoul 루트가 만든 ALB를 이름으로 찾음 (서울 · 도쿄 같은 이름, ADR-030)
data "aws_lb" "app" {
  region = var.origin_region
  name   = local.name
}

# ---- 간판 인증서: 손님 브라우저 ↔ CloudFront ----

resource "aws_acm_certificate" "app" {
  domain_name       = local.app_domain
  validation_method = "DNS"
}

resource "aws_route53_record" "app_validation" {
  for_each = { for o in aws_acm_certificate.app.domain_validation_options : o.domain_name => o }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "app" {
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for r in aws_route53_record.app_validation : r.fqdn]
}

# ---- 통로: CloudFront → 우리 VPC 안의 ALB (ADR-049) ----

resource "aws_cloudfront_vpc_origin" "app" {
  vpc_origin_endpoint_config {
    name                   = "${local.name}-${var.origin_region}"
    arn                    = data.aws_lb.app.arn
    http_port              = 80 # 필수 값이라 넣지만 https-only라 쓰지 않음
    https_port             = 443
    origin_protocol_policy = "https-only"
    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

# VPC Origin을 만들면 CloudFront가 우리 VPC에 만드는 보안 그룹. 만든 뒤에만 찾을 수 있어 depends_on
data "aws_security_group" "vpc_origin" {
  region = var.origin_region
  vpc_id = data.aws_lb.app.vpc_id

  filter {
    name   = "group-name"
    values = ["CloudFront-VPCOrigins-Service-SG*"] # 문서가 "이 이름 패턴"이라고만 해서 뒤에 붙는 글자까지 허용
  }

  depends_on = [aws_cloudfront_vpc_origin.app]
}

# ALB 입구: CloudFront 통로의 보안 그룹에서 오는 443만 (보안 그룹 사슬의 첫 칸)
resource "aws_vpc_security_group_ingress_rule" "alb_from_vpc_origin" {
  region                       = var.origin_region
  security_group_id            = one(data.aws_lb.app.security_groups)
  referenced_security_group_id = data.aws_security_group.vpc_origin.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}

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

  origin {
    origin_id = "app"
    # ALB 인증서 이름. 길은 VPC Origin이 정하고, 이 이름은 TLS 이름 확인에 쓰임 (가설, ADR-049)
    domain_name = local.origin_domain

    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.app.id
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
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ---- 주소록: hotel.vundle34.cloud → CloudFront (ADR-048) ----

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.app_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

output "app_url" {
  value = "https://${local.app_domain}"
}
