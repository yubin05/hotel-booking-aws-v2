locals {
  availability_zone = "${var.region}${var.availability_zone_suffix}"
  public_key_path   = "~/.ssh/${var.key_name}.pub"
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "availability_zone_suffix" {
  type    = string
  default = "a"
}

# AMI 이름·생성 날짜는 aws login 후 `aws ec2 describe-images --image-ids <ID> --query "Images[0].[Name,CreationDate]"`로 확인
variable "al2023_ami_id" {
  type        = string
  default     = "ami-0131b10cfa2943e15"
  description = "al2023-ami-2023.12.20261109.0-kernel-6.18-x86_64 (2026-11-04 생성)"
}

variable "vpc_cidr" {
  type    = string
  default = "10.1.0.0/16"
}

variable "subnet_cidr_1" {
  type        = string
  default     = "10.1.1.0/24"
  description = "퍼블릭 서브넷 1 CIDR"
}

variable "subnet_cidr_2" {
  type        = string
  default     = "10.1.2.0/24"
  description = "프라이빗 서브넷 1 CIDR"
}

variable "nat_1_instance_type" {
  type        = string
  default     = "t3.micro"
  description = "NAT 인스턴스 1 CPU 타입"
}

variable "key_name" {
  type    = string
  default = "hotel-legacy"
}

variable "web_app_ssh_ingress_cidrs" {
  type        = list(string)
  description = "웹 앱 보안 그룹 CIDRs"
}