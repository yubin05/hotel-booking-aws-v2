# 점검 묶음 = 사진사(Config) + 위생 점검표(Security Hub CSPM, 기준은 FSBP 하나)
# var.posture_check로 켜고 끔. 끄면 Security Hub → Config 순서로 지워짐(만든 순서의 반대)

# Config가 자원을 읽을 때 쓰는 역할. 점검을 꺼도 남김(돈 안 듦, 다시 켤 때 기다림 없음)
# Security Hub Config.1은 이 서비스 연결 역할을 쓰는지까지 봄
resource "aws_iam_service_linked_role" "config" {
  aws_service_name = "config.amazonaws.com"

  lifecycle {
    ignore_changes = [description]
  }
}

# 사진사: 바뀔 때마다 찍기(연속). 하루 1번 기록은 장당 4배 + 결과가 최대 24시간 늦음
resource "aws_config_configuration_recorder" "this" {
  for_each = var.posture_check ? local.posture_regions : {}
  region   = each.key
  name     = "default"
  role_arn = aws_iam_service_linked_role.config.arn

  recording_group {
    all_supported                 = false # 아래 "빼기" 방식을 쓰려면 꺼야 함
    include_global_resource_types = false # 빼기 방식에서는 효과 없음. IAM은 posture_regions 값으로 리전마다 뺌
    exclusion_by_resource_types {
      # Security Hub 채점 결과까지 사진으로 찍히는 종류 (Config를 Security Hub에만 쓰면 빼라고 문서가 권장)
      resource_types = concat(["AWS::Config::ResourceCompliance"], each.value)
    }
    recording_strategy {
      use_only = "EXCLUSION_BY_RESOURCE_TYPES"
    }
  }

  recording_mode {
    recording_frequency = "CONTINUOUS"
  }
}

resource "aws_config_delivery_channel" "this" {
  for_each       = aws_config_configuration_recorder.this
  region         = each.key
  name           = "default"
  s3_bucket_name = aws_s3_bucket.audit_logs.id # us-east-1 것도 서울 창고로

  depends_on = [aws_s3_bucket_policy.audit_logs]
}

# 기록 시작 (전달 채널이 있어야 켜짐)
resource "aws_config_configuration_recorder_status" "this" {
  for_each   = aws_config_delivery_channel.this
  region     = each.key
  name       = aws_config_configuration_recorder.this[each.key].name
  is_enabled = true
}

# 문서 권장: Config 기록을 먼저 켠 뒤 Security Hub 기준을 켬 → recorder_status에 걸어 순서를 보장
resource "aws_securityhub_account" "this" {
  for_each                  = aws_config_configuration_recorder_status.this
  region                    = each.key
  enable_default_standards  = false              # 기본으로 켜지는 CIS 1.2 등은 끄고 FSBP 하나만 아래에서
  control_finding_generator = "SECURITY_CONTROL" # 여러 기준에 겹치는 항목을 결과 하나로
  auto_enable_controls      = true
}

resource "aws_securityhub_standards_subscription" "fsbp" {
  for_each      = aws_securityhub_account.this
  region        = each.key
  standards_arn = "arn:aws:securityhub:${each.key}::standards/aws-foundational-security-best-practices/v/1.0.0"

  # 기본 3분은 짧음: 2026-11-17 us-east-1이 3분 넘게 PENDING이라 apply가 시간 초과(서울은 3분 안)
  timeouts {
    create = "15m"
    delete = "15m"
  }
}
