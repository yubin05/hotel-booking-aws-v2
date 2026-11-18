# 로컬 앱 변경 효과 (3단계 전, 2026-11-18)

3단계에서 "1단계 옛날 구조 vs 새 구조"를 비교할 때 앱도 바뀌었다(결제 · 적립금 · 알림 · 보안 로그, 11-18). 차이가 **인프라 효과만** 되도록, 앱이 바뀐 몫을 로컬에서 먼저 재서 3단계 비교표에 각주로 단다([03 3단계](../03-plan.md#3단계-덤프-이관과-비교)).

## 하는 일

- 비교: 기능을 더하기 전 앱 `02096dc`(old) vs 지금 앱(new, `3efca94`). 손님 행동은 1 · 3단계와 같은 [baseline.js](../../load/baseline.js)
- 환경: 1.5단계 로컬과 같게 DB 컨테이너 0.3코어, 같은 DB(운영 규모 데이터)를 두 앱이 번갈아 씀. 스키마 변경은 새 테이블 추가뿐이라 옛 앱도 새 스키마에서 그대로 돈다
- 단계: 500명(30초 올림 · 4분) → 1,000명(30초 · 4분) → 30초 내림, 1회 약 10분. 순서 old 1 → new 1 → old 2 → new 2 → old 3 → new 3
- 결제 · 알림 키 없이 띄움(1단계와 같은 동작). 앱을 compose 대신 `docker run`으로 띄워 `.env`를 읽지 않게 함
- 새 앱이 k6 경로에 더한 것: 로그인 보안 로그(화면 출력 한 줄, DB 아님) · 예약 뒤 알림 조회(응답을 기다리게 하지 않고 던짐) · 내 예약 목록의 결제 LEFT JOIN · 1분마다 결제 만료 정리(UPDATE 1번)

## 판정 기준 (실행 전에 정함)

- **차이 없음:** 1,000명 층 p95의 3회 범위가 겹치고, DB 시간(실행 전체) 차이가 5% 미만 → 각주 "앱 변경 영향은 로컬 측정 잡음 범위 안"
- 그 밖: 차이를 비율로 각주에 적는다(로컬 숫자는 AWS와 달라 ms가 아니라 비율만 옮김)
- 둘 다 에러율 0%가 전제. 에러가 나면 비교 전에 원인부터 본다

## 실험 설계 점검표

| 점검 | 이번에 어떻게 |
|---|---|
| 1. 응답 시간 = 손님이 기다린 시간 | 분석이 연결 대기 + 응답(`blocked + duration`)으로 계산 |
| 2. 기대 결과 · 숨은 기준을 미리 | 위 판정 기준, 아래 예측 표 |
| 3. 같은 조건 3회 | 3회씩, 번갈아 실행(캐시 데워짐 · 예약 수 증가 · PC의 다른 작업이 한쪽에 몰리지 않게) |
| 4. 손 조작은 스크립트로 | 앱 교체 · DB 통계 초기화 · 단계가 [run-local-ab.sh](../../load/run-local-ab.sh)에 고정 |
| 5. 로컬 한계 | 아래 |
| 6. 분석 스크립트를 미리 | [ab-report.mjs](../../scripts/ab-report.mjs)(층 2개 확인, 요청 종류별 p95, DB 시간) |
| 7. 회귀 테스트 | 해당 없음(앱 수정 없음) |
| 8. 스모크 점검 | Claude가 11-18에 별도 compose(`absmoke`)로 old · new 각 1회(2 → 4명, 약 1분 반): 에러 0, 결과 · DB 시간 기록 확인 후 지움(기록 안 함) |

## 로컬 한계

- k6 · 앱 · DB가 같은 PC(Docker Desktop)라 서로 CPU를 나눠 쓴다. 숫자 자체는 AWS와 다르고 **두 앱의 차이만** 본다
- DB 0.3코어는 t3.micro 흉내가 아니라 DB 쪽 비용 차이를 크게 보이게 하려는 조건
- 컨테이너끼리 통신이라 1단계의 연결 추적 표(conntrack) 한계는 없다
- DB 시간은 MySQL performance_schema의 조회 모양별 합계(`events_statements_summary_by_digest`, 실행 시작에 비움, 타이머 단위 피코초: [요약 표](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-statement-summary-tables.html) · [타이머](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-timing.html)). 스모크에서 비운 뒤 그 실행의 가입 50건만 남는 것을 확인

## 실행 (사용자)

```bash
# 준비 (고객사 저장소) — 이 PC에는 이미지 2개가 11-18 스모크 때 빌드돼 있어 캐시로 바로 끝남
cd /c/dev/hotel-booking-app && git pull
git archive 02096dc | docker build -t hotel-app:old -     # 옛 앱 (커밋 그대로, 작업 폴더 파일 안 섞임)
git archive HEAD | docker build -t hotel-app:new -        # 지금 앱
docker compose up -d --wait db                            # 처음이면 스키마 + 기본 시드가 들어감
docker exec -i hotel-booking-app-db-1 mysql -uroot -plocal-root-pw hotel_booking < db/seed-volume.sql   # 끝에 bookings 100000
docker update --cpus 0.3 hotel-booking-app-db-1

# 시험 (이 저장소)
cd /c/dev/hotel-booking-aws-v2 && git pull
bash load/run-local-ab.sh warmup     # 1분 예열 (기록 안 함)
bash load/run-local-ab.sh old 1      # 약 10분씩. 이어서 new 1 → old 2 → new 2 → old 3 → new 3
node scripts/ab-report.mjs load/results/local-ab-*   # 비교 표

# 끝나면
docker rm -f app && docker update --cpus <Docker CPU 수> hotel-booking-app-db-1   # --cpus 0으로는 안 풀림 (1.5단계 7절)
```

- 이미 쓰던 로컬 DB가 있으면(숙소 1,010개 이상) seed-volume은 넣지 않는다(두 번 넣으면 중복 키로 멈춤). 스크립트가 숙소 1,000개 초과를 확인한다
- compose의 `app`이 떠 있으면 스크립트가 멈춘다(`docker compose stop app`)
- 화면: `시작: local-ab-old-1 (hotel-app:old, 시각)` → k6 진행 → 요약 표 → `끝: … → load/results/local-ab-old-1/`

## 예측 (실행 전)

| 항목 | 뜻 | Claude 예측 | 사용자 예측 |
|---|---|---|---|
| 에러율 | 요청 중 실패한 비율 | old · new 모두 0% | Claude와 같음 |
| 1,000명 전체 p95 | 손님 100명 중 95번째로 오래 기다린 시간(줄 선 손님 대부분이 이 안에 받음) | 둘 다 수 ms ~ 수십 ms, 3회 범위가 겹침 | Claude와 같음 |
| login p95 | 로그인 | 둘 다 약 200ms(일부러 느린 비밀번호 해시), 차이 없음 | Claude와 같음 |
| booking p95 | 예약 | 차이 없음(알림 조회는 응답을 기다리게 하지 않음) | Claude와 같음 |
| my-bookings p95 | 내 예약 목록 | 차이 없음(결제 표가 비어 있고 기본 키로 붙임) | Claude와 같음 |
| DB 시간 | 실행 10분 동안 DB가 조회를 실행한 시간의 합 | new가 0 ~ 3% 많음(예약마다 알림 조회 1번 + 1분마다 만료 정리) | Claude와 같음 |
| 판정 | 위 기준 | **차이 없음** | Claude와 같음 |

## 결과

(실행 후 기록)
