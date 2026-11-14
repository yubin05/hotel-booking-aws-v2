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
