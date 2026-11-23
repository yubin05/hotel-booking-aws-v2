# 장애 알림 (ADR-071): 정상 태스크가 3분 내내 최소 수(2)보다 적으면 Slack, 돌아오면 복구 알림
# 주제는 bootstrap(alerts.tf, 서울). 트래픽 눌림(CPU · 5xx · p95) 경보는 기준값(정상 k6 최댓값 × 배수)을 정하는 v3 임계값 작업에서
resource "aws_cloudwatch_metric_alarm" "app_unhealthy" {
  count             = var.alerts ? 1 : 0
  alarm_name        = "${local.name}-app-unhealthy"
  alarm_description = "정상 태스크(ALB HealthyHostCount)가 3분 동안 ${local.app_min_tasks}개 미만"

  namespace   = "AWS/ApplicationELB"
  metric_name = "HealthyHostCount"
  dimensions = {
    TargetGroup  = aws_lb_target_group.app.arn_suffix
    LoadBalancer = aws_lb.this.arn_suffix
  }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "LessThanThreshold"
  threshold           = local.app_min_tasks

  # 태스크가 모두 빠져 대상이 0일 때 값이 나오는지는 문서로 확인하지 못함(가설: 안 나옴 → 판단 보류라 알림 없음).
  # breaching으로 두면 매일 apply 직후(태스크가 뜨기 전)에도 울려 거짓 알림이 됨
  treat_missing_data = "missing"

  alarm_actions = ["arn:aws:sns:${local.region}:${local.account_id}:${local.name}-alerts"]
  ok_actions    = ["arn:aws:sns:${local.region}:${local.account_id}:${local.name}-alerts"]

  depends_on = [aws_ecs_service.app] # 서비스가 생긴 뒤부터 재야 apply 직후 거짓 알림이 줄어듦
}

# 계정 탈취 의심 · 세션 보류 알림 (ADR-072, 시나리오 A): 앱이 보류를 기록하고 남긴 points_hold_applied 로그 한 줄 = 지표 1
# 보류는 앱이 같은 트랜잭션에서 이미 했다. 이 경보는 사람에게 알리는 용도라 보류 시각 ≤ 경보 시각이 정상
resource "aws_cloudwatch_log_metric_filter" "points_hold" {
  count          = var.alerts ? 1 : 0
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
  count             = var.alerts ? 1 : 0
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
