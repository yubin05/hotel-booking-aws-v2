# 계정 전역 IAM: 서울 / 도쿄 RDS Enhanced Monitoring이 서비스 역할 1개를 공유.
# 관리자 bootstrap apply에서만 생성한다. 일반 운영자에게 CreateRole/AttachRolePolicy 필요 없음.
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${local.project_name}-rds-enhanced-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.account_id }
        ArnLike = {
          "aws:SourceArn" = [
            "arn:aws:rds:${local.main_region}:${local.account_id}:db:${local.project_name}",
            "arn:aws:rds:${local.backup_region}:${local.account_id}:db:${local.project_name}",
          ]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

output "rds_enhanced_monitoring_role_arn" {
  description = "서울 / 도쿄에서 공용으로 사용하는 RDS Enhanced Monitoring 서비스 역할"
  value       = aws_iam_role.rds_enhanced_monitoring.arn
}
