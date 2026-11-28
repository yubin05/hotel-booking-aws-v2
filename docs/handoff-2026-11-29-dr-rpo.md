# 인수인계: 서울 실제 장애(DB까지) RPO 드릴 계획 (2026-11-29 일 13:00~, Claude)

## 0. 지금 상태 (11-28 18:25 기준)
- **인프라 전부 내림:** 서울 · global · 도쿄 state 0, EC2 · RDS · NAT 0. 남은 것은 상시 bootstrap뿐
- tfvars(집 PC): 서울 `multi_az = true`만, 도쿄 `multi_az = true`(standby가 지움). 실험용 `rds_enhanced_monitoring` 줄은 지움 → Standby 관제가 필요하면 서울 · 도쿄에 다시 `rds_enhanced_monitoring = true`
- 도쿄 장애 ① plan 기대값 **49 · 1 · 0**(Valkey 포함, [ADR-081](04-decisions.md#adr-081)), 보강 0 · 1 · 0, global 1 · 1 · 1, 빈 도쿄 destroy **56**
- 저장소 main 최신(`afcaaa5`), 실측 원본은 PC `drill/results/region-20261128-*` + Drive `hotel-booking-results/20261128/drill-results/`
- Codex 몫(포트폴리오 · Cloud Lab · Grafana 패널): [handoff-2026-11-28-portfolio.md](handoff-2026-11-28-portfolio.md) — 이 세션에서는 건드리지 않음
- 사용자 확인 대기: Slack 스레드 끄기(`@Amazon Q preferences`) 결과, 11-28 learning-log 후보 3개(RTO 정의 · 복제본 붙은 RDS 중지 불가 · 경보 감지 6분 구성)
- 사용자 주간 토큰이 11-28 밤 98% → **11-29 13:00 초기화 뒤 시작.** 회차 중간에 끊기면 도쿄 승격 · 서울 차단 상태로 남으니, 한 회차 끝까지 갈 여유를 보고 시작

## 배경 (11-28)
- 최종 조건 3회: RTO 중앙 12분 37초(목표 15분, 장애 선언 기준) 충족 — [region-drill.md](experiments/region-drill.md), [ADR-082](04-decisions.md#adr-082)
- **한계:** 장애 흉내가 서울 앱(ECS) 0대뿐이라 서울 DB는 살아 있었고 복제가 계속됨 → RPO 0.0초는 "선언 순간 `ReplicaLag`" 추정치. 부하도 초당 5건이라 지연이 0일 수밖에 없음
- 사용자 요청: 서울 DB · ECS · ALB를 확실히 죽인 상태에서 실제 유실을 재자. A(부하) + B(복제 끊기)를 한 회차로

## 내일 순서
1. **문서 확인 먼저 (사실은 가설 상태):**
   - AWS FIS `aws:network:disrupt-connectivity`로 서울 서브넷(app · db, 필요하면 public) 통신 차단 가능 범위 · 자동 복구 · 필요한 IAM 역할
   - DB 서브넷 NACL 차단이 **리전 간 읽기 복제(서울 → 도쿄)도 끊는지**. 문서로 안 나오면 회차에서 실측(`ReplicaLag` · 도쿄 `Replica_IO_Running`)
   - 안 끊기면 대안: 도쿄 복제본에 `CALL mysql.rds_stop_replication`(도쿄에 SQL 실행 수단 필요: standby에 작은 실행 환경 또는 CloudShell VPC 환경)
   - 참고: 복제본이 붙은 DB는 중지 불가(*"You can't stop a DB instance that has a read replica"*, [RDS 문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html))
2. 설계안을 사용자에게 보여 주고 결정(ADR) → 구현
3. `scripts/up.sh load`(서울 + 부하 발생기 + global) → 도쿄 standby(`round.sh`처럼 plan 7 확인)
4. 1회: k6 부하 중 t0에 서울 차단(+ 서울 앱 0) → 기존 run 절차 → **"t0 전에 2xx를 받았는데 도쿄에 없는 예약"을 writer.log와 도쿄 DB로 직접 대조** = 실제 유실 건수
5. 되돌리기 전 서울 차단 해제(FIS 실험 끝) 확인 → 기존 되돌리기 → destroy → `down.sh`

## 주의
- 관리자 세션 2시간: 회차 run 직전에 콘솔 역할 재전환 + `aws login --profile admin`
- 되돌리기는 서울 DB가 다시 보여야 함(대조 · 복원). 차단 해제 순서를 스크립트에 넣을 것
- CloudFront는 전 세계 공통이라 리전 DR 범위 밖 → 차단 대상 아님
- 자동 회차 스크립트 원형: [drill/round.sh](../drill/round.sh)(standby plan 7 → run(보강 뒤 자동 Enter) → Grafana `--from/--to` → destroy plan 56)
