variable "active_region" {
  description = "CloudFront가 손님을 보내는 리전. 리전 전환 때 도쿄로 바꿔 apply (ADR-012 · 035). 그 리전 루트(seoul/tokyo)가 먼저 떠 있어야 함"
  type        = string
  default     = "ap-northeast-2"

  validation {
    condition     = contains(["ap-northeast-2", "ap-northeast-1"], var.active_region)
    error_message = "active_region은 ap-northeast-2(서울) 또는 ap-northeast-1(도쿄)이어야 합니다."
  }
}

locals {
  name          = "hotel-booking-aws-v2"
  zone_name     = "vundle34.cloud"
  app_domain    = "hotel.${local.zone_name}"
  origin_domain = "origin.${local.app_domain}" # regional 모듈이 ALB에 단 인증서와 같은 이름

  # 리전 → 그 리전 루트의 state 폴더 이름
  region_roots = {
    "ap-northeast-2" = "seoul"
    "ap-northeast-1" = "tokyo"
  }
}
