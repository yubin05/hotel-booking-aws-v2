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
