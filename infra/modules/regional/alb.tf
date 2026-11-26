# 내부 ALB: 인터넷 주소 없이 앱 서브넷에 둠. 손님은 CloudFront → VPC Origin으로만 들어옴 (ADR-035)
# 입구(ALB 보안 그룹의 443 인바운드)는 global 루트에서 VPC Origin을 만든 뒤 연다 (ADR-049)

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Internal ALB"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-alb" }
}

resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "ECS tasks"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-app" }
}

# 보안 그룹 사슬: ALB → 태스크 3000번만 (02 2절)
resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = local.app_port
  to_port                      = local.app_port
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = local.app_port
  to_port                      = local.app_port
}

# 태스크는 밖으로 나갈 수 있어야 함: ECR(NAT · S3 게이트웨이), 로그, 비밀값, 나중에 카카오 · SES
resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_lb" "this" {
  name               = local.name # ADR-030
  internal           = true
  load_balancer_type = "application"
  subnets            = aws_subnet.app[*].id
  security_groups    = [aws_security_group.alb.id]

  drop_invalid_header_fields = true # 규격에 안 맞는 헤더는 앱에 넘기지 않고 버림 (Security Hub ELB.4, 11 점검 보고서)
  # AZ 하나가 이상할 때 그 AZ 노드를 DNS에서 빼는 버튼(ARC zonal shift)을 쓸 수 있게. 기본 꺼짐, 추가 요금 없음 (ADR-067)
  enable_zonal_shift = true

  # 진단하는 날만(alb_access_logs): 요청마다 ALB 대기 · 앱 처리 시간을 나눠 남김. 버킷은 bootstrap alb-logs.tf(서울에만 있음)
  dynamic "access_logs" {
    for_each = var.alb_access_logs ? [1] : []
    content {
      bucket  = "${local.name}-alb-logs-${local.account_id}"
      enabled = true
    }
  }
}

# 직원 명단: Fargate(awsvpc)는 태스크마다 IP를 받아서 대상 종류가 ip
resource "aws_lb_target_group" "app" {
  name                 = "${local.name}-app" # ADR-030
  target_type          = "ip"
  port                 = local.app_port
  protocol             = "HTTP"
  vpc_id               = aws_vpc.this.id
  deregistration_delay = 10 # 빠지는 태스크의 처리 중 요청을 기다리는 시간. API는 길어도 3초(DB 시간 제한)라 10초면 충분 (ADR-046)

  # 10초 간격 × 연속 2번이면 새 태스크는 약 20초 만에 "건강", 죽은 태스크도 약 20초 만에 빠짐 (기본 30초 × 3번은 배포가 느림)
  health_check {
    path                = "/api/health" # DB를 보지 않는 가벼운 체크라 RDS 없이도 통과
    matcher             = "200"
    interval            = 10
    timeout             = 5 # 간격보다 짧아야 함
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

# CloudFront → ALB도 HTTPS (ADR-049). CloudFront는 "원본 도메인 이름"으로 ALB 인증서를 확인하므로 우리 이름의 인증서를 ALB에 둔다
# 이름은 리전마다 다르게(예: ap-northeast-2.origin.hotel.vundle34.cloud). 같은 이름이면 확인 레코드 하나를 두 리전이 같이 써서
# 한쪽 destroy가 다른 쪽 인증서의 갱신용 레코드까지 지웠다(2026-11-15 도쿄 destroy). 리전마다 따로 소유하면 서로 영향이 없다
locals {
  zone_name     = "vundle34.cloud" # bootstrap의 Route 53 영역 (ADR-048)
  origin_domain = "${local.region}.origin.hotel.${local.zone_name}"
}

data "aws_route53_zone" "main" {
  name = local.zone_name
}

resource "aws_acm_certificate" "origin" {
  domain_name       = local.origin_domain
  validation_method = "DNS"
}

# ACM이 알려 준 확인용 레코드를 영역에 넣으면 발급됨 (이 도메인의 주인인지 확인)
resource "aws_route53_record" "origin_validation" {
  for_each = { for o in aws_acm_certificate.origin.domain_validation_options : o.domain_name => o }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

# 발급이 끝날 때까지 기다림. 리스너는 이것의 ARN을 써서 발급 뒤에 만들어짐
resource "aws_acm_certificate_validation" "origin" {
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for r in aws_route53_record.origin_validation : r.fqdn]
}

# 입구(443 인바운드)는 global 루트가 VPC Origin을 만든 뒤 연다
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09" # TLS 1.2 · 1.3, 강한 암호만(Res) + 양자 내성 키 교환(PQ). 2021-06은 ELB.17 통과 목록에 없음
  certificate_arn   = aws_acm_certificate_validation.origin.certificate_arn

  # 쿠폰 서버가 켜진 날은 쿠폰 대상 그룹을 가중치 0으로 같이 붙여 둠: ECS는 리스너에 붙은 대상 그룹에만 서비스를 만들 수 있어서,
  # 경로 규칙보다 서버를 먼저 띄우려면 필요함. 가중치 0이라 기본 동작의 요청은 전부 app으로
  # 평소(꺼짐)는 원래 표기 그대로라 매일 · 도쿄 plan이 바뀌지 않음
  default_action {
    type             = "forward"
    target_group_arn = var.coupon_service ? null : aws_lb_target_group.app.arn
    dynamic "forward" {
      for_each = aws_lb_target_group.coupon
      content {
        target_group {
          arn    = aws_lb_target_group.app.arn
          weight = 1
        }
        target_group {
          arn    = forward.value.arn
          weight = 0
        }
      }
    }
  }
}

# 격벽 실험(coupon_service): 쿠폰 발급만 따로 받는 서버의 대상 그룹 · 경로 규칙. 나머지 요청은 위 기본 동작대로 app
# 쏠림 때 조회가 발급 요청 뒤에 서는지 가른다 (docs/experiments/migration.md 해결 (가) 다음)
resource "aws_lb_target_group" "coupon" {
  count                = var.coupon_service ? 1 : 0
  name                 = "${local.name}-coupon"
  target_type          = "ip"
  port                 = local.app_port
  protocol             = "HTTP"
  vpc_id               = aws_vpc.this.id
  deregistration_delay = 10

  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  # 끌 때 리스너 기본 동작(가중치 0)에서 먼저 빠진 뒤에 지워지게. 없으면 대상 그룹을 먼저 지우려다 ResourceInUse(11-26 19:38)
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener_rule" "coupon_claim" {
  count        = var.coupon_service ? 1 : 0
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.coupon[0].arn
  }

  condition {
    path_pattern {
      values = ["/api/coupons/*/claim"] # 받기만. 목록 · 내 쿠폰 조회는 app
    }
  }

  depends_on = [aws_ecs_service.coupon] # 켤 때는 서버가 정상이 된 뒤에 생기고, 끌 때는 서버보다 먼저 지워짐
}
