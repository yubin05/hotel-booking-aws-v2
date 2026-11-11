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

# 평소 그룹에 SSM 파라미터 읽기 권한이 있어야 함
# 현재는 사용 안 함 - 해당 방식은 최신 AMI를 알아서 가리키므로 매번 APPLY할 때마다 리소스를 삭제하고 생성함
# data "aws_ssm_parameter" "al2023_ami" {
#   name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
# }

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

variable "ec2_instance_type" {
  type        = string
  default     = "t3.micro"
  description = "EC2 인스턴스 타입"
}

variable "key_name" {
  type    = string
  default = "hotel-legacy"
}

variable "web_app_ssh_ingress_cidrs" {
  type        = list(string)
  description = "웹 앱 보안 그룹 CIDRs"
}

variable "is_load_test" {
  type        = bool
  default     = false
  description = "부하 발생기 생성 여부"
}
variable "load_test_instance_type" {
  type = string
  # 추후 메모리 결정 후 수정 필요
  default     = "t3.micro"
  description = "부하 발생기 인스턴스 타입 (vCPU·메모리 세트)."
}