variable "restore_backup_arn" {
  description = "5단계: 서울에서 복제된 자동 백업 ARN. 넣으면 그 백업으로 RDS를 복원 (drill/region.sh가 넣음, ADR-062). 없으면 빈 DB(전환 PoC)"
  type        = string
  default     = null
}

variable "restore_time" {
  description = "복원 시점(UTC, RFC3339). 장애 선언 때의 가장 최근 복원 가능 시각 (drill/region.sh가 넣음). 없으면 가장 최근"
  type        = string
  default     = null
}
