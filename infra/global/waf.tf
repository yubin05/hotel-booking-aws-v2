# 경비원: 앱 CloudFront에 붙이는 WAF (ADR-050). 규칙마다 막는 위험은 docs/10-security.md 2절
# 사진 CloudFront도 같은 웹 ACL을 쓰고, 요청 수 한도는 Host로 나눠 따로 센다 (ADR-035 · 055)
# 웹 ACL 하나를 두 배포가 쓸 때 한도를 배포마다 따로 세는지는 문서에 없어서, 어느 쪽이든 같게 Host로 나눔

locals {
  # 코드가 1차 방어인 위험(SQL 인젝션, XSS 등)을 한 번 더 거르는 2차 방어
  managed_rule_groups = [
    "AWSManagedRulesAmazonIpReputationList", # 아마존이 파악한 봇 · 공격 IP
    "AWSManagedRulesCommonRuleSet",          # XSS, 경로 조작, SSRF, 크기 제한
    "AWSManagedRulesKnownBadInputsRuleSet",  # Log4j 등 알려진 취약점 탐색
    "AWSManagedRulesSQLiRuleSet",            # SQL 인젝션
  ]
}

# 부하 시험 발생기 IP (3단계, docs/experiments/migration.md): 시험 날만 -var로 넣음. 기본은 빈 목록이라 만들지 않음
resource "aws_wafv2_ip_set" "loadtest" {
  count              = length(var.loadtest_ips) > 0 ? 1 : 0
  name               = "${local.name}-loadtest"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = var.loadtest_ips
}

# 규칙 순서: 관리형(10 ~ 13) → 발생기 허용(15, 시험 날만) → 요청 수 한도(20 ~ 22)
# 발생기 요청은 관리형 검사를 받고(손님과 같은 WAF 검사 시간) 한도에서만 빠진다. 허용에 걸리면 그 뒤 규칙은 보지 않음
resource "aws_wafv2_web_acl" "app" {
  name  = local.name
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # 로그인 · 가입: 비밀번호 대입 + 비밀번호 확인(scrypt)이 비싸 낮은 한도
  rule {
    name     = "auth-rate-limit"
    priority = 20

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = 100 # IP당 5분 100건 (가설값, 10 문서 5절로 확인)
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"

        scope_down_statement {
          or_statement {
            dynamic "statement" {
              for_each = ["/api/auth/login", "/api/auth/register"]
              content {
                byte_match_statement {
                  search_string         = statement.value
                  positional_constraint = "STARTS_WITH" # 끝에 /를 붙여 피해 가지 못하게
                  field_to_match {
                    uri_path {}
                  }
                  # Express는 주소의 대소문자를 가리지 않아 /API/Auth/Login으로 피해 가지 못하게 디코딩 → 소문자로 비교
                  text_transformation {
                    priority = 0
                    type     = "URL_DECODE"
                  }
                  text_transformation {
                    priority = 1
                    type     = "LOWERCASE"
                  }
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "auth-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # 앱 전체: 폭주 · 긁어 가기. 통신사 모바일은 여러 손님이 IP 하나를 나눠 써서 여유 있게. 사진 요청은 빼고 셈
  rule {
    name     = "all-rate-limit"
    priority = 21

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = 2000 # IP당 5분 2,000건 (가설값)
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"

        scope_down_statement {
          not_statement {
            statement {
              byte_match_statement {
                search_string         = local.img_domain
                positional_constraint = "EXACTLY"
                field_to_match {
                  single_header {
                    name = "host"
                  }
                }
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "all-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # 사진: 한 화면에 사진이 많아(검색 목록 · 숙소 상세) 앱보다 높게. 폭주는 요청 · 전송 요금으로 이어짐 (ADR-035)
  rule {
    name     = "photo-rate-limit"
    priority = 22

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = 3000 # IP당 5분 3,000건 (가설값)
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"

        scope_down_statement {
          byte_match_statement {
            search_string         = local.img_domain
            positional_constraint = "EXACTLY"
            field_to_match {
              single_header {
                name = "host"
              }
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "photo-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups
    content {
      name     = rule.value
      priority = 10 + rule.key

      # 그룹 안 규칙의 동작(Block)을 그대로 씀. Count로 먼저 켜는 게 보통이지만 손님이 없어 바로 Block (ADR-050)
      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.value
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.value
        sampled_requests_enabled   = true # 콘솔에서 막힌 요청 표본을 보고 오탐을 확인
      }
    }
  }

  # 부하 시험 발생기: 요청 수 한도에서만 뺌. IP 하나로 손님 수천 명을 흉내 내 한도(IP당 5분 2,000건)에 바로 걸리므로
  dynamic "rule" {
    for_each = aws_wafv2_ip_set.loadtest
    content {
      name     = "loadtest-allow"
      priority = 15

      action {
        allow {}
      }

      statement {
        ip_set_reference_statement {
          arn = rule.value.arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "loadtest-allow"
        sampled_requests_enabled   = false
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.name
    sampled_requests_enabled   = true
  }
}
