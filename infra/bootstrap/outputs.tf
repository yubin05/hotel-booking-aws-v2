output "aws_tfstate_s3_bucket_name" {
  value = aws_s3_bucket.tfstate.bucket
}
# 사진 올리기 스크립트의 대상 (ADR-055)
output "photos_bucket" {
  value = aws_s3_bucket.photos.bucket
}
# 가비아 네임서버 설정에 넣을 값 (ADR-048)
output "route53_name_servers" {
  value = aws_route53_zone.main.name_servers
}

# Grafana CloudWatch 데이터 소스의 Assume Role ARN 칸에 넣는 값
output "grafana_read_role_arn" {
  value = one(aws_iam_role.grafana_read[*].arn)
}
