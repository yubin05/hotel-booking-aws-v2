variable "multi_az" {
  description = "ADR-073 장애 ② 보강: 승격한 도쿄 DB를 Multi-AZ로. 대기 복제본 · ① 복구는 false(기본), drill/region.sh run이 손님을 받은 뒤 true로 apply"
  type        = bool
  default     = false
}

variable "replica_source_arn" {
  description = "Pilot Light(ADR-066): 서울 RDS ARN. drill/region.sh standby가 넣어 도쿄 DB를 읽기 복제본으로 만든다. 빼고 apply = 승격 + 나머지 도쿄 인프라"
  type        = string
  default     = null
}
