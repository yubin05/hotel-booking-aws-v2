# Grafana Cloud(실험 관제실)가 CloudWatch 지표를 읽는 출입증 (ADR-064)
# 키를 만들지 않는다: Grafana의 AWS 계정이 이 역할을 맡아(AssumeRole) 임시 자격 증명을 받고, 외부 ID로 우리 스택만 허용
# 값은 Grafana CloudWatch 데이터 소스 Settings 탭 "How to create an IAM role for grafana to assume"에 나옴 → terraform.tfvars. 비우면 만들지 않음
resource "aws_iam_role" "grafana_read" {
  count = var.grafana_account_id == "" ? 0 : 1
  name  = "${local.project_name}-grafana-read"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${var.grafana_account_id}:root" } # Grafana Cloud의 AWS 계정
      Action    = "sts:AssumeRole"
      # 외부 ID 조건이 없으면 Grafana를 쓰는 다른 고객도 이 역할을 맡을 수 있다 (Grafana 문서)
      Condition = { StringEquals = { "sts:ExternalId" = var.grafana_external_id } }
    }]
  })
}

resource "aws_iam_role_policy" "grafana_read" {
  count = length(aws_iam_role.grafana_read)
  name  = "${local.project_name}-grafana-read-policy"
  role  = aws_iam_role.grafana_read[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      # 지표 읽기만: Grafana 문서가 지표에 필수로 드는 2개. 경보 · 로그 · 태그 조회는 필요해지면 더한다
      Sid      = "ReadMetrics"
      Effect   = "Allow"
      Action   = ["cloudwatch:ListMetrics", "cloudwatch:GetMetricData"]
      Resource = "*"
      # 서울(평소) · 도쿄(리전 복원)만
      Condition = { StringEquals = { "aws:RequestedRegion" = ["ap-northeast-2", "ap-northeast-1"] } }
    }]
  })
}
