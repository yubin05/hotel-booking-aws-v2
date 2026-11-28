variable "vpc_cidr" {
  description = "VPC 주소 대역. 리전마다 겹치지 않게 루트에서 고정 (ADR-033)"
  type        = string
}

variable "az_ids" {
  description = "서브넷을 둘 AZ ID 목록 (예: apne2-az1). AZ 이름은 계정마다 실제 AZ가 달라 ID로 받음"
  type        = list(string)

  validation {
    condition     = length(var.az_ids) >= 2
    error_message = "가용 영역은 최소 2개 이상이어야 합니다."
  }
}

variable "nat_count" {
  description = "NAT Gateway 개수. 설계는 AZ마다(= AZ 개수), 포트폴리오는 평소 1개, AZ 장애 테스트 때 AZ 개수로 (ADR-034)"
  type        = number

  validation {
    condition     = var.nat_count >= 1 && var.nat_count <= length(var.az_ids)
    error_message = "NAT 개수는 1 이상, AZ 개수 이하여야 합니다."
  }
}

variable "db_multi_az" {
  description = "RDS Multi-AZ. 설계는 켬(true), 포트폴리오는 평소 끄고 AZ 장애 테스트 때 켬 (ADR-042)"
  type        = bool
}

# Standby OS 세부 지표는 Enhanced Monitoring + RDSOSMetrics(-secondary) 로그가 있어야 보임.
# 기본 false: 기존 인프라/비용 영향 없음. true + Multi-AZ 사용 구간에만 Standby 로그 발생.
variable "rds_enhanced_monitoring" {
  description = "RDS Enhanced Monitoring(60초 주기) 사용 여부. 기본 false, Standby 실측 시 사용자 명시적으로 true"
  type        = bool
  default     = false
}

# IAM 서비스 역할은 bootstrap에서 관리자 1회 생성. 이 모듈에서는 생성하지 않고 ARN만 사용.
variable "rds_monitoring_role_arn" {
  description = "계정 전역 RDS Enhanced Monitoring IAM 역할 ARN (기본 미사용)"
  type        = string
  default     = null
  nullable    = true
}

variable "app_requests_target" {
  description = "요청 수 기준 늘리기: 태스크 1대의 1분 요청 수 목표. 비우면(null) CPU 기준만 (ADR-074 늘리기 개선)"
  type        = number
  default     = 4800 # ADR-078: 11-25 B 시험(CPU 기준 + 이 기준)으로 채택
}

variable "db_pool_size" {
  description = "서버 한 대의 DB 연결 수 [일반, 쿠폰]. 비우면 앱 기본(10, 2). 서버를 늘리는 시험에서 서버 수 × 합이 DB 연결 한도 안이 되게 줄임 (ADR-074 ②)"
  type        = list(number)
  default     = [5, 1] # ADR-078: 최대 8대 × 6 = 48 연결(db.t4g.micro 약 60 안)
  validation {
    condition     = length(var.db_pool_size) == 0 || (length(var.db_pool_size) == 2 && alltrue([for n in var.db_pool_size : n >= 1 && floor(n) == n]))
    error_message = "db_pool_size는 비우거나 [일반, 쿠폰] 두 개의 1 이상 정수"
  }
}

variable "scale_events" {
  description = "시각을 아는 급증(쿠폰 오픈 등). start부터 end까지 앱 태스크 최소 수를 min으로, max를 주면 최대도 바꿈 (ADR-015). 시각은 한국 시간 YYYY-MM-DDThh:mm:ss, 끝난 이벤트는 end가 지난 뒤 지움"
  type = list(object({
    name  = string
    start = string
    end   = string
    min   = number
    max   = optional(number) # 쿠폰 서버를 켠 이벤트: 4로 낮춰 DB 연결을 맞춤(일반 4 × 6 + 쿠폰 4 × 6 = 48). 비우면 평소 최대 8
  }))
  default = []

  validation {
    condition     = alltrue([for e in var.scale_events : e.min >= 2 && e.min <= 4])
    error_message = "이벤트 최소 태스크 수는 평소 최소(2) 이상, 최대(4) 이하여야 합니다 (autoscaling.tf)."
  }

  validation {
    condition     = alltrue([for e in var.scale_events : e.max == null ? true : e.max >= e.min && e.max <= 8])
    error_message = "이벤트 최대 태스크 수는 그 이벤트의 최소 이상, 평소 최대(8) 이하여야 합니다 (autoscaling.tf)."
  }
}

variable "migration_tasks" {
  description = "이관 · 검증용 일회성 태스크 정의(restore · sql · dump)를 만들지 (migration.tf). 3단계 이관(서울)과 5단계 되돌리기(도쿄 덤프 → 서울 복원)에 씀"
  type        = bool
  default     = false
}

variable "replica_source_arn" {
  description = "Pilot Light(ADR-066): 다른 리전 주 DB의 ARN. 넣으면 RDS를 그 DB의 읽기 복제본으로 만들고, 빼고 apply하면 승격(독립 DB)한다. null이면 빈 DB"
  type        = string
  default     = null
}

variable "coupon_service" {
  description = "쿠폰 발급(/api/coupons/*/claim)만 받는 ECS 서버 2대를 따로 둠. 쏠림 때 조회가 발급 뒤에 서는지 가르는 격벽 실험(docs/experiments/migration.md)"
  type        = bool
  default     = false
}

variable "coupon_tasks" {
  description = "쿠폰 서버 수(coupon_service일 때). 쏠림 2 ~ 3초 동안은 자동 확장이 못 늘리므로 T에 필요한 만큼 미리(회차 6: 2대는 503 705, 회차 5: 4대는 0)"
  type        = number
  default     = 2
}

variable "alb_access_logs" {
  description = "ALB 접근 로그를 bootstrap 버킷(<이름>-alb-logs-<계정>, 서울)에 남김. 진단하는 날 서울에서만"
  type        = bool
  default     = false
}

variable "app_integrations" {
  description = "결제(토스) · 카카오 키를 금고(서울 원본 · 도쿄 복제본)에서 앱 태스크로 넣고 메일을 켤지 (ADR-071). 금고에 값을 넣은 뒤에만 true. 끄면 결제 · 메일 · 카톡이 꺼진 채 동작"
  type        = bool
  default     = false
}

variable "v3_alarms" {
  description = "v3 시나리오 A 포인트 보류 경보(+ 지표 필터, alarms.tf)를 bootstrap의 그 리전 SNS 주제(→ Slack)로 보낼지 (ADR-071 · 072 · 073). 2026-11-25부터 꺼 둠: Slack은 DR 판단 알림(global/dr-alert.tf)만 (ADR-079). v3 시나리오 A 때 서울 · 도쿄 true"
  type        = bool
  default     = false
}

variable "demo_accounts" {
  description = "시연용 호스트 · 관리자 계정 비밀번호를 SSM에서 migrate 태스크로 넣을지 (ADR-060). 파라미터는 서울에만 있어 서울만 true. 없는 파라미터를 참조하면 태스크가 못 뜰 수 있어 도쿄 복원은 false"
  type        = bool
  default     = false
}

variable "valkey" {
  description = "쿠폰 수량 번호표용 ElastiCache Serverless for Valkey(ADR-080). 서울 스택과 같이 올리고 내림, 도쿄도 전환 때 같이 만듦(ADR-081)"
  type        = bool
  default     = false
}

variable "coupon_db_pool_size" {
  description = "쿠폰 서버 한 대의 DB 연결 [일반, 쿠폰]. 이벤트 때 일반 서버 최대 4 × 6 + 쿠폰 4 × (4 + 3) = 52 / 약 60 (ADR-080, 회차 10)"
  type        = list(number)
  default     = [4, 3]
}
