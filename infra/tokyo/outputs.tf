# global 루트가 terraform_remote_state로 읽음 (리전 전환, ADR-035)
output "vpc_origin_id" {
  value = module.regional.vpc_origin_id
}

output "vpc_id" {
  value = module.regional.vpc_id
}

output "alb_security_group_id" {
  value = module.regional.alb_security_group_id
}
