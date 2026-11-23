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
