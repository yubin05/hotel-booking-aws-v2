data "aws_caller_identity" "current" {}

locals {
  app_port   = 3000
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region # network.tf의 data
  # 이 리전의 ECR (서울은 원본, 도쿄는 복제본, ADR-040)
  image = "${local.account_id}.dkr.ecr.${local.region}.amazonaws.com/${local.name}:${var.image_tag}"
  # 실행 역할은 bootstrap이 만듦(ADR-029). 이름으로 주소를 조립해 IAM 조회 권한 없이 씀
  execution_role_arn = "arn:aws:iam::${local.account_id}:role/${local.name}-ecs-execution"
}

# 금고 주소(ARN) 조회: ECS는 이름이 아니라 전체 ARN만 받음. 도쿄에서는 같은 이름의 복제본이 잡힘 (ADR-041)
data "aws_secretsmanager_secret" "jwt" {
  name = "${local.name}/jwt-secret"
}

data "aws_secretsmanager_secret" "db_app" {
  name = "${local.name}/db-app-password"
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}" # 실행 역할의 로그 권한과 같은 이름 (ADR-030)
  retention_in_days = 7
}

resource "aws_ecs_cluster" "this" {
  name = local.name # ADR-030
}

# 레시피 카드: 설정(CPU · 메모리 · 비밀값 · 로그)은 여기, 이미지는 이후 CD가 바꿈 (ADR-039)
resource "aws_ecs_task_definition" "app" {
  family                   = "${local.name}-app" # ADR-030
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512  # 0.5 vCPU (09 가정, 3단계 부하 뒤 확정)
  memory                   = 1024 # 1GB
  execution_role_arn       = local.execution_role_arn

  container_definitions = jsonencode([{
    name         = "app"
    image        = local.image
    essential    = true
    portMappings = [{ containerPort = local.app_port, protocol = "tcp" }]

    # DB 접속 정보 (비밀이 아닌 것만). 앱은 관리자가 아니라 앱 전용 계정으로 붙음 (ADR-031)
    environment = [
      { name = "DB_HOST", value = aws_db_instance.this.address },
      { name = "DB_NAME", value = aws_db_instance.this.db_name },
      { name = "DB_USER", value = "app" },
    ]

    # 값이 아니라 금고 주소. ECS가 태스크를 띄울 때 꺼내 환경 변수로 넣음
    secrets = [
      { name = "JWT_SECRET", valueFrom = data.aws_secretsmanager_secret.jwt.arn },
      { name = "DB_PASSWORD", valueFrom = data.aws_secretsmanager_secret.db_app.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "app"
      }
    }
  }])
}

# 스키마 태스크 레시피 (ADR-031 · ADR-044): 같은 이미지로 스키마 · 시드 · 앱 계정만 맞추고 끝남. CD가 앱 교체 전에 RunTask로 1번 실행
# 비밀값은 RunTask 덮어쓰기로 바꿀 수 없어 패밀리를 따로 둠 (ADR-031)
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate" # ADR-030
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256 # Fargate 최소 크기. SQL을 보내기만 하고 일은 DB가 함
  memory                   = 512
  execution_role_arn       = local.execution_role_arn

  container_definitions = jsonencode([{
    name      = "migrate"
    image     = local.image
    essential = true
    command   = ["node", "dist/src/migrate.js"] # 앱과 같은 이미지, 명령만 다름

    environment = [
      { name = "DB_HOST", value = aws_db_instance.this.address },
      { name = "DB_NAME", value = aws_db_instance.this.db_name },
      { name = "DB_ADMIN_USER", value = aws_db_instance.this.username },
    ]

    secrets = [
      # RDS가 관리하는 관리자 금고는 JSON이라 password 키 하나만 꺼냄 (형식: 금고ARN:키::)
      { name = "DB_ADMIN_PASSWORD", valueFrom = "${aws_db_instance.this.master_user_secret[0].secret_arn}:password::" },
      # 앱 계정을 만들 때 넣을 비밀번호. 앱 태스크가 쓰는 금고와 같은 값
      { name = "DB_APP_PASSWORD", valueFrom = data.aws_secretsmanager_secret.db_app.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "migrate"
      }
    }
  }])
}

# "항상 2개 유지" 규칙. 실제 태스크는 ECS가 띄움(Terraform 리소스가 아님)
resource "aws_ecs_service" "app" {
  name            = "app" # ADR-030
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2 # AZ 2개에 1개씩
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.app[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = local.app_port
  }

  # 새 버전이 계속 실패하면 이전 버전으로 자동 롤백 (4단계 "깨진 버전 배포" 실험 대상)
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # 이후 리비전은 CD가 바꿈. Terraform이 되돌리지 않게 (ADR-039)
  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.http] # 대상 그룹이 리스너에 붙은 뒤에 서비스를 만들어야 함
}
