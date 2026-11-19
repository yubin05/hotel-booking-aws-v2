variable "multi_az" {
  description = "설계대로 AZ마다 NAT + RDS Multi-AZ (ADR-034 · ADR-042). 평소 false, 4단계 RDS 장애 조치 · AZ 장애 테스트 날만 -var multi_az=true"
  type        = bool
  default     = false
}

variable "backup_replication" {
  description = "RDS 자동 백업을 도쿄로 복제 (5단계 리전 복원 드릴, ADR-062). 드릴 날만 -var backup_replication=true. 끝나면 drill/region.sh cleanup"
  type        = bool
  default     = false
}
