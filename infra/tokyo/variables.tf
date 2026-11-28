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

variable "valkey" {
  description = "ADR-080 쿠폰 번호표 ElastiCache Serverless for Valkey. 서울처럼 기본 켬(ADR-081), 장애 ① apply에 캐시 · 보안 그룹 · 접근 규칙 +3. false면 DR 중 쿠폰은 DB 경로"
  type        = bool
  default     = true
}

variable "coupon_service" {
  description = "서울과 같은 쿠폰 서버 스위치(ADR-080 · 081). DR 중 고객사 이벤트가 있으면 그날만 true (런북 쿠폰 켜고 끄는 순서 그대로)"
  type        = bool
  default     = false
}

variable "coupon_tasks" {
  description = "쿠폰 서버 수(coupon_service = true일 때). 서울과 같음: 기본 2, 3,000명 쏠림은 4"
  type        = number
  default     = 2
}

variable "scale_events" {
  description = "서울 main.tf scale_events와 같은 형식의 이벤트 대비 예약 늘림(한국 시간). DR 중 이벤트가 있을 때만"
  type        = list(object({ name = string, start = string, end = string, min = number, max = optional(number) }))
  default     = []
}
