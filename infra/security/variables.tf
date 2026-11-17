# 점검 묶음(Config + Security Hub CSPM) 켜기. 사진(구성 항목)마다 돈이 붙어 기본은 끔 (ADR-057)
# 켤 때: AWS_PROFILE=admin terraform apply -var posture_check=true
# 끌 때: AWS_PROFILE=admin terraform apply   (CloudTrail · GuardDuty는 그대로 남음)
variable "posture_check" {
  type    = bool
  default = false
}
