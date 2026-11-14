# CloudFront 통로(VPC Origin, ADR-035 · 049). 리전 자원과 같은 수명으로 리전 루트가 ALB 다음에 만든다
# CloudFront는 통로를 만든 뒤 따로(비동기로) 이 VPC에 보안 그룹 CloudFront-VPCOrigins-Service-SG를 만든다(전환 PoC 실측 65초 · 128초).
# 통로를 리전 apply에 두면 global(나중에 apply)이 그 보안 그룹을 바로 찾을 수 있다. 리전 전환은 global에서 원본 · 입구만 바꾼다
resource "aws_cloudfront_vpc_origin" "app" {
  vpc_origin_endpoint_config {
    name                   = "${local.name}-${local.region}"
    arn                    = aws_lb.this.arn
    http_port              = 80 # 필수 값이라 넣지만 https-only라 쓰지 않음
    https_port             = 443
    origin_protocol_policy = "https-only" # CloudFront → ALB도 HTTPS (ADR-049)
    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}
