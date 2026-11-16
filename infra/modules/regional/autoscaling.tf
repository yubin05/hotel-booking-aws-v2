# 앱 태스크 수 자동 조절 (ADR-015)
#   예약(scheduled action): 시각을 아는 급증. 그 시간대에 최소 수를 올림 = 근무표
#   목표 추적(target tracking): 예고 없는 급증. CPU를 보고 최소~최대 안에서 늘리고 줄임 = 점장

locals {
  app_min_tasks  = 2  # AZ 2개에 1개씩. 한 AZ가 죽어도 하나 남음
  app_max_tasks  = 4  # 태스크당 DB 연결 최대 12개(일반 10 + 쿠폰 2) × 4 = 48. db.t4g.micro가 받는 연결 수 안에서 (가설, 3단계 부하 뒤 확정)
  app_cpu_target = 60 # 평균 CPU 60%를 넘으면 늘림 (가설값)
}

# "앱 태스크는 최소 2 ~ 최대 4" 범위 등록
resource "aws_appautoscaling_target" "app" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = local.app_min_tasks
  max_capacity       = local.app_max_tasks

  # 이벤트 시간대에는 예약 작업이 최소 수를 바꿔 둠. 그 사이 apply가 2로 되돌리지 않게
  # shortcut: 평소 최소 · 최대를 코드에서 바꾸면 다음 apply로는 안 들어감 → 매일 새로 만들 때 반영되거나 -replace
  lifecycle {
    ignore_changes = [min_capacity, max_capacity]
  }
}

resource "aws_appautoscaling_policy" "app_cpu" {
  name               = "cpu-${local.app_cpu_target}"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.app.service_namespace
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value = local.app_cpu_target
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# 이벤트마다 두 번: 시작에 최소를 올리고, 끝에 평소 최소로 되돌림
# 끝에는 최대를 낮추지 않음. 남은 태스크는 목표 추적이 CPU를 보고 줄임
resource "aws_appautoscaling_scheduled_action" "event_start" {
  for_each           = { for e in var.scale_events : e.name => e }
  name               = "${each.key}-start"
  service_namespace  = aws_appautoscaling_target.app.service_namespace
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension
  schedule           = "at(${each.value.start})"
  timezone           = "Asia/Seoul"

  scalable_target_action {
    min_capacity = each.value.min
    max_capacity = local.app_max_tasks
  }
}

resource "aws_appautoscaling_scheduled_action" "event_end" {
  for_each           = { for e in var.scale_events : e.name => e }
  name               = "${each.key}-end"
  service_namespace  = aws_appautoscaling_target.app.service_namespace
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension
  schedule           = "at(${each.value.end})"
  timezone           = "Asia/Seoul"

  scalable_target_action {
    min_capacity = local.app_min_tasks
    max_capacity = local.app_max_tasks
  }
}
