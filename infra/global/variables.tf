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
  img_domain    = "img.${local.app_domain}"                         # 사진 전용 도메인 (ADR-035 · 055)
  origin_domain = "${var.active_region}.origin.${local.app_domain}" # 그 리전 ALB 인증서의 이름(regional 모듈, 리전마다 다름)

  # 리전 → 그 리전 루트의 state 폴더 이름
  region_roots = {
    "ap-northeast-2" = "seoul"
    "ap-northeast-1" = "tokyo"
  }
}

variable "loadtest_ips" {
  description = "부하 시험 발생기 공인 IP(/32 목록). WAF 요청 수 한도에서만 빼고 관리형 규칙은 그대로 거침 (3단계). 시험 날만 terraform.tfvars에, 평소 빈 목록 (README 0절 · 5-4)"
  type        = list(string)
  default     = []
}
