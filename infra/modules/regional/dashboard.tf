# 관제 화면 (ADR-061, 11-18 변경): CloudWatch 대시보드 한 화면. apply하면 같이 생겨 바로 녹화할 수 있고 destroy하면 같이 지워진다
# 배치: 중요한 것을 위에 (Amazon Builders' Library "운영 대시보드"). 1줄 손님 체감(1초) → 2줄 용량 → 3줄 DB, 기본 16:9 한 화면(3 × 3칸), 쿠폰 서버가 켜진 때만 실행 수 패널 추가
# 대시보드는 리전에 묶이지 않아 이름에 리전을 붙임(서울 · 도쿄가 같이 떠도 안 겹침). 3개까지 무료(지표 50개까지)
locals {
  # 1초 그래프의 주기. 대시보드 JSON 문서는 최소 60초라고 적지만, 실제로 넣어 보니 PutDashboard가 검증 메시지 없이 받아들임(2026-11-18)
  fast_period = 1
  ecs_dims    = ["ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name]
  rds_dims    = ["DBInstanceIdentifier", aws_db_instance.this.identifier]

  # 칸 하나: 제목, 지표 목록, 주기, 기준선
  dashboard_widgets = concat([
    # ---- 1줄: 손님 체감 (앱이 EMF로 남기는 1초 지표, 태스크를 서비스 하나로 묶음) ----
    { title = "① 초당 요청 수 (1초)", period = local.fast_period, lines = [],
    metrics = concat(
      [["HotelBooking/App", "Requests", "Service", "app", { stat = "Sum", label = "app 요청" }]],
      [for service in aws_ecs_service.coupon : ["HotelBooking/App", "Requests", "Service", service.name, { stat = "Sum", label = "coupon 요청" }]]
    ) },
    { title = "② 서버 오류 5xx (1초)", period = local.fast_period, lines = [],
    metrics = concat(
      [["HotelBooking/App", "Errors5xx", "Service", "app", { stat = "Sum", label = "app 5xx", color = "#d62728" }]],
      [for service in aws_ecs_service.coupon : ["HotelBooking/App", "Errors5xx", "Service", service.name, { stat = "Sum", label = "coupon 5xx" }]]
    ) },
    { title = "③ 응답 시간 p95 (1초, 가장 느린 태스크)", period = local.fast_period, lines = [{ value = 1000, label = "무너짐 기준 1초" }],
    metrics = concat(
      [["HotelBooking/App", "LatencyP95", "Service", "app", { stat = "Maximum", label = "app p95 (ms)" }]],
      [for service in aws_ecs_service.coupon : ["HotelBooking/App", "LatencyP95", "Service", service.name, { stat = "Maximum", label = "coupon p95 (ms)" }]]
    ) },
    # ---- 2줄: 용량 (AWS 기본 지표, 1분) ----
    { title = "④ 정상 태스크 수 (ALB 대상 그룹별)", period = 60, lines = [],
    metrics = concat(
      [["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.this.arn_suffix, { stat = "Maximum", label = "app 정상 대상" }]],
      [for tg in aws_lb_target_group.coupon : ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", tg.arn_suffix, "LoadBalancer", aws_lb.this.arn_suffix, { stat = "Maximum", label = "coupon 정상 대상" }]]
    ) },
    { title = "⑤ 서비스별 CPU (평균 · 최대)", period = 60, lines = [{ value = local.app_cpu_target, label = "app 늘리기 기준 ${local.app_cpu_target}%" }],
    metrics = concat(
      [concat(["AWS/ECS", "CPUUtilization"], local.ecs_dims, [{ stat = "Average", label = "app 평균" }]),
       concat(["AWS/ECS", "CPUUtilization"], local.ecs_dims, [{ stat = "Maximum", label = "app 최대" }])],
      [for service in aws_ecs_service.coupon : ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", service.name, { stat = "Average", label = "coupon 평균" }]],
      [for service in aws_ecs_service.coupon : ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", service.name, { stat = "Maximum", label = "coupon 최대" }]]
    ) },
    { title = "⑥ 서비스별 메모리 (평균 · 최대)", period = 60, lines = [],
      metrics = concat(
      [concat(["AWS/ECS", "MemoryUtilization"], local.ecs_dims, [{ stat = "Average", label = "app 평균" }]),
       concat(["AWS/ECS", "MemoryUtilization"], local.ecs_dims, [{ stat = "Maximum", label = "app 최대" }])],
      [for service in aws_ecs_service.coupon : ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", service.name, { stat = "Average", label = "coupon 평균" }]],
      [for service in aws_ecs_service.coupon : ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", service.name, { stat = "Maximum", label = "coupon 최대" }]]
    ) },
    # ---- 3줄: DB ----
    { title = "⑦ RDS CPU", period = 60, lines = [{ value = 90, label = "한계 90%" }],
    metrics = [concat(["AWS/RDS", "CPUUtilization"], local.rds_dims, [{ stat = "Average", label = "CPU" }])] },
    { title = "⑧ RDS 연결 수", period = 60, lines = var.coupon_service ? [] : [{ value = 48, label = "평소 연결 예산 48" }],
    metrics = [concat(["AWS/RDS", "DatabaseConnections"], local.rds_dims, [{ stat = "Maximum", label = "연결" }])] },
    { title = "⑨ RDS CPU 크레딧 잔량 (t4g 버스트형)", period = 60, lines = [],
    metrics = [concat(["AWS/RDS", "CPUCreditBalance"], local.rds_dims, [{ stat = "Minimum", label = "크레딧" }])] },
  ], [for service in aws_ecs_service.coupon : {
    title = "⑩ 쿠폰 서버 태스크 수 (ECS coupon)"
    period = 60
    lines = []
    metrics = [
      ["ECS/ContainerInsights", "DesiredTaskCount", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", service.name, { stat = "Average", label = "coupon 목표 태스크" }],
      ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", service.name, { stat = "Average", label = "coupon 실행 태스크" }],
    ]
  }])
}

resource "aws_cloudwatch_dashboard" "ops" {
  dashboard_name = "${local.name}-${local.region}" # 평소 정책 Dashboard 권한의 이름 범위(hotel-booking-aws-v2-*)
  dashboard_body = jsonencode({
    start          = "-PT15M"  # 최근 15분 (녹화 때 그대로)
    periodOverride = "inherit" # 칸마다 정한 주기(1초 · 1분)를 그대로 씀
    widgets = [for i, w in local.dashboard_widgets : {
      type   = "metric"
      x      = (i % 3) * 8
      y      = floor(i / 3) * 6
      width  = 8
      height = 6
      properties = {
        title       = w.title
        region      = local.region
        view        = "timeSeries"
        stacked     = false
        liveData    = true # 1분 안에 들어온, 아직 다 모이지 않은 값도 그림
        period      = w.period
        metrics     = w.metrics
        annotations = { horizontal = w.lines }
        yAxis       = { left = { min = 0 } }
      }
    }]
  })
}
