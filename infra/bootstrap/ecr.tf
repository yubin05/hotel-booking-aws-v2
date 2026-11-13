# 컨테이너 이미지 창고 (ADR-040)
# 매일 지우는 seoul 루트가 아니라 여기 둬서, apply 직후 어제 이미지로 바로 뜨고 도쿄 복제본이 늘 있게 함
# CD는 서울에만 push하고, 아래 복제 설정이 도쿄로 자동 복사함

# ── 1. 저장소: 서울(평소) · 도쿄(리전 장애 때) ─────────────────────────
resource "aws_ecr_repository" "app" {
  provider             = aws.seoul          # 평소 운영 리전
  name                 = local.project_name # 서울 · 도쿄 같은 이름 (ADR-030)
  image_tag_mutability = "IMMUTABLE"        # 커밋 SHA 태그는 한 번 올리면 바뀌지 않음 (ADR-022)

  image_scanning_configuration {
    scan_on_push = true # 올릴 때 기본 취약점 스캔 (02 5절)
  }
}

# 복제가 도쿄 저장소를 자동으로 만들긴 하지만 설정(태그 불변 · 스캔 · 수명 주기)은 따라오지 않아 직접 만듦
resource "aws_ecr_repository" "app_tokyo" {
  # provider를 안 적으면 이 루트의 기본 provider(도쿄)
  name                 = aws_ecr_repository.app.name
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ── 2. 수명 주기: 최근 N개만 남김 (서울 · 도쿄) ─────────────────────────
locals {
  ecr_keep_last = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last images only"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10 # 롤백에 쓸 만큼
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "app" {
  provider   = aws.seoul
  repository = aws_ecr_repository.app.name
  policy     = local.ecr_keep_last
}

resource "aws_ecr_lifecycle_policy" "app_tokyo" {
  repository = aws_ecr_repository.app_tokyo.name
  policy     = local.ecr_keep_last
}

# ── 3. 복제: 서울 레지스트리에 push되면 도쿄로 ─────────────────────────
# 저장소 하나가 아니라 "서울 레지스트리 전체"의 설정이라, 우리 저장소만 고르게 이름 앞부분으로 거름
resource "aws_ecr_replication_configuration" "seoul_to_tokyo" {
  provider = aws.seoul # 복제를 보내는 쪽

  replication_configuration {
    rule {
      destination {
        region      = local.backup_region # 받는 쪽 (도쿄)
        registry_id = local.account_id    # 같은 계정
      }
      repository_filter {
        filter      = local.project_name
        filter_type = "PREFIX_MATCH"
      }
    }
  }
}
