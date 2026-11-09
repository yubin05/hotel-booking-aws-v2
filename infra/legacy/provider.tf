terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
        source = "hashicorp/aws"
        version = "~> 6.0"
    }
  }
}

provider "aws" {
  # REVIEW(필수): region에 역할 이름이 들어감 → 리전 값이 와야 함
  region = var.region

  # REVIEW(필수): 관리자 역할은 MFA가 있어야 전환되는데, assume_role은 MFA 코드를 묻지 않아 실패할 가능성이 큼.
  #   ADR-018: 1단계 plan·apply는 평소 권한(aws login)으로 → 이 블록이 필요한지 다시 생각해 보기
  #   (role_arn 자리에 ARN이 아니라 이름이 들어간 것도 문제)
  # assume_role {
  #   role_arn = module.var.aws_administrator_role_name
  #   session_name = "TerraformDeploymentSession"
  # }
}