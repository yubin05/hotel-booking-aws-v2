# 예약 확정 메일을 보내는 도메인 (ADR-071, 앱 APP-002)
# 신원 인증은 요금 항목이 없고 보낸 메일만 1,000통에 $0.10(SES 요금 페이지)이라 상시. DKIM 레코드도 영역(route53.tf)과 같이 여기
# 신원 · 샌드박스 · DNS 확인 레코드가 리전마다 따로라(SES 문서) 서울 · 도쿄에 각각 만듦. 앱은 자기 리전 SES로 보냄(SES_REGION)
locals {
  mail_domain = aws_route53_zone.main.name
  mail_from   = "no-reply@${aws_route53_zone.main.name}" # 앱 태스크의 MAIL_FROM(modules/regional/ecs.tf)과 같은 값
}

# Easy DKIM(기본): AWS가 서명 키를 만들고, 아래 CNAME 3개가 보이면 "이 도메인 주인"으로 인증됨
resource "aws_sesv2_email_identity" "domain" {
  provider       = aws.seoul
  email_identity = local.mail_domain
}

resource "aws_sesv2_email_identity" "domain_tokyo" {
  email_identity = local.mail_domain # 기본 provider = 도쿄
}

locals {
  # 서울 3개 + 도쿄 3개. 토큰이 리전마다 달라 레코드 이름이 겹치지 않음
  dkim_tokens = concat(
    aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens,
    aws_sesv2_email_identity.domain_tokyo.dkim_signing_attributes[0].tokens,
  )
}

resource "aws_route53_record" "ses_dkim" {
  count   = 6 # Easy DKIM 토큰은 리전마다 항상 3개
  zone_id = aws_route53_zone.main.zone_id
  name    = "${local.dkim_tokens[count.index]}._domainkey.${local.mail_domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${local.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# 샌드박스는 인증한 주소로만 받을 수 있음(하루 200통). 시연 받는 주소를 넣으면 리전마다 SES가 확인 메일을 보내고, 링크를 눌러야 인증됨
resource "aws_sesv2_email_identity" "recipient" {
  for_each       = toset(var.ses_test_recipients)
  provider       = aws.seoul
  email_identity = each.value
}

resource "aws_sesv2_email_identity" "recipient_tokyo" {
  for_each       = toset(var.ses_test_recipients)
  email_identity = each.value
}
