terraform {
  # use_lockfile (terraform 진행 중 다른 곳에서 프로세스 잠금) 사용하기 위해 아래 버전 이상 사용
  required_version = ">= 1.11.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0" # 자원마다 region을 따로 줄 수 있는 6.0 이상 (서울 ALB 조회 · 보안 그룹 규칙)
    }
  }

  backend "s3" {
    bucket = "hotel-booking-aws-v2-tfstate-248563009287-ap-northeast-1-an"
    # 같은 버킷을 여러 루트가 쓰므로, key가 같으면 한 루트의 apply가 다른 루트 state를 덮어씀
    # 따라서 폴더 이름(Ex: bootstrap)으로 구분
    key          = "global/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}

# CloudFront에 붙이는 인증서와 WAF(CLOUDFRONT 범위)는 us-east-1에 만들어야 함
# 서울에 있는 것(ALB 조회, ALB 보안 그룹 규칙)은 자원마다 region = var.origin_region
provider "aws" {
  region = "us-east-1"
}
