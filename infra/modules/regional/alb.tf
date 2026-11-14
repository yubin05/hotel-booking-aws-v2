# 내부 ALB: 인터넷 주소 없이 앱 서브넷에 둠. 손님은 CloudFront → VPC Origin으로만 들어옴 (ADR-035)
# 입구(ALB 보안 그룹의 인바운드)는 global 루트에서 VPC Origin을 만들 때 연다

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

# CloudFront → ALB 구간 HTTPS 여부는 global PoC 때 정함(02 6절). 지금은 VPC 안이라 HTTP
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
