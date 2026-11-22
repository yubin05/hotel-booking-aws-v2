variable "multi_az" {
  description = "설계대로 AZ마다 NAT + RDS Multi-AZ (ADR-034 · ADR-042). 평소 false, 4단계 RDS 장애 조치 · AZ 장애 테스트 날만 -var multi_az=true"
  type        = bool
  default     = false
}

