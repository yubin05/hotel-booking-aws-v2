variable "multi_az" {
  description = "설계대로 AZ마다 NAT + RDS Multi-AZ (ADR-034 · ADR-042). 평소 false, 4단계 RDS 장애 조치 · AZ 장애 테스트 · 리전 드릴 날만 terraform.tfvars에 multi_az = true (README 0절)"
  type        = bool
  default     = false
}


variable "db_pool_size" {
  description = "서버 한 대의 DB 연결 수 [일반, 쿠폰]. 최대 8대 × (5 + 1) = 48 (ADR-078). 비우면 앱 기본(10, 2)이라 8대면 DB 한도를 넘음"
  type        = list(number)
  default     = [5, 1]
}

variable "app_requests_target" {
  description = "요청 수 기준 늘리기(태스크 1대의 1분 요청 수 목표). CPU 기준과 함께 둠 (ADR-078). null이면 CPU 기준만"
  type        = number
  default     = 4800
}

# RDS Standby Grafana 실측용. 평소 false(비용 0), Multi-AZ 장애 실험 때만 true로 켜고 종료 후 false.
variable "rds_enhanced_monitoring" {
  type        = bool
  default     = false
  description = "RDS Enhanced Monitoring 60초 로그 수집(CloudWatch Logs 비용 발생 가능). Multi-AZ Standby 실측용"
}

variable "coupon_service" {
  description = "쿠폰 발급만 받는 서버 2대를 따로 둠(격벽 실험, docs/experiments/migration.md). 그날만 true"
  type        = bool
  default     = false
}

variable "alb_access_logs" {
  description = "ALB 접근 로그를 bootstrap 버킷에 남김(진단하는 날만). bootstrap apply로 버킷이 먼저 있어야 함"
  type        = bool
  default     = false
}

variable "coupon_tasks" {
  description = "쿠폰 서버 수(coupon_service = true일 때). 기본 2, 3,000명 쏠림은 4(회차 6 · 7)"
  type        = number
  default     = 2
}
