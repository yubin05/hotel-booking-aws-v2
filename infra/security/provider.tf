terraform {
  # use_lockfile (terraform 진행 중 다른 곳에서 프로세스 잠금) 사용하기 위해 아래 버전 이상 사용
  required_version = ">= 1.11.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0" # 자원마다 region을 따로 줄 수 있는 6.0 이상 (GuardDuty 3곳 · 점검 2곳을 for_each로)
    }
  }

  backend "s3" {
    bucket = "hotel-booking-aws-v2-tfstate-248563009287-ap-northeast-1-an"
    # 같은 버킷을 여러 루트가 쓰므로, key가 같으면 한 루트의 apply가 다른 루트 state를 덮어씀
    # 따라서 폴더 이름(Ex: bootstrap)으로 구분
    key          = "security/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}

# 기본은 서울(트레일 · 로그 버킷 · Config SLR). 다른 리전 것은 자원마다 region = each.key
provider "aws" {
  region = local.main_region
}
