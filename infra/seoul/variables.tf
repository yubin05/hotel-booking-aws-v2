variable "multi_az" {
  description = "설계대로 AZ마다 NAT + RDS Multi-AZ (ADR-034 · ADR-042). 평소 false, 4단계 RDS 장애 조치 · AZ 장애 테스트 · 리전 드릴 날만 terraform.tfvars에 multi_az = true (README 0절)"
  type        = bool
  default     = false
}

