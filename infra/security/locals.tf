data "aws_caller_identity" "current" {
}

locals {
  project_name = "hotel-booking-aws-v2"
  account_id   = data.aws_caller_identity.current.account_id
  main_region  = "ap-northeast-2"

  # 트레일 ARN을 버킷 정책에 넣어야 해서 이름을 미리 정함 (트레일은 정책이 있어야 만들어짐)
  trail_name        = "${local.project_name}-account"
  audit_logs_bucket = "${local.project_name}-audit-${local.account_id}-${local.main_region}-an"

  # 쓰는 리전 = 평소 사용자 권한(aws:RequestedRegion)이 닿는 곳 = 털린 키가 일을 벌일 수 있는 곳
  # GuardDuty와 계정 기본값(account.tf)을 여기에 둠
  used_regions = toset(["ap-northeast-2", "ap-northeast-1", "us-east-1"])

  # 보호 기능은 기본값에 맡기지 않고 하나씩 정함 (API로 만들 때 무엇이 켜지는지 문서에 없음)
  guardduty_features = {
    S3_DATA_EVENTS         = "ENABLED"  # 사진 · state 버킷의 이상한 읽기 · 지우기
    RDS_LOGIN_EVENTS       = "ENABLED"  # DB 로그인 무차별 시도
    EKS_AUDIT_LOGS         = "DISABLED" # EKS 안 씀
    EBS_MALWARE_PROTECTION = "DISABLED" # EC2 안 씀
    LAMBDA_NETWORK_LOGS    = "DISABLED" # 지금 Lambda 없음. 6단계에서 다시 봄
    RUNTIME_MONITORING     = "DISABLED" # 컨테이너 안(채굴 프로그램 실행 등)을 보는 유료 기능
  }

  # 점검: 서울(매장) + us-east-1(CloudFront · WAF · 인증서). 값은 그 리전에서 더 뺄 자원 종류
  # IAM 같은 전역 자원은 서울에서만 기록 (문서 권장: 비용 절약)
  posture_regions = {
    "ap-northeast-2" = []
    "us-east-1"      = ["AWS::IAM::User", "AWS::IAM::Group", "AWS::IAM::Role", "AWS::IAM::Policy"]
  }
}
