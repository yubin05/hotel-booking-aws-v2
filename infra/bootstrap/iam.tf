# GitHub Actions가 job마다 발급하는 토큰(신분증)을 AWS가 믿도록 등록. 계정당 같은 URL은 하나뿐이라 bootstrap에 둠
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
  # 토큰의 aud(받는 대상) 칸과 비교하는 값. configure-aws-credentials 액션이 이 값으로 토큰을 요청함
  client_id_list = ["sts.amazonaws.com"]
  # thumbprint_list는 일부러 뺌: AWS가 신뢰하는 루트 CA로 GitHub 인증서를 검증하고, 안 적으면 IAM이 자동으로 채움
}

# GitHub Actions(CD)가 배포할 때 받는 역할
resource "aws_iam_role" "github_deploy" {
  name = "${local.project_name}-github-deploy"

  # 신뢰 정책(출입 명단): github action
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn } # AWS 밖 발급처(GitHub)의 토큰
      Action    = "sts:AssumeRoleWithWebIdentity"                            # 외부 토큰을 내고 역할의 임시 자격 증명을 받는 API
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          # 이 저장소의 main 브랜치에서 돈 job만. 2026-07-15 이후 만든 저장소라 OWNER@ID/REPO@ID 형식
          "token.actions.githubusercontent.com:sub" = "repo:yubin05@87186282/hotel-booking-aws-v2@1443891878:ref:refs/heads/main"
        }
      }
    }]
  })
}
# GitHub Actions(CD)가 배포할 때 받는 역할에 들어가는 정책
resource "aws_iam_role_policy" "github_deploy" {
  name = "${local.project_name}-github-deploy-policy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ECR 로그인 권한
        Sid    = "ecrGetAuthorizationToken"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        # ECR에 이미지 넣는 권한
        Sid    = "ecrAccessImage"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage"
        ]
        Resource = [
          "arn:aws:ecr:${local.main_region}:${local.account_id}:repository/${local.project_name}",
          "arn:aws:ecr:${local.backup_region}:${local.account_id}:repository/${local.project_name}",
        ]
      },
      {
        # 태스크 정의 등록
        Sid    = "ecsRegisterTaskDefinition"
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition"
        ]
        # 앱 · 스키마 패밀리만(ADR-030·031). 리비전 번호는 등록할 때마다 늘어 :*
        Resource = [
          "arn:aws:ecs:${local.main_region}:${local.account_id}:task-definition/${local.project_name}-app:*",
          "arn:aws:ecs:${local.main_region}:${local.account_id}:task-definition/${local.project_name}-migrate:*",
          "arn:aws:ecs:${local.backup_region}:${local.account_id}:task-definition/${local.project_name}-app:*",
          "arn:aws:ecs:${local.backup_region}:${local.account_id}:task-definition/${local.project_name}-migrate:*",
        ]
      },
      {
        # 스키마 적용 태스크를 1번 실행 (ADR-031). 앱 패밀리는 서비스가 띄우므로 RunTask 불필요
        Sid    = "ecsRunMigrateTask"
        Effect = "Allow"
        Action = [
          "ecs:RunTask"
        ]
        Resource = [
          "arn:aws:ecs:${local.main_region}:${local.account_id}:task-definition/${local.project_name}-migrate:*",
          "arn:aws:ecs:${local.backup_region}:${local.account_id}:task-definition/${local.project_name}-migrate:*",
        ]
        # 우리 클러스터에서만 실행. 값 형식이 ARN이라 ArnEquals, 목록은 둘 중 하나면 통과
        Condition = {
          ArnEquals = {
            "ecs:cluster" = [
              "arn:aws:ecs:${local.main_region}:${local.account_id}:cluster/${local.project_name}",
              "arn:aws:ecs:${local.backup_region}:${local.account_id}:cluster/${local.project_name}",
            ]
          }
        }
      },
      {
        # 스키마 태스크가 끝났는지 · 종료 코드 확인. 태스크 ID는 실행할 때 생겨 *
        Sid    = "ecsDescribeTasks"
        Effect = "Allow"
        Action = [
          "ecs:DescribeTasks"
        ]
        Resource = [
          "arn:aws:ecs:${local.main_region}:${local.account_id}:task/${local.project_name}/*",
          "arn:aws:ecs:${local.backup_region}:${local.account_id}:task/${local.project_name}/*",
        ]
      },
      {
        # 앱 롤링 교체 지시 + 상태 확인(RunTask에 쓸 서브넷 · 보안 그룹도 여기서 읽음)
        Sid    = "ecsDeployService"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = [
          "arn:aws:ecs:${local.main_region}:${local.account_id}:service/${local.project_name}/app",
          "arn:aws:ecs:${local.backup_region}:${local.account_id}:service/${local.project_name}/app",
        ]
      },
      {
        # 태스크 정의에 적힌 실행 역할을 ECS에 건네기 (ADR-029). 이 역할만, ECS 태스크에게만
        Sid    = "iamPassExecutionRole"
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = aws_iam_role.ecs_execution.arn
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}

# ECS가 실행할 때 받는 역할
resource "aws_iam_role" "ecs_execution" {
  name = "${local.project_name}-ecs-execution"

  # 신뢰 정책(출입 명단): ecs tasks
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}
# ECS가 실행할 때 받는 역할에 들어가는 정책
resource "aws_iam_role_policy" "ecs_execution" {
  name = "${local.project_name}-ecs-execution-policy"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ECR 로그인 권한
        Sid    = "ecrGetAuthorizationToken"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "ecrGetImage"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = [
          "arn:aws:ecr:${local.main_region}:${local.account_id}:repository/${local.project_name}",
          "arn:aws:ecr:${local.backup_region}:${local.account_id}:repository/${local.project_name}",
        ]
      },
      {
        Sid    = "AccessLogsStream"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        # 두 액션 모두 리소스 타입이 log-stream. 스트림 이름은 ECS가 태스크마다 만들어 이름 자리만 *
        Resource = [
          "arn:aws:logs:${local.main_region}:${local.account_id}:log-group:/ecs/${local.project_name}:log-stream:*",
          "arn:aws:logs:${local.backup_region}:${local.account_id}:log-group:/ecs/${local.project_name}:log-stream:*",
        ]
      }
    ]
  })
}