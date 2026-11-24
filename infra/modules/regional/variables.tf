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

variable "scale_events" {
  description = "시각을 아는 급증(쿠폰 오픈 등). start부터 end까지 앱 태스크 최소 수를 min으로 올림 (ADR-015). 시각은 한국 시간 YYYY-MM-DDThh:mm:ss, 끝난 이벤트는 지움"
  type = list(object({
    name  = string
    start = string
    end   = string
    min   = number
  }))
  default = []

  validation {
    condition     = alltrue([for e in var.scale_events : e.min >= 2 && e.min <= 4])
    error_message = "이벤트 최소 태스크 수는 평소 최소(2) 이상, 최대(4) 이하여야 합니다 (autoscaling.tf)."
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

variable "app_integrations" {
  description = "결제(토스) · 카카오 키를 금고(서울 원본 · 도쿄 복제본)에서 앱 태스크로 넣고 메일을 켤지 (ADR-071). 금고에 값을 넣은 뒤에만 true. 끄면 결제 · 메일 · 카톡이 꺼진 채 동작"
  type        = bool
  default     = false
}

variable "alerts" {
  description = "장애 경보를 만들어 bootstrap의 SNS 주제(→ Slack)로 보낼지 (ADR-071, alarms.tf). 주제는 서울 · 도쿄에 하나씩(ADR-073), 둘 다 true"
  type        = bool
  default     = false
}

variable "demo_accounts" {
  description = "시연용 호스트 · 관리자 계정 비밀번호를 SSM에서 migrate 태스크로 넣을지 (ADR-060). 파라미터는 서울에만 있어 서울만 true. 없는 파라미터를 참조하면 태스크가 못 뜰 수 있어 도쿄 복원은 false"
  type        = bool
  default     = false
}
