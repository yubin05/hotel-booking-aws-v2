# DR 판단 알림 (ADR-079): 손님이 쓰는 주소를 서울 밖(Route 53 검사기, 전 세계)에서 30초마다 확인해 Slack으로.
# 서울 리전이 멈추면 서울 안 경보는 같이 못 울릴 수 있어 바깥에서 본다(AWS Multi-Region 기본 원칙 4.c). 전환 결정 · 실행은 사람(ADR-012 · 066, drill/region.sh)
# global과 같이 만들고 지움: 올릴 때 seoul → CD → global 순서라 검사가 시작될 때 DB가 이미 준비됨(거꾸로면 매일 거짓 알림)

resource "aws_route53_health_check" "dr_check" {
  fqdn              = local.app_domain
  type              = "HTTPS"
  port              = 443
  resource_path     = "/api/health/deep" # DB까지 봄: 서울 RDS 장애도 잡음. 2초 안에 2xx · 3xx가 아니면 실패(Route 53 문서)
  enable_sni        = true               # CloudFront는 이름(SNI)으로 인증서를 고름
  request_interval  = 30
  failure_threshold = 3
  tags              = { Name = "${local.name}-dr-check" }

  depends_on = [aws_route53_record.app] # 주소가 생긴 뒤에 검사 시작
}

# Route 53 지표는 us-east-1에만 있어 경보도 여기(이 루트 기본 provider). 주제는 bootstrap(alerts.tf, us-east-1)
resource "aws_cloudwatch_metric_alarm" "dr_alert" {
  alarm_name        = "${local.name}-dr-alert"
  alarm_description = "[ALARM이면] 손님 주소(${local.app_domain}/api/health/deep)가 서울 밖 검사에서 3분 연속 실패 → 선언 기준(ADR-079) 확인 후 drill/region.sh. [OK이면] 정상 · 회복(매일 올린 직후 OK 한 번 = 감시 켜짐)"

  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus" # 1 정상, 0 비정상
  dimensions          = { HealthCheckId = aws_route53_health_check.dr_check.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"

  # account id는 photos.tf의 data.aws_caller_identity
  alarm_actions = ["arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:${local.name}-dr-alert"]
  ok_actions    = ["arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:${local.name}-dr-alert"] # 회복(서울 복구 · 도쿄 전환 끝)도 알림
}
