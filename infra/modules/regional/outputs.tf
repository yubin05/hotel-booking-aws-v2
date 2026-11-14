# global 루트가 리전 state에서 읽는 값 (리전 전환 때 원본 · 입구를 이 리전으로)
output "vpc_origin_id" {
  value = aws_cloudfront_vpc_origin.app.id
}

output "vpc_id" {
  value = aws_vpc.this.id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}
