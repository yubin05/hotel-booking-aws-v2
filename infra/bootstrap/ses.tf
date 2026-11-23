# 예약 확정 메일을 보내는 도메인 (ADR-071, 앱 APP-002)
# 신원 인증은 요금 항목이 없고 보낸 메일만 1,000통에 $0.10(SES 요금 페이지)이라 상시. DKIM 레코드도 영역(route53.tf)과 같이 여기
# 앱 SES_REGION 기본값이 서울이라 서울에 만듦. 도쿄로 전환해도 앱은 서울 SES로 보냄(서울 SES까지 죽으면 메일만 안 가고 예약은 그대로)
locals {
  mail_domain = aws_route53_zone.main.name
  mail_from   = "no-reply@${aws_route53_zone.main.name}" # 앱 태스크의 MAIL_FROM(modules/regional/ecs.tf)과 같은 값
}

# Easy DKIM(기본): AWS가 서명 키를 만들고, 아래 CNAME 3개가 보이면 "이 도메인 주인"으로 인증됨
resource "aws_sesv2_email_identity" "domain" {
  provider       = aws.seoul
  email_identity = local.mail_domain
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3 # Easy DKIM 토큰은 항상 3개
  zone_id = aws_route53_zone.main.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${local.mail_domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# 샌드박스는 인증한 주소로만 받을 수 있음(하루 200통). 시연 받는 주소를 넣으면 SES가 확인 메일을 보내고, 링크를 눌러야 인증됨
resource "aws_sesv2_email_identity" "recipient" {
  for_each       = toset(var.ses_test_recipients)
  provider       = aws.seoul
  email_identity = each.value
}
