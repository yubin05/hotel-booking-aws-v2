# 출입 기록부: 계정 전체(모든 리전)의 관리 이벤트(누가 · 언제 · 어디서 · 무엇을)를 S3에 파일로
# 왜 트레일까지: ① 6단계 자동 대응이 EventBridge로 API 호출을 받으려면 트레일이 꼭 있어야 함
#               ② 없으면 Security Hub CloudTrail.1(High)이 실패. 관리 이벤트 첫 사본은 무료(S3 비용만)
resource "aws_cloudtrail" "account" {
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.audit_logs.id
  is_multi_region_trail         = true # 안 쓰는 리전에서 생긴 일도 한 곳에
  include_global_service_events = true # IAM · STS · CloudFront 같은 전역 서비스 호출 (us-east-1에 남는 것)
  enable_log_file_validation    = true # 로그를 몰래 고치거나 지웠는지 나중에 검증 가능 (다이제스트 파일)

  # 정책이 없으면 S3 쓰기 권한 확인에서 트레일 생성이 실패
  depends_on = [aws_s3_bucket_policy.audit_logs]
}
