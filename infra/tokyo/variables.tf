variable "replica_source_arn" {
  description = "Pilot Light(ADR-066): 서울 RDS ARN. drill/region.sh standby가 넣어 도쿄 DB를 읽기 복제본으로 만든다. 빼고 apply = 승격 + 나머지 도쿄 인프라"
  type        = string
  default     = null
}
