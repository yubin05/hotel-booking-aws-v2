# REVIEW(필수): locals 안에서도 변수는 var. 을 붙여야 함 (아래 두 줄 모두)
locals {
  availability_zone = "${region}${availability_zone_suffix}"
  aws_administrator_role_arn = "arn:aws:iam::${aws_root_account_id}:role/${aws_administrator_role_name}"
}

# REVIEW(필수): 공개 저장소에 계정 ID가 올라가지 않게 커밋 전에 기본값을 뺐음(Claude).
#   assume_role을 안 쓰면 이 변수, aws_administrator_role_name, locals의 role_arn 모두 필요 없음 → 지우기
variable "aws_root_account_id" {
  type = number
}

variable "region" {
  type = string
  default = "ap-northeast-2"
}

variable "availability_zone_suffix" {
  type = string
  default = "a"
}

variable "vpc_cidr" {
  type = string
  default = "10.1.0.0/16"
}

variable "subnet_cidr_1" {
  type = string
  default = "10.1.1.0/24"
  description = "퍼블릭 서브넷 1 CIDR"
}

variable "subnet_cidr_2" {
  type = string
  default = "10.1.2.0/24"
  description = "프라이빗 서브넷 1 CIDR"
}

variable "nat_1_instance_type" {
  type = string
  default = "t3.micro"
  description = "NAT 인스턴스 1 CPU 타입"
}

variable "aws_administrator_role_name" {
  type = string
  default = "Administrator-Role"
}
