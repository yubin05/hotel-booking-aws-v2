variable "vpc_cidr" {
  description = "VPC 주소 대역. 리전마다 겹치지 않게 루트에서 고정 (ADR-033)"
  type        = string
}

variable "az_ids" {
  description = "서브넷을 둘 AZ ID 목록 (예: apne2-az1). AZ 이름은 계정마다 실제 AZ가 달라 ID로 받음"
  type        = list(string)
}
