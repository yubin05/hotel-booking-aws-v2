locals {
  availability_zone = "${var.region}${var.availability_zone_suffix}"
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "availability_zone_suffix" {
  type    = string
  default = "a"
}

# REVIEW(참고): AMI ID는 리전마다 다름 → 위 region 기본값을 바꾸면 이 값도 같이 바꿔야 한다는 걸 description에 함께 적기.
#   AMI 이름·생성 날짜는 aws login 후 `aws ec2 describe-images --image-ids <ID> --query "Images[0].[Name,CreationDate]"`로 확인
variable "ami_id" {
  type    = string
  default = "ami-0131b10cfa2943e15"
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
