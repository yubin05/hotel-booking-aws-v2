output "aws_tfstate_s3_bucket_name" {
  value = aws_s3_bucket.tfstate.bucket
}
# 가비아 네임서버 설정에 넣을 값 (ADR-048)
output "route53_name_servers" {
  value = aws_route53_zone.main.name_servers
}
