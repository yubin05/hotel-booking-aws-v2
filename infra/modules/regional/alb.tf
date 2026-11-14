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
# 서울 · 도쿄가 같은 이름을 써서, 리전을 바꿔도 CloudFront의 원본 이름은 그대로 (ADR-035)
locals {
  zone_name     = "vundle34.cloud" # bootstrap의 Route 53 영역 (ADR-048)
  origin_domain = "origin.hotel.${local.zone_name}"
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
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06" # TLS 1.2 · 1.3만 허용
  certificate_arn   = aws_acm_certificate_validation.origin.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
