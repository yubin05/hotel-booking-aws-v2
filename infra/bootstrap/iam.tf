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
          # 고객사 앱 저장소의 main 브랜치에서 돈 job만 (ADR-043). 2026-07-15 이후 만든 저장소라 OWNER@ID/REPO@ID 형식
          "token.actions.githubusercontent.com:sub" = "repo:yubin05@87186282/hotel-booking-app@1456714451:ref:refs/heads/main"
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
      },
      {
        # 태스크를 띄울 때 금고에서 비밀값을 꺼내 환경 변수로 넣기 (ADR-041)
        Sid    = "ReadAppSecrets"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        # 서울 금고 + 도쿄 복제본. 복제본 주소는 리전만 달라서 replace로 리전 글자만 바꿈
        Resource = flatten([
          for s in [aws_secretsmanager_secret.jwt, aws_secretsmanager_secret.db_app] : [
            s.arn,
            replace(s.arn, local.main_region, local.backup_region),
          ]
        ])
      }
    ]
  })
}

# 서비스 연결 역할(SLR): AWS 서비스가 우리 계정 안에서 일할 때(서브넷에 네트워크 카드 꽂기 등) 쓰는 역할
# 서비스를 처음 쓸 때 자동으로 생기는데, 그때 apply한 사람에게 iam:CreateServiceLinkedRole이 필요함
# 평소 사용자에겐 IAM 권한이 없어(ADR-025) 필요한 것을 전부 여기서 미리 만듦. 계정에 하나라 서울·도쿄가 같이 씀 (ADR-032)
resource "aws_iam_service_linked_role" "service" {
  for_each = {
    ecs             = "ecs.amazonaws.com"                         # ECS: 태스크마다 네트워크 카드 꽂기
    elb             = "elasticloadbalancing.amazonaws.com"        # ALB: 로드밸런서 네트워크 카드 꽂기
    rds             = "rds.amazonaws.com"                         # RDS: DB 네트워크 카드 꽂기
    ecs_autoscaling = "ecs.application-autoscaling.amazonaws.com" # 오토스케일링: ECS 태스크 수 조절(예약 스케일링)
    ecr_replication = "replication.ecr.amazonaws.com"             # ECR: 레지스트리 복제 설정(서울 → 도쿄)
    vpc_origin      = "vpcorigin.cloudfront.amazonaws.com"        # CloudFront VPC Origin(global): Internal ALB로 가는 네트워크 카드 꽂기
  }
  aws_service_name = each.value

  lifecycle {
    # 이미 있던 역할을 가져오면 AWS가 붙인 설명이 들어오는데, 코드에 설명이 없다고 지우지 않게
    ignore_changes = [description]
  }
}

# 계정에 이미 있는 역할은 만들지 않고 state로 가져옴(import). 없는 역할을 import하면 plan이 멈춤(Cannot import non-existent remote object)
# 쓰는 법: 그 계정에 있는 역할만 주석을 풀고 apply → 가져온 뒤 다시 주석 처리. 없는 역할은 주석인 채로 두면 위 리소스가 새로 만듦
# 있는지 확인: MSYS_NO_PATHCONV=1 aws iam list-roles --path-prefix /aws-service-role/ --query "Roles[].RoleName" --output text
# 이 계정: ecs·elb·rds·ecs_autoscaling 4개는 2026-04~05에 생겨 있어 가져옴, ecr_replication·vpc_origin은 새로 만듦(2026-11-12 apply)
# import {
#   to = aws_iam_service_linked_role.service["ecs"]
#   id = "arn:aws:iam::${local.account_id}:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS"
# }
# import {
#   to = aws_iam_service_linked_role.service["elb"]
#   id = "arn:aws:iam::${local.account_id}:role/aws-service-role/elasticloadbalancing.amazonaws.com/AWSServiceRoleForElasticLoadBalancing"
# }
# import {
#   to = aws_iam_service_linked_role.service["rds"]
#   id = "arn:aws:iam::${local.account_id}:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS"
# }
# import {
#   to = aws_iam_service_linked_role.service["ecs_autoscaling"]
#   id = "arn:aws:iam::${local.account_id}:role/aws-service-role/ecs.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_ECSService"
# }
# import {
#   to = aws_iam_service_linked_role.service["ecr_replication"]
#   id = "arn:aws:iam::${local.account_id}:role/aws-service-role/replication.ecr.amazonaws.com/AWSServiceRoleForECRReplication"
# }
# import {
#   to = aws_iam_service_linked_role.service["vpc_origin"]
#   id = "arn:aws:iam::${local.account_id}:role/aws-service-role/vpcorigin.cloudfront.amazonaws.com/AWSServiceRoleForCloudFrontVPCOrigin"
# }

# 평소 사용자 그룹 권한 (ADR-038). 그룹 자체는 처음 IAM 구성 때 만들어 Terraform 밖에 있음
# 정책 내용은 infra/iam/의 JSON. 1단계 legacy 정책은 고객사 앱 저장소의 legacy/iam이 관리한다 (ADR-043)
locals {
  operator_group = "normal-user-group" # 평소 사용자가 속한 그룹 (list-groups-for-user로 확인)

  # v2 작업을 할 때만 true로 두고 관리자 역할로 apply (붙였다 떼기)
  attach_operator_v2 = true
}

resource "aws_iam_policy" "operator_v2" {
  name = "${local.project_name}-operator-v2"
  # 설명은 만든 뒤 못 바꾸고(바꾸면 교체), 정책 문서처럼 문자 제한이 있을 수 있어 짧은 영어로
  description = "Operator: v2 roots (seoul/global/tokyo) resources and state"
  policy      = file("${path.module}/../iam/v2-operator-policy.json")
}

resource "aws_iam_group_policy_attachment" "operator_v2" {
  count      = local.attach_operator_v2 ? 1 : 0
  group      = local.operator_group
  policy_arn = aws_iam_policy.operator_v2.arn
}

# count를 붙이며 주소가 [0]으로 바뀌어서, 이미 있는 연결을 지우고 다시 만들지 않게 옮김을 알림
moved {
  from = aws_iam_group_policy_attachment.operator_v2
  to   = aws_iam_group_policy_attachment.operator_v2[0]
}
