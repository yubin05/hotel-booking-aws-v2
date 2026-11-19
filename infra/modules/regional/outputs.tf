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

# 서울 루트가 도쿄로 백업 복제를 걸 때 원본으로 씀 (seoul/backup.tf)
output "db_instance_arn" {
  value = aws_db_instance.this.arn
}
