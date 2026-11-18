# 3단계 덤프 이관과 비교 — 실행 계획 (뼈대, 2026-11-18)

[03 3단계](../03-plan.md#3단계-덤프-이관과-비교)의 할 일을 실행 순서로 풀어 쓴 계획입니다. 지금은 뼈대이고, 절마다 필요한 파일만 읽어 채웁니다. 마감은 이관(3 · 4 · 5단계) 2026-11-27([ADR-059](../03-plan.md#adr-059)).

| 절 | 하는 일 | 완료 기준 | 상태 |
|---|---|---|---|
| 0 | 앱 변경 효과(로컬) | 3단계 비교표 각주 | 설계 · 스크립트 완료, 실행 대기 → [app-change](app-change.md) |
| 1 | 덤프 이관 | 중단 시간 실측, 건수 · 체크섬 일치, 한글 확인 | 뼈대 |
| 2 | 1단계와 같은 k6 비교 | 층별 에러율 · p95 · 처리량, "N명까지 버팀", 오토스케일링 동작 | 뼈대 |
| 3 | 쿠폰 오픈 스파이크 (예약 스케일링 없이 / 있게) | 초과 발급 0, 남은 수량 거절 0, 오픈 순간 p95, 쿠폰 행 처리량 상한 | 뼈대 |
| 4 | 실측 기반 라이트사이징 (2026-11-18 추가) | 태스크 크기 확정, 월 비용 차이 | 뼈대 |

## 하루 순서 (안)

legacy(+ 발생기) apply → 서울 apply → global apply(WAF 예외 포함) → **1 이관** → CD(migrate) → **2 k6 비교 3회**(37분씩) → **3 쿠폰 스파이크** → **4 라이트사이징 확인 1회** → 전부 destroy.

- 이관에 legacy가 필요하고, 발생기도 1단계와 같게 legacy Terraform(`is_load_test=true`)에 있어 같은 날 묶는 게 가장 쌉니다. 2 · 3 · 4는 회차 사이에서 끊고 다른 날 이어 갈 수 있습니다(이때는 legacy를 발생기 때문에 다시 올림).
- 비용: 서울 시간당 약 $0.19(11-16 실측) + legacy · 발생기 + WAF. 하루 합계는 채울 때 계산.

## 1. 덤프 이관

근거: [ADR-008](../04-decisions.md#adr-008)(작은 DB + 점검 시간 허용 → `mysqldump`). AWS도 작은 DB는 `mysqldump`를 RDS로 흘려 넣는 방법을 안내합니다([RDS 외부 MySQL 가져오기](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-importing-data-external-database.html)). 옛 DB(`mysql:8.4` 컨테이너)와 RDS(8.4)는 주 버전이 같습니다.

```text
[사전] 서울 · global 미리 apply, CD는 아직 안 돌림 ── migrate가 빈 DB에 시드를 넣어 버리므로 복원 전에는 금지
[중단 시작] 옛 앱 멈춤
  → 옛 DB에서 mysqldump (utf8mb4, --single-transaction, 루틴 · 트리거 · 이벤트 제외)
  → 압축 → 전달(정할 것 ①) → 서울 RDS에 복원(관리자 계정)
  → 검증: 테이블별 건수 · 체크섬 · 한글 행 바이트 비교
  → CD(migrate): app 계정 · 새 테이블(결제 · 적립금 등, CREATE IF NOT EXISTS) · 시연 계정
[중단 끝] 새 주소에서 예약 성공
[되돌림] 검증이 틀리면 옛 앱을 다시 켬(옛 DB는 손대지 않음) → 그때까지가 중단 시간
```

- 중단 시간: 단계마다 시각을 남기고, 옛 주소와 새 주소를 1초 간격으로 부르는 기록(도쿄 전환 PoC와 같은 방식)으로 "멈춤 → 새 주소 예약 성공"을 잰다
- 채울 것: 체크섬 방법(`CHECKSUM TABLE`이 서버 버전 · 행 형식과 무관한지 문서 확인, 아니면 행마다 CRC32를 XOR로 합침), 덤프 크기 · 시간 예측, 런북(infra/README.md)

## 2. 1단계와 같은 k6 비교

- 같은 [baseline.js](../../load/baseline.js)(500명씩 3,000명까지, 37분) × 3회, 같은 발생기(t3.medium, legacy VPC)
- 대상만 바뀜: 1단계 `http://<앱 IP>` → 3단계 `https://hotel.vundle34.cloud`(CloudFront → WAF → 통로 → ALB → Fargate 2~4개 → RDS). `/api/*`는 캐시를 끈 경로라(global `cloudfront.tf`) 모든 요청이 서버까지 간다
- 서버 지표는 SSH가 아니라 CloudWatch에서: ECS CPU · 메모리, RDS CPU · 연결 수, 태스크 수 변화 시각, 앱 1초 지표(ADR-061)
- 비교표 각주: 0절 앱 변경 효과
- 채울 것: `run-baseline.sh`를 3단계 대상으로 돌리는 방법(서버 지표 수집 부분), 예측(1단계는 1,000명 뒤 연결 추적 표가 차서 무너짐 → 새 구조에서 먼저 막히는 곳은 태스크 상한 4 × DB 연결 12 = 48인지)

## 3. 쿠폰 오픈 스파이크

- 로컬 E-03([e03-coupon-open.js](https://github.com/yubin05/hotel-booking-app/blob/main/load/e03-coupon-open.js))을 AWS 규모로: 오픈 시각에 N명이 함께 누르고 쿠폰은 M장
- 두 조건 × 3회: **예약 스케일링 없이**(태스크 2개 + 목표 추적만 = 이관 전 IDC처럼 미리 못 늘림, 예약을 깜빡했을 때 안전망 시험) / **있게**(오픈 전 최소 4개, [ADR-015](../04-decisions.md#adr-015))
- 채울 것: N · M, 쿠폰 만드는 방법(관리자 API 또는 SQL), 오픈 시각과 예약 시각의 간격, 예측

## 4. 실측 기반 라이트사이징

- 뜻: 자원 크기를 실제 쓰는 양에 맞추는 것(AWS Well-Architected 비용 원칙 [COST06](https://docs.aws.amazon.com/wellarchitected/latest/framework/cost_type_size_number_resources_metrics.html)). 태스크 **개수**를 자동으로 바꾸는 오토스케일링과 다르다. 이번에 바꾸는 것은 태스크 **한 개의 크기**
- 지금: 0.5 vCPU / 1GB(`ecs.tf`, "3단계 부하 뒤 확정"), 2~4개, CPU 60% 목표 추적
- 자료: 2절 k6 동안 층별 태스크 CPU · 메모리 평균 · 최대
- 후보(Fargate 조합, [문서](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html)): 0.25 vCPU / 0.5 · 1 · 2GB, 0.5 vCPU / 1 ~ 4GB, 1 vCPU / 2 ~ 8GB
- 엮인 것: CPU를 줄이면 같은 부하에 태스크가 더 늘어나고, 태스크당 DB 연결 12 × 상한 4 = 48 계산이 바뀐다. 메모리는 이런 엮임이 없어 먼저 본다
- 확인: 바꾼 크기로 k6 1회 → p95 · 에러가 같은지, 월 비용 차이. 결과는 비용 결정 표 · 09에
- 채울 것: 판단 규칙(실행 전에 숫자로), 예측

## WAF 예외 (2 · 3 · 4 공통)

- 문제: 발생기는 IP 1개라 "IP당 5분 2,000건"(`all-rate-limit`)을 몇 초 만에 넘어 403을 받는다. 서버가 아니라 WAF가 막은 것이 "무너짐"으로 잡힌다
- 안: 요청 제한 규칙 3개(`auth` · `all` · `photo`)에만 "발생기 IP가 아니면 센다"는 범위 조건(scope-down + NOT IP set)을 넣고, 관리형 규칙 4개는 그대로 둔다(손님처럼 WAF 검사 시간을 포함해서 잼). 요청 제한 규칙은 범위 조건에 맞는 요청만 센다([WAF 요청 제한](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-request-limiting.html), NOT IP set 모양은 [Bot Control 예시](https://docs.aws.amazon.com/waf/latest/developerguide/waf-bot-control-example-scope-down-ip.html))
- 발생기 IP는 global apply 때 변수로 넣고 기본값은 빈 목록. global은 시험 날마다 지우므로 예외가 남지 않는다

## 실험 설계 점검표 (2 · 3 · 4 공통)

| 점검 | 어떻게 |
|---|---|
| 1. 응답 시간 = 손님이 기다린 시간 | `blocked + duration` (baseline-report · ab-report와 같음) |
| 2. 기대 결과 · 숨은 기준을 미리 | 절마다 예측 표와 판정 기준을 실행 전에 이 문서에 |
| 3. 같은 조건 3회 | 2 · 3절 3회씩, 4절 확인은 1회(바꾼 크기가 같은 결과를 내는지 보는 확인) |
| 4. 손 조작은 스크립트로 | 쿠폰 오픈 시각 · 예약 스케일링 시각을 스크립트 · Terraform 변수로 고정 |
| 5. 환경 한계 | 발생기 1대(IP 1개 → 한 CloudFront 엣지), 1단계와 달리 HTTPS · CDN을 거침(새 구조의 일부로 봄) |
| 6. 분석 스크립트를 미리 | 2절 baseline-report 재사용, 3절 E-03 분석 재사용 여부 확인 |
| 7. 회귀 테스트 | 앱을 고치게 되면 상태 확인 기반으로 |
| 8. 스모크 점검 | Claude가 짧게(몇 명 · 1분) 돌려 보고 기록하지 않음 |

## 정할 것 (사용자)

| # | 질문 | 추천 | 다른 안 |
|---|---|---|---|
| ① | 덤프를 서울로 옮기는 길 | **S3 경유 + 일회성 복원 태스크**(`mysql:8.4` 이미지에 curl · mysql 있음, 확인함). 비공개 서브넷에 새 통로를 안 열고, migrate와 같은 일회성 태스크 방식, 덤프 파일이 남아 재시도 · 검증 가능 | VPC 피어링으로 옛 DB → RDS 직접(AWS 문서 방식이지만 두 저장소의 Terraform이 엮임) / ECS Exec 포트 포워딩 |
| ② | 점검 방식 | **옛 앱 컨테이너 멈춤**(앱에 점검 모드가 없음). 중단 시간은 어느 쪽이든 같다 | 앱에 점검 화면 추가(옛 환경 이미지를 새로 만들어야 함) |
| ③ | 전환 범위 | **global을 미리 올리고 DNS 전환은 하지 않음**. 도메인은 원래 새 구조만 가리켜, 중단 시간 = 옛 앱 멈춤 → 새 주소 예약 성공. DNS 전환 시간(TTL)은 빠진다고 한계로 적음 | 이관 뒤 global apply(CloudFront 생성 4 ~ 13분이 중단 시간에 들어감) |
| ④ | 일정 | **하루에 1 → 4**(legacy를 한 번만 올림) | 이관 · 비교 / 쿠폰 · 라이트사이징 이틀 |
| ⑤ | k6 IP의 WAF 예외 | **요청 제한 3개만 예외, 관리형 규칙은 그대로** | 시험 동안 WAF 전체를 count 모드 / 예외 없음(WAF 한도 시험이 됨) |
