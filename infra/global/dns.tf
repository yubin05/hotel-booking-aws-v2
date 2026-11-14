# 주소록 (ADR-048): 영역은 bootstrap에 상시, 레코드는 CloudFront와 같은 수명

data "aws_route53_zone" "main" {
  name = local.zone_name
}

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
