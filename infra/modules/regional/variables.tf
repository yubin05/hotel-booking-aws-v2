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
