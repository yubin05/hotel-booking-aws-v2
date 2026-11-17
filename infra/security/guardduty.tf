# 경비원: CloudTrail 관리 이벤트 · VPC 흐름 · DNS 기록을 GuardDuty가 직접(독립 사본) 읽음 → 우리가 따로 켤 기록 없음
# 리전마다 30일 무료 체험. 끝나기 전에 사용량 화면의 예상 비용으로 유지 · 끄기를 정함 (ADR-057)
# 탐지 결과는 같은 리전의 Security Hub로 자동으로 들어감 (점검을 켰을 때)
resource "aws_guardduty_detector" "this" {
  for_each = local.used_regions
  region   = each.key
  enable   = true
}

resource "aws_guardduty_detector_feature" "this" {
  for_each = {
    for pair in setproduct(local.used_regions, keys(local.guardduty_features)) :
    "${pair[0]}/${pair[1]}" => { region = pair[0], name = pair[1] }
  }
  region      = each.value.region
  detector_id = aws_guardduty_detector.this[each.value.region].id
  name        = each.value.name
  status      = local.guardduty_features[each.value.name]
}
