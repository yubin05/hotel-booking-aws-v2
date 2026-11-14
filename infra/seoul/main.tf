module "regional" {
  source   = "../modules/regional"
  vpc_cidr = "10.0.0.0/16" # ADR-033
  az_ids   = ["apne2-az1", "apne2-az3"]

  # 평소 1개(비용). AZ 장애 테스트 때 2로 바꿔 apply (ADR-034, RDS Multi-AZ와 같은 방식)
  nat_count   = 1
  db_multi_az = false # AZ 장애 테스트 때 true

  # 처음 서비스를 만들 때의 이미지(서울 ECR에 있는 것). 이후 배포는 CD가 바꿈 (ADR-039)
  image_tag = "9563b21"
}
