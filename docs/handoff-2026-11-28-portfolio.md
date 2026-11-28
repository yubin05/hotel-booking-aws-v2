# 인수인계: 도쿄 DR 최종 재측정 3회 → 포트폴리오 · Cloud Lab 갱신 (2026-11-28, Claude → Codex)

## 1. 결론 (바깥에 쓸 숫자)

- **최종 조건 3회 모두 목표 충족: RTO 중앙 12분 37초(최대 13분 22초), 목표 RTO 15분(장애 선언 기준) · RPO 1분** ([ADR-082](04-decisions.md#adr-082))
- 장애 선언 때 복제 지연(`ReplicaLag`) 3회 모두 0.0초, 체크섬 **13개 표** 일치 · 중복 예약 0
- 도쿄 DB Multi-AZ 보강(손님을 받은 뒤, RTO 밖) 중앙 9분 53초, 그동안 손님 쓰기 실패 3회 모두 0
- 서울 되돌리기 중단 중앙 6분 6초
- DR 판단 알림: 장애 뒤 중앙 6분 11초에 Slack ALARM, 도쿄 전환 뒤 약 4분 23초에 OK
- 근거 · 회차별 표: [region-drill.md "결과 — 11-28 재측정"](experiments/region-drill.md)

## 2. 표현할 때 지킬 것

- **RTO 15분은 "장애 선언 → 도쿄에서 첫 예약 성공" 기준**이라고 같은 줄에 쓴다. AWS 정의(서비스 중단부터) 기준 예상은 감지 6분 11초 + 판단 최대 10분 + 복구 12분 37초 ≈ **약 29분** — 숨기지 말고 한 줄로 병기
- 11-22(12분 28초, NAT 1 · 보강 없음 조건)와 11-28(12분 37초, 최종 조건)은 **섞지 않는다.** 11-22는 "기존 조건", 11-28이 "최종 조건 재검증"
- 복제 지연 0.0초 ≠ 데이터 유실 0 보장. 드릴은 서울 DB가 살아 있어 실제 잃은 쓰기가 0에 가깝게 나오는 한계(측정기 잃은 쓰기 1 · 0 · 0건, 1건은 초 단위 경계 오차)
- 실제 사이트 로그인 · 예약 확인은 이번 3회에서 생략(11-22 2회차에서 확인한 것만 있음). 데이터 이관은 측정기 예약 + 체크섬으로 확인
- 병목은 그대로 CloudFront VPC origin 생성(8분 17초 ~ 9분 12초). Valkey · NAT 2개는 가장 긴 길 밖이라 RTO 영향 없음

## 3. 갱신할 곳 (포트폴리오 `C:/dev/portfolio`)

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `src/components/V2CaseStudy.astro` 24행 카드 | 12분 28초 · "재측정 예정" | 12분 37초 · "11/28 최종 조건 3회 중앙값 · 목표 15분 충족" |
| 같은 파일 116 · 119 · 279 · 286행 | "개선 목표 · 재검증 예정" | "목표 15분 충족(선언 기준), 장애 시작 기준 예상 약 29분" |
| 같은 파일 273행 Pilot Light 패널 | 12분 28초(11/22) | 11/28 12분 37초를 주 숫자로, 11/22는 기존 조건으로 |
| `src/content/projects/hotel-booking-aws-v2.md` 9 · 54 · 75 · 152 · 171행 | "최종 DR 재검증 예정" | README 7 · 49 · 125 · 136행과 같은 문장(공통 섹션은 같은 글) |
| Cloud Lab `/dr/` | 11-22 실측 | 아래 4절 원본으로 11-28 3회 장면 |

## 4. 원본 데이터 (PC `C:/dev/hotel-booking-aws-v2/drill/results/`, Drive `hotel-booking-results/20261128/drill-results/`)

| 회차 | 폴더 | 들어 있는 것 |
|---|---|---|
| 1 | `region-20261128-150733` | `report.md`(RTO · RPO · 손님 오류), `marks.log`(단계 ms 시각), `writer.log`(손님 요청 원본), `db-state.log`, `dr-alert-history.json`(경보 ALARM · OK 시각), `tf-*.log`, `grafana/`(`manifest.json` · `panel-*.json` · `replay-rows.json`) |
| 2 | `region-20261128-161321` | 같음 + `standby2-*.log` |
| 3 | `region-20261128-172907` | 같음 + `standby3-*.log` |

- Grafana 구간: 각 회차 standby 끝 5분 전 ~ 회차 끝. `replay-rows.json`에는 TaskId · 대상 그룹 이름이 있어 **익명화 뒤 공개**
- Slack 도착 시각: 경보 시각과 같은 분(사용자 화면 대조). 되돌리기 뒤 OK는 1회차 15:43:56 · 2회차 16:47:56(사용자 Slack), 3회차 18:03:56(경보 이력)

## 5. Grafana 대시보드에서 고칠 것 (Codex)

- **도쿄 · RDS ReplicaLag 패널이 3회 모두 No Data** — CLI(`get-metric-statistics`, 60초 Maximum)로는 0.0을 읽음. 패널 쿼리의 리전 · 차원 · 기간 확인
- **도쿄 ALB 요청 수 · 5xx · 응답 p95, 도쿄 앱 EMF 패널이 없음** — CloudWatch 1분 지표는 15일 보관이라 지금 추가해도 11-28 구간을 다시 뽑을 수 있음(`scripts/collect-grafana-operations.cjs --from ... --to ...`, 11-28에 절대 구간 옵션 추가)
- 서울 앱 5xx 패널 No Data 2개는 정상(앱 0대라 ALB가 직접 503)

## 6. 같은 날 바뀐 결정 (포트폴리오 설계 카드에 반영할지 판단)

- [ADR-079](04-decisions.md#adr-079) 장애 선언 기준: 리전 단위 영향 + 알림 뒤 10분 회복 안 됨. ECS 0대처럼 서울 안에서 고칠 수 있는 건 일반 장애 대응이 먼저
- [ADR-081](04-decisions.md#adr-081) 전환 뒤 도쿄 = 서울과 같은 구성(Valkey 상시, 쿠폰 서버 · 이벤트 늘림 스위치). 평시는 그대로 Pilot Light
- [ADR-082](04-decisions.md#adr-082) 목표 RTO 15분(선언 기준)

## 7. 남은 후보 (사용자 결정 전, 구현 안 함)

- 장애 시작 기준으로도 15분 안: VPC origin · ALB를 standby에 미리 / 경보 조건 단축 / 판단 시간 단축
- 경보 설명 문구를 상태별로(OK 알림에도 "3분 연속 실패"가 붙어 오해) — 코드는 11-28 수정, 다음 global 생성부터 적용
- 계획된 되돌리기 전 경보 동작 잠시 끄기(되돌리기 6분 > 감지 6분이라 ALARM이 옴)
- Slack 스레드 묶임: 채널에서 `@Amazon Q preferences`로 스레드 끄기(사용자 확인 대기, CloudWatch 경보에도 적용되는지는 문서 미확인)
