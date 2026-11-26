# 인계: 쿠폰 쏠림 영상 촬영 준비 (2026-11-26, Claude → Codex)

## 배경
- 3,000명 · 100장 쿠폰 오픈을 실패 0%로 만드는 작업이 끝나 감: 소진 기억(앱 fac89aa) → 쿠폰 서버 분리(이벤트 때만) → Valkey 번호표(ADR-080). 회차 1 ~ 10 기록은 [experiments/migration.md](experiments/migration.md) "해결 (가)" 이후
- 회차 10(T 23:40, 쿠폰 서버 DB 연결 [4, 3])이 실패 0%면 그 구성으로 촬영. 결과는 migration.md 회차 10

## 영상 (사용자 계획, 약 75초)
| 초 | 화면 | 내용 |
|---|---|---|
| 0–5 | 제목 카드 | "쿠폰 100장, 3,000명이 동시에" + 구성 그림 |
| 5–15 | 왼쪽 손님 크롬(시크릿, 화면 시계) · 오른쪽 Grafana | T 1분 전 로그인 · 대기 |
| 15–25 | 같음 | T에 "쿠폰 받기" → 받음, Grafana 요청 급증 · 503 0 |
| 25–45 | 같음 | 쿠폰 적용 예약 → 토스 테스트 결제 |
| 45–55 | Gmail | 예약 확정 메일 |
| 55–75 | 결과 카드 | 3,000명 · 100장 · 실패 0 · 대기 p95 · 조회 p95(회차 기록 숫자) |

OBS(1080p 30fps, 장면별 따로 녹화) → AI 편집. 집 PC에서 촬영(학원 망은 DNS 5 ~ 6초로 체감 왜곡, migration.md 학원 HAR)

## Codex가 준비할 것
1. **Grafana 쿠폰 관제 대시보드**(`load/grafana/coupon-dashboard.mjs`)에 쿠폰 서버 추가: ECS `ServiceName: coupon`의 CPU · 실행 대수, 대상 그룹 `hotel-booking-aws-v2-coupon` 정상 대상, 앱 1초 지표를 `Service` app · coupon 두 선으로(앱 92458cc부터 나뉨). CloudWatch 대시보드(`infra/modules/regional/dashboard.tf`)도 같은 패널
2. **사용자가 100장 중 한 장을 반드시 받는 촬영 회차 설계**: 3,000명이 T에 누르면 사람 손은 늦어 "소진"이 뜸. 예) k6가 99장만 받게 하고 1장을 남기거나 사용자 계정을 k6보다 먼저 누르게. 실험 기록 숫자와 섞이지 않게 촬영 회차는 따로 표시
3. **개인정보 가리기 목록**: 이메일 주소 · 개발자 도구의 토큰 · 카드 정보(토스 테스트 카드만)
4. **촬영 순서 런북 한 장**: `scripts/up.sh load` → 서울 tfvars `coupon_service = true` · 예약(`scale_events` T-5 ~ T+10분, min 2 · max 4) → 촬영 회차 → 끝 예약이 지난 뒤 끄기 → `scripts/down.sh` (infra/README.md 5-5)

## 주의
- 쿠폰 서버 · 경로 규칙은 켤 때 서버 → 규칙, 끌 때 규칙 → 서버 순서가 Terraform에 들어 있음(실측 503 0). 예약(scale_events)은 end가 지난 뒤 지울 것
- 관리자 세션은 2시간: 회차 끝 확인 SQL · 시간 쪼개기 · ALB 로그는 관리자 필요
- 원본은 비공개 Drive `hotel-booking-results/<날짜>/load-results/`에 복사
