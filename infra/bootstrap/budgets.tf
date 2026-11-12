# 콘솔로 만들어 둔 월 예산을 Terraform 관리로 가져옴
import {
  to = aws_budgets_budget.monthly_cost
  id = "${local.account_id}:${local.project_name}" # 형식: 계정ID:예산이름
}

# 월 $50 비용 예산: 실제 50·80·100%, 예측 100%를 넘으면 이메일 알림
resource "aws_budgets_budget" "monthly_cost" {
  name         = local.project_name
  budget_type  = "COST"
  limit_amount = "50.0"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # 콘솔이 넣은 metrics(UnblendedCost)는 provider 규칙상 filter_expression 없이 적을 수 없어서,
  # 안 적으면 plan이 지우려 함. 지웠을 때 AWS 동작은 미확인이라 건드리지 않음
  lifecycle {
    ignore_changes = [metrics]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.budget_alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.budget_alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.budget_alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "FORECASTED"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
