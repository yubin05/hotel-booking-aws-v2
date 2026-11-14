# ---- 통로 · 입구: CloudFront → 우리 VPC 안의 ALB (ADR-035 · 049) ----
# 통로(VPC Origin)는 리전 루트가 리전과 같은 수명으로 만든다(modules/regional/vpc_origin.tf).
# 여기서는 손님을 보낼 리전(active_region)의 통로를 고르고 그 ALB의 입구만 연다. 리전 전환 = active_region을 바꿔 apply

# 그 리전 루트의 출력(통로 ID · VPC · ALB 보안 그룹)을 state에서 읽음
data "terraform_remote_state" "region" {
  backend = "s3"
  config = {
    bucket = "hotel-booking-aws-v2-tfstate-248563009287-ap-northeast-1-an"
    key    = "${local.region_roots[var.active_region]}/terraform.tfstate"
    region = "ap-northeast-1"
  }
}

locals {
  origin = data.terraform_remote_state.region.outputs
}

# 통로를 만들면 CloudFront가 그 VPC에 따로(비동기로) 만드는 보안 그룹. 리전 apply 동안 이미 만들어져 있어 plan에서 바로 찾는다.
# 그래도 없으면 plan이 여기서 멈춘다(아무것도 바뀌기 전이라 손님 영향 없음)
data "aws_security_group" "vpc_origin" {
  region = var.active_region
  vpc_id = local.origin.vpc_id

  filter {
    name   = "group-name"
    values = ["CloudFront-VPCOrigins-Service-SG*"] # 문서가 "이 이름 패턴"이라고만 해서 뒤에 붙는 글자까지 허용
  }
}

# ALB 입구: CloudFront 통로의 보안 그룹에서 오는 443만 (보안 그룹 사슬의 첫 칸)
resource "aws_vpc_security_group_ingress_rule" "alb_from_vpc_origin" {
  region                       = var.active_region
  security_group_id            = local.origin.alb_security_group_id
  referenced_security_group_id = data.aws_security_group.vpc_origin.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443

  # 리전 전환 때 새 리전 입구를 먼저 열고, CloudFront가 바뀐 뒤에 옛 입구를 닫음(끊김 없이)
  lifecycle {
    create_before_destroy = true
  }
}

# 통로를 리전 루트로 옮김(2026-11-15). 실제 통로는 지우지 않고 이 state에서만 뺀다(서울 루트가 import로 가져감)
removed {
  from = aws_cloudfront_vpc_origin.app

  lifecycle {
    destroy = false
  }
}
