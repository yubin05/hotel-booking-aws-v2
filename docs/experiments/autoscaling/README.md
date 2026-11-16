# 오토스케일링 예약 시험 원본 기록 (2026-11-16)

손님 없이 "16:45 ~ 17:00에 쿠폰 오픈"이라고 가정한 예약을 걸고, 서울 앱 태스크 수 · ALB 건강 상태 · 오토스케일링 기록을 남긴 것입니다. 해석은 [03 결과 표](../../03-plan.md)의 2-3 ECS 오토스케일링 줄과 [ADR-015](../../04-decisions.md#adr-015)에 있습니다. 같은 시험을 다시 하는 절차는 [런북 5-1](../../../infra/README.md)입니다.

| 구간 | 일 | 시각 | 예약 시각부터 |
|---|---|---|---|
| 시작 (최소 2 → 4) | 예약 실행 | 16:45:38 | +38초 |
| | 새 태스크 2개 시작 | 16:45:42 | +42초 |
| | ALB 등록 | 16:46:11 | +71초 |
| | 안정(손님 받음) | 16:46:29 | **+90초** |
| 끝 (최소 4 → 2) | 예약 실행 | 17:00:23 | +23초 |
| | 목표 추적이 4 → 3 | 17:01:08 | +68초 |
| | 목표 추적이 3 → 2 | 17:02:08 | +128초 |
| | 2개로 정리 끝 | 17:02:45 | **+165초** |

- 설정: 확장 대상 최소 2 · 최대 4, CPU 60% 목표 추적(경보: 늘리기 60% 초과 1분 × 3번, 줄이기 54% 미만 1분 × 15번), 예약 `test-20261116`(시작 최소 4 · 최대 4, 끝 최소 2 · 최대 4, `Asia/Seoul`). 코드는 커밋 `b3c4750`.
- 줄이기 경보는 경보를 만든 직후(16:31)부터 ALARM이었습니다(서울을 올린 13:25부터 CPU가 계속 낮았음). 최소가 4인 동안은 줄이지 못하다가 17:00에 풀리자 바로 줄였습니다.
- 1분마다 하나씩 줄인 것은 대기 시간(쿨다운)을 코드에 안 적어 0초로 들어갔기 때문입니다. 시험 뒤 줄이기 300초 · 늘리기 60초로 적었습니다(커밋 `91e7a55`).
- 한계: 손님이 없는 상태의 1회 측정입니다. 늘리기 경보와 실제 처리 한계는 3단계 부하 시험에서 봅니다.

## 감시 기록 (10초 간격, 바뀔 때만)

평소 사용자로 `describe-services`와 `describe-target-health`를 반복한 결과입니다. 그날 명령은 ALB 상태를 셀 때 줄 끝 문자(`\r`) 때문에 같은 상태를 둘로 나눠 셌습니다. 예를 들어 `3 healthy 1 healthy`는 healthy 4개입니다. 지금 [scripts/watch-scaling.sh](../../../scripts/watch-scaling.sh)는 고쳐져 있습니다.

```text
16:30:30 목표/실행/대기 2 2 0 | ALB  1 healthy 1 healthy
16:45:50 목표/실행/대기 4 2 2 | ALB  1 healthy 1 healthy
16:46:14 목표/실행/대기 4 2 2 | ALB  3 healthy 1 healthy
16:46:26 목표/실행/대기 4 4 0 | ALB  3 healthy 1 healthy
17:01:11 목표/실행/대기 3 4 0 | ALB  3 healthy 1 healthy
17:01:23 목표/실행/대기 3 3 0 | ALB  1 draining 2 healthy 1 healthy
17:01:46 목표/실행/대기 3 3 0 | ALB  2 healthy 1 healthy
17:02:10 목표/실행/대기 2 3 0 | ALB  2 healthy 1 healthy
17:02:22 목표/실행/대기 2 2 0 | ALB  2 healthy 1 healthy
17:02:33 목표/실행/대기 2 2 0 | ALB  1 draining 1 healthy 1 healthy
17:02:45 목표/실행/대기 2 2 0 | ALB  1 healthy 1 healthy
```

## 오토스케일링 활동 기록 (`describe-scaling-activities`)

```text
16:45:38.303 ~ 16:45:38.322  Setting min capacity to 4 and max capacity to 4   (scheduled action name test-20261116-start was triggered)
16:45:38.582 ~ 16:46:47.859  Setting desired count to 4.                      (minimum capacity was set to 4)
17:00:23.588 ~ 17:00:23.593  Setting min capacity to 2 and max capacity to 4   (scheduled action name test-20261116-end was triggered)
17:01:08.540 ~ 17:01:40.777  Setting desired count to 3.                      (monitor alarm ...-AlarmLow-... in state ALARM triggered policy cpu-60)
17:02:08.495 ~ 17:02:44.645  Setting desired count to 2.                      (monitor alarm ...-AlarmLow-... in state ALARM triggered policy cpu-60)
```

## ECS 서비스 이벤트 (`describe-services`)

```text
16:45:42.478  (service app) has started 2 tasks: (task 4b00491a...) (task 612af029...)
16:46:11.332  (service app) registered 2 targets in (target-group .../hotel-booking-aws-v2-app/...)
16:46:29.610  (service app) has reached a steady state.
17:01:13.316  (service app) has stopped 1 running tasks: (task 09bbba16...)
17:01:22.203  (service app) deregistered 1 targets in (target-group ...)
17:01:22.208  (service app, taskSet ecs-svc/...) has begun draining connections on 1 tasks.
17:01:22.289  (service app) has reached a steady state.
17:02:21.341  (service app) has stopped 1 running tasks: (task 4b00491a...)
17:02:30.598  (service app) deregistered 1 targets in (target-group ...)
17:02:30.603  (service app, taskSet ecs-svc/...) has begun draining connections on 1 tasks.
17:02:30.679  (service app) has reached a steady state.
```
