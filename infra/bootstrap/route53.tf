# 도메인 주소록: 퍼블릭 호스팅 영역 (ADR-048)
# 지우고 다시 만들면 네임서버 4개가 새로 배정돼 가비아 위임을 다시 해야 하므로 상시(bootstrap)
# 레코드(hotel · img → CloudFront)는 global 루트에 둬서 CloudFront와 같이 생기고 지워짐 (지워진 자원을 가리키는 레코드가 남지 않게)
resource "aws_route53_zone" "main" {
  name    = "vundle34.cloud"
  comment = "hotel-booking-aws-v2. 가비아에서 이 영역의 네임서버 4개로 위임"
}
