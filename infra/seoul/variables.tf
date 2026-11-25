variable "multi_az" {
  description = "설계대로 AZ마다 NAT + RDS Multi-AZ (ADR-034 · ADR-042). 평소 false, 4단계 RDS 장애 조치 · AZ 장애 테스트 · 리전 드릴 날만 terraform.tfvars에 multi_az = true (README 0절)"
  type        = bool
  default     = false
}


variable "db_pool_size" {
  description = "서버 한 대의 DB 연결 수 [일반, 쿠폰]. 평소 비움(앱 기본 10, 2). DB 한계 시험 날만 terraform.tfvars에 [5, 1] (ADR-074 ②)"
  type        = list(number)
  default     = []
}
