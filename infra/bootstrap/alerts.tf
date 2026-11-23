# 장애 알림: CloudWatch 경보 → SNS → Amazon Q Developer in chat applications(옛 AWS Chatbot) → Slack (ADR-061 · 071)
# 주제 · 채널 연결은 상시. 경보는 서울 리소스와 함께 생기고 지워짐(modules/regional/alarms.tf)

# 경보는 같은 리전의 주제에만 보낼 수 있어 서울. 모듈이 이 이름으로 주소를 조립함
resource "aws_sns_topic" "alerts" {
  provider = aws.seoul
  name     = "${local.project_name}-alerts"
}

# Slack 워크스페이스는 콘솔에서 한 번 승인해야 ID가 생김(런북 5-9). 그 전에는 주제만 만들고 채널 연결은 건너뜀
locals {
  slack = var.slack_team_id != "" && var.slack_channel_id != ""
}

# 채널이 쓰는 역할. 알림만 받으므로 CloudWatch 읽기만(문서: 최소 정책 대신 CloudWatchReadOnlyAccess를 써도 됨)
resource "aws_iam_role" "chatbot" {
  count = local.slack ? 1 : 0
  name  = "${local.project_name}-chatbot"

  # 신뢰 주체: 공식 문서에서 JSON을 찾지 못해 공개 Terraform 모듈들이 쓰는 값(가설). 런북 5-9의 테스트 알림이 Slack에 오면 맞음
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "chatbot.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "chatbot" {
  count      = local.slack ? 1 : 0
  role       = aws_iam_role.chatbot[0].name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess"
}

resource "aws_chatbot_slack_channel_configuration" "alerts" {
  count = local.slack ? 1 : 0
  # Chatbot API는 us-east-2 · us-west-2 · ap-southeast-1 · eu-west-1에만 있음(API 문서). 콘솔도 us-east-2. 서울 주제는 리전이 달라도 받음
  region             = "us-east-2"
  configuration_name = "${local.project_name}-alerts"
  iam_role_arn       = aws_iam_role.chatbot[0].arn
  slack_team_id      = var.slack_team_id
  slack_channel_id   = var.slack_channel_id
  sns_topic_arns     = [aws_sns_topic.alerts.arn]
  # 비우면 AdministratorAccess가 기본 한도(Terraform 문서). 채널에서 명령을 쳐도 읽기만 되게
  guardrail_policy_arns = ["arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess"]
  logging_level         = "NONE" # 켜면 CloudWatch Logs 요금
}
