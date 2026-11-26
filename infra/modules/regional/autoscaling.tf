# 앱 태스크 수 자동 조절 (ADR-015)
#   예약(scheduled action): 시각을 아는 급증. 그 시간대에 최소 수를 올림 = 근무표
#   목표 추적(target tracking): 예고 없는 급증. CPU를 보고 최소~최대 안에서 늘리고 줄임 = 점장

locals {
  app_min_tasks  = 2  # AZ 2개에 1개씩. 한 AZ가 죽어도 하나 남음
  app_max_tasks  = 8  # 태스크당 DB 연결 6개(일반 5 + 쿠폰 1, db_pool_size) × 8 = 48. db.t4g.micro로 6,000명까지 실측 (ADR-078, 11-25 ②)
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
    # 안 적으면 0초로 들어가 1분마다 하나씩 뺐음(2026-11-16 시험). 손님이 잠깐 줄었다 다시 몰릴 때 늘렸다 줄였다 반복하지 않게 (가설값)
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# 요청 수 기준 (ADR-074 늘리기 개선, 값이 있을 때만). CPU 평균은 한 태스크 쏠림을 가려 늦게 늘었다(① 1,000 ~ 1,500명: 평균 58 ~ 64%, 가장 바쁜 100%).
# 정책이 둘이면 하나라도 늘리자고 하면 늘리고, 둘 다 줄이자고 할 때만 줄인다(AWS 문서). 목표값은 태스크 1대의 1분 요청 수(ALB 지표가 60초 단위)
resource "aws_appautoscaling_policy" "app_requests" {
  count              = var.app_requests_target == null ? 0 : 1
  name               = "requests-${var.app_requests_target}"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.app.service_namespace
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = var.app_requests_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.this.arn_suffix}/${aws_lb_target_group.app.arn_suffix}" # app/<ALB>/<id>/targetgroup/<대상 그룹>/<id>
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
    max_capacity = coalesce(each.value.max, local.app_max_tasks) # 쿠폰 서버를 켠 이벤트는 4(DB 연결 맞춤), 아니면 평소 8
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
