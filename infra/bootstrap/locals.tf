locals {
  project_name  = "hotel-booking-aws-v2"
  account_id    = data.aws_caller_identity.current.account_id
  main_region   = "ap-northeast-2"
  backup_region = "ap-northeast-1"
  bucket_name   = "${local.project_name}-tfstate-${local.account_id}-${local.backup_region}-an"
}