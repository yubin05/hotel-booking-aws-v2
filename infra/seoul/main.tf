module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.0.0.0/16" # ADR-033
  az_ids   = ["apne2-az1", "apne2-az3"]

  # 평소 1개(비용). AZ 장애 테스트 때 2로 바꿔 apply (ADR-034, RDS Multi-AZ와 같은 방식)
  nat_count = 1
}
