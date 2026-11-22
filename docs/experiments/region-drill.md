# 5단계 리전 복원 드릴 — Backup & Restore 3회 시도 → Pilot Light로 전환 (2026-11-22)

서울 리전 장애를 선언하고 도쿄에서 DB를 살려 손님을 받은 뒤 서울로 되돌리는 훈련입니다. 2026-11-21 Backup & Restore(복제된 백업으로 시점 복원, [ADR-062](../04-decisions.md#adr-062))로 3회 시도했고, **3회 모두 RTO를 끝까지 재지 못했습니다.** 실측 RPO는 1회(10분 5.6초)뿐입니다. 2026-11-22 고객사 관점으로 다시 따져 **Pilot Light(도쿄 RDS 읽기 복제본 → 승격)로 바꿨습니다**([ADR-066](../04-decisions.md#adr-066)). **측정 · 검증되지 않은 시간을 완료 수치로 쓰지 않습니다.** 흐름은 [02 8 · 9절](../02-architecture.md#8-리전-장애-복구-흐름-pilot-light), 실행은 [런북 5-8](../../infra/README.md#5-8-리전-복원-드릴-5단계), 스크립트는 [drill/region.sh](../../drill/region.sh).

## Pilot Light로 바꾼 이유 (고객사 설명용)

| 무엇을 봤나 | 근거 (11-21 드릴 원본) | 고객사에 뜻하는 것 |
|---|---|---|
| **데이터 유실 10분대** | 실측 RPO 10분 5.6초(시험 예약 600건 유실). 예상값 12분 17초 · 12분 29초. RDS는 변경 기록을 5분마다 올리고 그걸 도쿄로 복사하는 구조라 원리상 수 분 ~ 10분대가 빈다([RDS 문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html)) | 결제가 붙으면 그 구간의 예약은 "돈은 빠졌는데 예약이 없는" 상태 → 결제사 기록과 맞춰 환불 · 연락하는 수작업 |
| **복구 시간을 약속할 수 없음** | 같은 백업 · 같은 설정에서 DB 복원이 **7분**(시도 2: 15:48:59 apply → 15:56:00 복원 완료 이벤트)과 **94분 동안 미완료**(시도 3: 복원 완료 이벤트 없이 18:31 삭제)로 갈렸다. 원인은 RDS 이벤트로 알 수 없음 | "1시간 안 복구"를 계약서에 못 쓴다. 우리가 줄일 수 있는 단계가 아님 |
| **미리 정한 기준에 걸림** | [ADR-036](../04-decisions.md#adr-036)(11-13): "리전 RTO가 1시간을 넘으면 가장 느린 단계를 Pilot Light로". 가장 느리고 불확실한 단계가 DB 복원 | 즉흥 결정이 아니라 사전 합의대로 올린 것 |
| **비용** | 도쿄 db.t4g.micro 복제본 상시 월 약 $21 + 서울 → 도쿄 전송(ADR-062의 AWS 가격 목록 단가) | 설계 월 고정비 약 $204([ADR-034](../04-decisions.md#adr-034))의 약 10%를 "보험료"로 냄. 리전 장애는 드물어 그 전엔 비용만 나가지만, 한 번의 유실 · 장기 중단보다 싸다고 판단 |

- 고객사 목표(잠정, 다음 드릴 3회로 확정): **리전 RTO 30분 · RPO 1분**. AZ 10분은 그대로([ADR-067](../04-decisions.md#adr-067) zonal shift 포함)
- 바뀌지 않는 것: 전환 결정은 사람(감지 · 알림은 자동, [ADR-012](../04-decisions.md#adr-012)). 승격은 되돌릴 수 없어서([RDS 문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.Promote.html)) 잠깐 흔들린 것에 자동으로 넘어가면 손해가 크다. 서울 자동 백업 7일도 유지: 복제본은 실수(잘못 지운 데이터)도 그대로 복제한다

## 단계 (Pilot Light, 스크립트가 시각을 남김)

| 단계 | 하는 일 | 누가 |
|---|---|---|
| 대기 | `region.sh standby`: 도쿄에 서울 DB의 읽기 복제본 + 그 DB의 네트워크(VPC · DB 서브넷 · 보안 그룹 · 설정표, 7개). 설계는 상시, 포트폴리오는 드릴 날만 | 사용자(Terraform yes) |
| ① 사전 | 도쿄 DB가 `available` + 원본 ARN인지 확인 → 손님 역할(writer) · 도쿄 DB 상태 기록기 시작(둘 다 스크립트와 따로 돎) → 60초 | 스크립트 |
| ② 장애 선언 | 서울 앱을 0으로(멈춤 흉내), 그 순간의 복제 지연(CloudWatch `ReplicaLag`) = 예상 RPO | 스크립트 |
| ③ 승격 | `infra/tokyo` plan(DB만, `-target`) → 확인 → apply: `replica_source_arn`을 빼서 승격 + 도쿄 관리자 금고 | 스크립트, 확인은 사용자 |
| ③' 도쿄 인프라 | 나머지(ALB · ECS · NAT · 통로 · 태스크 정의) plan → 확인 → apply | 스크립트, 확인은 사용자 |
| ④ 데이터 확인 | 도쿄 안 sql 태스크: 장애 선언 전 손님 쓰기가 몇 번까지 있나. **실패해도 전환은 계속**(되돌리기 전에 다시 셈) | 스크립트 |
| ⑤ 전환 · ⑥ 복구 끝 | global `active_region=ap-northeast-1` → 손님 쓰기가 도쿄 앱에서 성공한 시각 | 스크립트, 확인은 사용자 |
| 되돌리기 | 도쿄 멈춤 → 서울 옛 DB에서 대조 목록 → 덤프 이관(도쿄 → 서울) · 체크섬 → 서울 앱 · global 서울로(ADR-062 그대로) | 스크립트, 확인은 사용자 |
| 정리 | 도쿄 destroy(51개). 다음 회차는 standby부터 | 사용자 |

- **장애 흉내 방식:** 서울 앱 태스크를 0으로. 실제 리전 장애는 서울 API까지 안 될 수 있지만 재현하지 않는다(한계). CloudFront · Route 53 · Terraform state(도쿄 버킷)는 서울 장애와 무관한 곳에 있다(ADR-012 · ADR-025)
- **RPO 한계:** 드릴에서는 서울 DB가 살아 있어 선언 뒤에도 복제가 따라온다. 그래서 실제 잃은 쓰기는 0에 가깝게 나오고, 실제 장애면 선언 순간의 복제 지연만큼 잃는다 → 둘을 나란히 적는다
- **측정이 끊기지 않게 (11-21 교훈):** 시도 2 · 3은 스크립트가 멈추면서 손님 측정기도 같이 꺼져 RTO를 잃었다. 이제 측정기 · DB 상태 기록기는 스크립트와 따로 돌고(`region.sh stop`으로 끝냄), 보고서가 측정기 원본만으로 "장애 선언 → 도쿄 첫 예약 성공"을 센다

## 재는 것

| 지표 | 뜻 | 계산 |
|---|---|---|
| RTO | 장애 선언부터 손님 쓰기가 도쿄에서 성공할 때까지 | 보고서 `RTO(측정기 원본)` = writer.log에서 t0 뒤 도쿄 앱이 처음 성공시킨 예약. marks의 `rto_end`와 같아야 함. **사람 확인(plan 보고 yes) 시간은 따로** |
| 단계별 시간 | 판단 + DB 승격 + 인프라 + 검증 + CloudFront | `tokyo_promote_apply → tokyo_promote_done`, `tokyo_db_writable`(DB 상태 기록기, Terraform과 별개), `tokyo_apply → tokyo_done`, `check`, `global_to_tokyo_*` |
| RPO | 장애 선언 − 도쿄에 남은 마지막 손님 쓰기 | `replica_lag_s`(선언 때 복제 지연 = 실제 장애의 예상치) + 보고서 RPO(드릴의 실제 잃은 쓰기, 한계 위) |
| 대조 | 서울 옛 DB에서 도쿄에 남은 마지막 손님 쓰기 뒤 바뀐 예약(새 예약 · 날짜 변경 · 취소)을 덮기 전에 뽑음 = 고객사가 처리할 목록 | lost-in-seoul.txt에서 `drill_lost = 1`인 행 수 = 보고서의 잃은 쓰기 건수. **한계:** 예약 표만 본다 |
| 되돌리기 중단 · 데이터 일치 · 멱등성 | ADR-062와 같음 | `failback_end − failback_start`, 12개 표 체크섬, 같은 순번에 예약 번호 하나 |

## 실험 설계 점검표

| 점검 | 어떻게 |
|---|---|
| 1. 응답 시간 = 손님이 기다린 시간 | writer가 연결 포함으로 잼. 이 드릴의 주 지표는 시각(RTO · RPO) |
| 2. 기대 결과 · 숨은 기준을 미리 | 아래 예측. 체크섬 불일치 · 중복 예약 · 대조 건수 불일치는 실패 |
| 3. 같은 조건 3회 | 3회. 회차마다 도쿄 destroy → standby → run |
| 4. 손 조작은 스크립트로 | 장애 선언 · 승격 · 확인 SQL · 덤프 이관을 스크립트가. Terraform 확인(yes)은 사람이라 시간을 따로 셈 |
| 5. 환경 한계 | 서울 API · DB는 살아 있음(장애 흉내, RPO 한계 위), 손님 PC 한 대, 부하 없음(초당 5건) |
| 6. 분석 스크립트를 미리 | drill-report.mjs 자체 점검 통과(도쿄 첫 성공 계산 추가), 11-21 시도 2 원본으로 출력 확인 |
| 7. 회귀 테스트 | 해당 없음 |
| 8. 스모크 | 도쿄 standby plan 7 to add 확인(11-22, 서울 ARN은 형식만 맞춘 값). 첫 드릴에서 확인할 가설 3개(아래) |

**첫 드릴에서 확인할 가설 (문서로 확정 못 함)**
- 도쿄 AWS 관리 키(`aws/rds`)로 다른 리전 복제본이 되는지: B&R 복제에서는 됐음(11-21), 복제본은 처음
- 승격과 도쿄 관리자 금고 붙이기가 한 apply에서 되는지: 안 되면 같은 명령을 한 번 더(금고만 붙음)
- standby(복제본 만들기) 시간: RTO 밖이지만 회차 준비 시간이라 잼

## 예측 (Pilot Light, 실행 전)

근거: 승격은 "몇 분"([RDS 문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.Promote.html)). 도쿄 인프라는 11-15 전환 PoC에서 9분 남짓(빈 DB 포함), 11-21 시도 2에서 51개 14분 51초(그중 DB 복원 7분 + 첫 백업 약 2분 30초). 복제 지연은 문서에 숫자가 없어 가설.

| 예측 | 뜻 | Claude (가설) | 사용자 |
|---|---|---|---|
| standby | 복제본 + 네트워크 7개 | 15 ~ 40분 (RTO 밖) | - |
| 예상 RPO (선언 때 ReplicaLag) | 실제 장애 때 잃는 시간 폭 | 0 ~ 5초 | |
| 드릴 실제 잃은 쓰기 | 한계 위 | 0건 | |
| DB 승격 (`tokyo_promote` apply) | 복제본 → 독립 DB + 금고 | 3 ~ 10분 | |
| 나머지 도쿄 인프라 | 44개 | 8 ~ 12분 | |
| RTO (사람 확인 뺀 값) | 장애 선언 → 도쿄에서 쓰기 성공 | 15 ~ 25분, 목표 30분 안 | 숫자 없음: 손님이 불편을 못 느낄 만큼 최대한 빨리 (목표 30분) |
| 되돌리기 중단 · 체크섬 · 대조 · 중복 | B&R 예측과 같음 | 8 ~ 15분 · 일치 · 일치 · 0 | |

## 결과 — Pilot Light

(실행 뒤 회차마다 drill-report 표와 RTO · RPO를 붙임)

## 결과 — Backup & Restore (2026-11-21, 3회 모두 측정 회차 아님 · 기록 보존)

### 시도 1 · 2 (둘 다 중간에 멈춤)

| 항목 | 시도 1 | 시도 2 |
|---|---|---|
| 결과 폴더 | `region-20261121-141046` | `region-20261121-153049` |
| 장애 선언(t0) | 14:26:22 | 15:44:10 |
| 예상 RPO (선언 − 복원 가능 시각) | 737초 | 605초 |
| 실제 RPO | - (DB 복원 실패) | **605.6초, 잃은 쓰기 600건** (도쿄에 남은 마지막 순번 187, 중복 0) |
| 도쿄 apply | 실패 (41개 만든 뒤 DB 복원 거부) | 51개 **14분 51초** (15:48:59 → 16:03:50, 예측 20 ~ 35분보다 빠름) |
| 복원 DB 행 수 | - | users 20,008 · hotels 1,010 · bookings 101,139 |
| RTO | - | - (writer가 멈춰 못 잼) |
| 멈춘 이유 | `RestoreDBInstanceToPointInTime`이 `InvalidParameterValue: DBName must be null when Restoring for this Engine` 반환. `rds.tf`가 새로 만들 때 쓰는 `db_name`을 복원 때도 보냄(공급자 6.73.0은 값이 있으면 그대로 보냄) | 확인 SQL에서 관리자 세션 만료(`Your session has expired`). 콘솔 역할 세션 1시간이 15:03쯤 시작돼 16:03쯤 끝남(가설: 같은 브라우저 세션으로 다시 로그인해도 끝나는 시각은 안 늘어남) |
| 고친 것 | 복원 때는 `db_name = null` (DB 이름은 백업에서 그대로 옴). 도쿄 plan에서 `db_name = (known after apply)` 확인 | Administrator-Role 최대 세션 1 → 2시간(사용자), 회차마다 콘솔에서 역할을 새로 전환한 뒤 로그인 |

- 시도 2의 RPO는 확인 SQL만 손으로 돌려(`REGION=ap-northeast-1 bash migration/sql.sh .../check.sql`) 건졌다. 예상값(605초)과 실제(605.6초)가 맞아, 복원 시점 = 선언 때의 복원 가능 시각이라는 설계가 그대로 동작함
- 예측과 비교: RPO 605초는 예측(5 ~ 10분)의 위쪽 끝, 시도 1의 737초는 넘음. 복원 가능 시각은 5분 단위로 올라갔다(시도 2 대기 로그 06:29:05 → 06:34:05). 선언이 5분 주기의 어디에 걸리느냐로 RPO가 최대 5분 달라진다(가설: 두 시도의 132초 차이도 여기서)
- 시작 전 도쿄 백업 조회도 고침: `--dbi-resource-id`는 도쿄 복제 백업을 못 찾음(`DBInstanceAutomatedBackupNotFound`) → DB 이름으로 조회하고 서울 DB 고유 ID · `replicating`으로 1개를 고름

### 시도 3 (DB 복원이 끝나지 않음)

| 항목 | 값 |
|---|---|
| 결과 폴더 | `region-20261121-164113` |
| 장애 선언(t0) | 16:56:34, 복원 시점 16:44:05 → **예상 RPO 749초(12분 29초)** |
| 도쿄 apply | 16:56:49 시작(51개) → 17:46:49쯤 **Terraform 실패**: `timeout while waiting for state to become 'available, storage-optimization' (last state: 'creating', timeout: 50m0s)` |
| 복원 설정 | 시도 2와 같은 백업 ARN(`ab-j4m3…`) · 같은 인스턴스 · 같은 설정(두 plan 비교) |
| 측정 | DB 사용 가능 시각 · 확인 SQL · RTO 모두 없음 → 측정 회차 아님 |

### DB 복원 시각 (도쿄 RDS 이벤트, 2026-11-22 조회 · 원본 `drill/results/region-tokyo-rds-events-20261121.json`)

| 시각 (KST) | 시도 2 | 시각 (KST) | 시도 3 |
|---|---|---|---|
| 15:48:59 | 도쿄 apply 시작 | 16:56:49 | 도쿄 apply 시작 |
| 15:53:04 · 15:53:47 | DB instance shutdown ×2 | 17:00:40 · 17:01:32 | DB instance shutdown ×2 |
| 15:54:02 | crash recovery binlog 위치 | 17:14:27 | Recovery of the DB instance has started |
| **15:56:00** | **Restored from DB instance … to 06:34:05 (UTC)** | 17:17:13 | Recovery of the DB instance is complete |
| 15:58:13 → 16:00:46 | 첫 자동 백업 | 17:23:40 | Recovery … has started (다시) |
| 16:03:20 | Reset master credentials(금고) | 17:25:30 | Recovery … is complete |
| 16:03:50 | Terraform 완료 | - | **"Restored from" 이벤트 없음** |
| 16:23:39 | DB 삭제(되돌린 뒤 destroy) | 18:31:00 | DB 삭제 (apply 시작부터 1시간 34분) |

- 시도 2는 apply 시작부터 복원 완료까지 **7분 1초**, 시도 3은 같은 조건에서 **94분 동안 복원 완료가 없었다.** 복구(recovery)가 두 번 돌았다는 것 말고는 이벤트에 원인이 없다. AWS 내부 단계라 우리가 줄일 수 없고, 이 편차가 Pilot Light로 바꾼 두 번째 이유(위 표)
- 정리: 서울 · global · 도쿄 destroy(11-21), 도쿄 복제 백업은 2026-11-22 `region.sh cleanup`(당시 이름)으로 삭제 — 복원 가능 구간 11-21 13:35 ~ 20:04였음. 실측 원본(PC `drill/results/`, 비공개 Drive)은 보존
