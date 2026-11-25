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

# RDS Standby Grafana 실측용. 평소 false(비용 0), Multi-AZ 장애 실험 때만 true로 켜고 종료 후 false.
variable "rds_enhanced_monitoring" {
  type        = bool
  default     = false
  description = "RDS Enhanced Monitoring 60초 로그 수집(CloudWatch Logs 비용 발생 가능). Multi-AZ Standby 실측용"
}
