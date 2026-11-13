terraform {
  # use_lockfile (terraform 진행 중 다른 곳에서 프로세스 잠금) 사용하기 위해 아래 버전 이상 사용
  required_version = ">= 1.11.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket = "hotel-booking-aws-v2-tfstate-248563009287-ap-northeast-1-an"
    # 같은 버킷을 여러 루트가 쓰므로, key가 같으면 한 루트의 apply가 다른 루트 state를 덮어씀
    # 따라서 폴더 이름(Ex: bootstrap)으로 구분
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = local.backup_region
}

# 서울에 만드는 상시 리소스용 (ECR 저장소 · 복제 설정, ADR-040). 쓰는 리소스에 provider = aws.seoul
provider "aws" {
  alias  = "seoul"
  region = local.main_region
}
