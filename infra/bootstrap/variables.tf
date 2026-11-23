# 공개 저장소라 값은 terraform.tfvars(커밋 안 함)에 둠. 형식은 terraform.tfvars.example
variable "budget_alert_email" {
  type = string
}

# Grafana Cloud CloudWatch 데이터 소스 화면의 값 (grafana.tf, ADR-064). 비우면 출입증 역할을 만들지 않음
variable "grafana_account_id" {
  type    = string
  default = ""
}
variable "grafana_external_id" {
  type      = string
  default   = ""
  sensitive = true
}

# Slack 장애 알림 (alerts.tf, ADR-071). 콘솔에서 워크스페이스를 승인한 뒤의 값(런북 5-9). 비우면 채널 연결을 만들지 않음
variable "slack_team_id" {
  type    = string
  default = ""
}
variable "slack_channel_id" {
  type    = string
  default = ""
}

# SES 샌드박스에서 시연 메일을 받을 주소 (ses.tf). 개인 주소라 공개 저장소에 쓰지 않음
variable "ses_test_recipients" {
  type    = list(string)
  default = []
}
