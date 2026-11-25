# v3 경보: 2026-11-25부터 꺼 둠(v3_alarms 기본 false, ADR-079). Slack은 DR 판단 알림(global/dr-alert.tf) 하나만
# 정상 서버 2개 미만 경보(ADR-071)는 지움: 울려도 AZ 장애라 확신할 수 없고 AZ 문제여도 서버가 늘어 있으면 안 울림. 서버 수는 대시보드로 봄
# 주제는 bootstrap(alerts.tf, 서울 · 도쿄). 트래픽 눌림(CPU · 5xx · p95) · AZ별 경보는 기준값(정상 k6 최댓값 × 배수)을 정하는 v3 임계값 작업에서

# 계정 탈취 의심 · 세션 보류 알림 (ADR-072, 시나리오 A): 앱이 보류를 기록하고 남긴 points_hold_applied 로그 한 줄 = 지표 1
# 보류는 앱이 같은 트랜잭션에서 이미 했다. 이 경보는 사람에게 알리는 용도라 보류 시각 ≤ 경보 시각이 정상
resource "aws_cloudwatch_log_metric_filter" "points_hold" {
  count          = var.v3_alarms ? 1 : 0
  name           = "${local.name}-points-hold"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.event = \"points_hold_applied\" }"

  metric_transformation {
    namespace = "HotelBooking/Security"
    name      = "PointsHoldApplied"
    value     = "1"
    # default_value 없음: 보류가 없는 분에는 값을 안 남긴다 (경보는 아래 notBreaching)
  }
}

resource "aws_cloudwatch_metric_alarm" "points_hold" {
  count             = var.v3_alarms ? 1 : 0
  alarm_name        = "${local.name}-points-hold"
  alarm_description = "계정 탈취 의심으로 적립금 사용을 보류한 세션이 생김 (ADR-072). 운영자: infra/README.md 시나리오 A 런북"

  namespace           = "HotelBooking/Security"
  metric_name         = aws_cloudwatch_log_metric_filter.points_hold[0].metric_transformation[0].name
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching" # 보류가 없는 분은 값이 없다 = 정상

  alarm_actions = ["arn:aws:sns:${local.region}:${local.account_id}:${local.name}-alerts"]
  # ok_actions 없음: 1분 뒤 OK로 돌아가도 사건은 끝난 게 아니라(운영자 확인 · 복구 필요) "복구" 알림을 보내지 않는다
}
