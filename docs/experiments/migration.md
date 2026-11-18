# 3단계 덤프 이관과 비교 — 실행 계획 (뼈대, 2026-11-18)

[03 3단계](../03-plan.md#3단계-덤프-이관과-비교)의 할 일을 실행 순서로 풀어 쓴 계획입니다. 지금은 뼈대이고, 절마다 필요한 파일만 읽어 채웁니다. 마감은 이관(3 · 4 · 5단계) 2026-11-27([ADR-059](../03-plan.md#adr-059)).

| 절 | 하는 일 | 완료 기준 | 상태 |
|---|---|---|---|
| 0 | 앱 변경 효과(로컬) | 3단계 비교표 각주 | **완료(11-18):** 500명에서 차이 없음, 새 조회 DB 0.003초/실행. 1,000명은 포화로 비교 제외 → [app-change](app-change.md) |
| 1 | 덤프 이관 | 중단 시간 실측, 건수 · 체크섬 일치, 한글 확인 | 뼈대 |
| 2 | 1단계와 같은 k6 비교 | 층별 에러율 · p95 · 처리량, "N명까지 버팀", 오토스케일링 동작 | 뼈대 |
| 3 | 쿠폰 오픈 스파이크 (예약 스케일링 없이 / 있게) | 초과 발급 0, 남은 수량 거절 0, 오픈 순간 p95, 쿠폰 행 처리량 상한 | 뼈대 |
| 4 | 실측 기반 라이트사이징 (2026-11-18 추가) | 태스크 크기 확정, 월 비용 차이 | 뼈대 |

## 하루 순서 (2026-11-18 정함)

legacy(+ 발생기) apply → 서울 apply → global apply(WAF 예외 포함) → **1 이관**(복원 뒤 migrate) → **2 k6 비교 3회**(37분씩) → **3 쿠폰 스파이크** → **4 라이트사이징 확인 1회** → 전부 destroy.

- 이관에 legacy가 필요하고, 발생기도 1단계와 같게 legacy Terraform(`is_load_test=true`)에 있어 같은 날 묶는 게 가장 쌉니다. 2 · 3 · 4는 회차 사이에서 끊고 다른 날 이어 갈 수 있습니다(이때는 legacy를 발생기 때문에 다시 올림).
- 비용: 서울 시간당 약 $0.19(11-16 실측) + legacy · 발생기 + WAF. 하루 합계는 채울 때 계산.

## 1. 덤프 이관

근거: [ADR-008](../04-decisions.md#adr-008)(작은 DB + 점검 시간 허용 → `mysqldump`), 경로 · 점검 방식은 아래 [정한 것](#정한-것-2026-11-18-사용자) ① ②. 옛 DB와 복원 태스크가 같은 `mysql:8.4` 이미지라(mysqldump · mysql · gzip · openssl 있음, 확인함) 양쪽 도구가 같다. 옛 DB 스키마는 고객사 저장소 main의 `schema.sql`을 받아 만들어 새 구조와 같다(`legacy/ec2_instance.tf`).

**가정한 점검 창:** 고객사와 합의해 손님에게 미리 공지한 새벽 03:00 ~ 04:00(1시간). 시험은 낮에 같은 절차로 한다. 시작 40분까지 검증을 통과하지 못하면 되돌린다(되돌림은 옛 앱을 다시 켜는 1분 안팎이라 창 안에 끝남).

| 때 | 단계 | 누가 · 무엇으로 |
|---|---|---|
| 사전 | ① legacy(`is_load_test=true`) · 서울 · global apply. **서울 migrate는 아직 안 돌림**(빈 RDS에 시드가 들어가 복원과 겹침) | 사용자 |
| 사전 | ② 1회용 암호 키를 SSM SecureString에 넣음(화면에 안 나오게 만들어 바로 저장) | 사용자(관리자) |
| 사전 | ③ 옛 사이트에 "표지" 손님 가입(한글 이름): 점검 직전 쓰기까지 옮겨졌는지, 한글이 바이트 그대로인지 보는 표 | 스크립트 |
| 사전 | ④ 1초 간격 기록 시작(옛 주소 · 새 주소 상태 코드) | 스크립트 |
| **중단** | ⑤ 옛 앱 멈춤 → 503 점검 페이지(`Retry-After`) | 스크립트 |
| 중단 | ⑥ 옛 DB 컨테이너 안에서 `mysqldump`(utf8mb4, `--single-transaction`, 루틴 · 트리거 · 이벤트 제외) → gzip → openssl 암호화 → SSH로 흘려 운영 PC에서 그대로 S3로(PC 디스크에 파일 없음). 같은 때 옛 DB 체크섬 | 스크립트 |
| 중단 | ⑦ 관리자로 복원 일회성 태스크 실행: 미리 서명한 GET 주소(15분 유효)로 받아 해제 → 압축 풀기 → RDS 관리자 계정으로 복원 → 같은 체크섬 출력 | 스크립트 |
| 중단 | ⑧ 검증: 테이블별 행 수 · 내용 해시가 같고, 표지 손님 이름이 바이트(HEX) 그대로 | 스크립트 |
| 중단 | ⑨ migrate 일회성 태스크: `app` 계정 · 시연 계정(숙소가 있어 시드는 건너뜀) | 스크립트 |
| **끝** | ⑩ 새 주소에서 예약 성공 = 중단 끝. 덤프 · 키 삭제 | 스크립트 |
| 되돌림 | ⑧ · ⑩ 실패 또는 40분 초과: 점검 페이지 내리고 옛 앱 다시 켬(옛 DB는 읽기만 함) | 스크립트 |

- 체크섬: 테이블마다 행 수 + 모든 칸을 이은 문자열의 CRC32를 XOR로 합친 값(행 순서 · 저장 형식과 무관). `CHECKSUM TABLE`은 행 형식이 바뀌면 값도 바뀐다고 문서에 있어([MySQL](https://dev.mysql.com/doc/refman/8.4/en/checksum-table.html)) 서버가 다른 양쪽 비교에는 쓰지 않는다
- 측정: 단계별 시각(스크립트가 남김), **중단 시간 = ⑤ → ⑩**, 덤프 크기, 덤프 · 올리기 · 복원 · migrate 각 시간, 손님이 본 503 수(1초 기록)
- 스모크 점검(Claude, 2026-11-18, 기록용 아님): 옛 환경과 같은 초기화 순서의 로컬 MySQL + 한글 표지 손님 → 같은 덤프 명령 → PC(Git Bash openssl 3.5.7)로 잠금 → `mysql:8.4` 컨테이너(openssl 3.5.8)로 풀어 빈 MySQL에 복원 → 같은 `checksum.sh`. 덤프 2.66MB(압축 · 잠금 후), 덤프 0.7초 · 복원 7초(CPU 제한 없음), **12개 테이블 체크섬 일치, 표지 손님 이름 HEX 일치**, 틀린 키는 `bad decrypt`로 실패. 걸린 것 1개: 윈도 openssl은 `MSYS_NO_PATHCONV=1`일 때 `/c/...` 절대 경로를 못 열어 스크립트는 상대 경로를 씀. AWS 부분(미리 서명 주소 · RDS TLS · Fargate의 Docker Hub 받기)은 이관 날 처음 돈다

### 예측 (실행 전)

| 항목 | 뜻 | Claude 예측 | 사용자 예측 |
|---|---|---|---|
| 덤프 크기 | 압축 · 암호화한 파일 크기 | 처음 10 ~ 20MB → 스모크 뒤 **약 3MB**(같은 데이터 로컬 2.66MB) | |
| 덤프 + 올리기 | ⑥ 시간 | 30초 이내 | |
| 복원 태스크 | ⑦ 시작부터 끝까지(이미지 받기 포함) | 2 ~ 4분 | |
| 중단 시간 | ⑤ → ⑩ | 8 ~ 15분(태스크 2번 시작 대기가 대부분) | |
| 체크섬 | 모든 테이블 일치 여부 | 일치, 한글 그대로 | |

- 만든 것(2026-11-18): 이관 버킷 [bootstrap/migration.tf](../../infra/bootstrap/migration.tf)(공개 차단 · HTTPS만 · 버전 관리 없음 · 1일 뒤 삭제), 복원 태스크 정의 [regional/migration.tf](../../infra/modules/regional/migration.tf)(서울만), 스크립트 [migration/](../../migration/)(`cutover.sh` · 양쪽 공용 `checksum.sh` · 표지 손님 `marker.mjs`), 런북 [5-4](../../infra/README.md#5-4-덤프-이관-3단계-한-번). 키 읽기 권한은 실행 역할에 이미 있음(`/hotel-booking/*`)
- 잠금: AES-256-CBC, 키에서 PBKDF2(10만 번, SHA-256)로 암호 키를 만듦. 1회용 키는 SSM SecureString에만 있고 PC는 run 동안 메모리로만 들고 있음. openssl `enc`는 위조 검출(인증 암호)을 하지 않아, 내용이 바뀌었는지는 gzip 검사와 체크섬 비교로 잡는다

## 2. 1단계와 같은 k6 비교

- 같은 [baseline.js](../../load/baseline.js)(500명씩 3,000명까지, 37분) × 3회, 같은 발생기(t3.medium, legacy VPC)
- 대상만 바뀜: 1단계 `http://<앱 IP>` → 3단계 `https://hotel.vundle34.cloud`(CloudFront → WAF → 통로 → ALB → Fargate 2~4개 → RDS). `/api/*`는 캐시를 끈 경로라(global `cloudfront.tf`) 모든 요청이 서버까지 간다
- 서버 지표는 SSH가 아니라 CloudWatch에서: ECS CPU · 메모리, RDS CPU · 연결 수, 태스크 수 변화 시각, 앱 1초 지표(ADR-061)
- 비교표 각주: 0절 앱 변경 효과
- 실행(11-18 추가): `TARGET=aws bash load/run-baseline.sh`. 대상만 새 주소로 바뀌고(이름 `baseline-aws-*`), 옛 서버 기록 · 정합성 검사는 건너뜀. 발생기 CPU 기록(`load.vmstat`)은 그대로 남겨 발생기가 병목이 아님을 보인다. 발생기 IP는 global `loadtest_ips`로 WAF 한도에서 뺀다(아래 WAF 절, 런북 5-4)
- 서버 지표(11-18 추가): [load/cw-metrics.sh](../../load/cw-metrics.sh)가 회차마다 CloudWatch 1분 지표를 `cw.json`으로 받고, `baseline-report.mjs`가 층마다 붙인다. 태스크 CPU · 메모리(평균 = 서비스 전체 사용량 ÷ 예약량으로 목표 추적이 보는 값, 최대 = 가장 바쁜 태스크 하나, [ECS 문서](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service_utilization.html)), 정상 태스크 수, 앱 5xx, RDS CPU · 연결 수 · 여유 메모리 · CPU 크레딧(t4g는 크레딧을 쓰는 버스트형). ALB 지표 차원을 찾으려고 서울 destroy 전에 관리자로 실행
- 정합성 검사(11-18 추가): RDS가 비공개라 [migration/sql.sh](../../migration/sql.sh)가 서울 안 일회성 태스크(`sql`)로 같은 `check-consistency.sql`을 돌린다. 3절 쿠폰 발급 확인에도 쓴다
- 남은 것: 예측(1단계는 1,000명 뒤 연결 추적 표가 차서 무너짐 → 새 구조에서 먼저 막히는 곳은 태스크 상한 4 × DB 연결 12 = 48인지)

## 3. 쿠폰 오픈 스파이크

"정해진 시각의 쿠폰 오픈에 손님이 몰림"(01 사건)을 새 구조에서 재현해, **예약 스케일링 없이**(이관 전 IDC처럼 미리 못 늘림) / **있게**(오픈 전 최소 4개, [ADR-015](../04-decisions.md#adr-015))를 비교한다. 바탕은 로컬 E-03([기록](E-03.md), [스크립트](https://github.com/yubin05/hotel-booking-app/blob/main/load/e03-coupon-open.js)).

**설계 (2026-11-18 사용자 확정)** · 실행은 [런북 5-5](../../infra/README.md#5-5-쿠폰-오픈-스파이크-3단계): [load/run-coupon.sh](../../load/run-coupon.sh)(회차마다 쿠폰을 SQL로 만들고 발생기에서 [coupon-spike.js](../../load/coupon-spike.js), 끝나면 발급 확인 SQL) → [scripts/coupon-report.mjs](../../scripts/coupon-report.mjs)(회차마다 한 줄)

| 항목 | 안 | 이유 |
|---|---|---|
| 규모 | 1,000명이 한 번씩 누름 · 쿠폰 100장 · 같은 때 일반 조회 초당 100건 | 로컬 E-03과 같아 로컬 → AWS 비교도 됨 |
| 오픈 | 쿠폰 발급 시작을 실제 시각 T로 두고, 손님은 쿠폰 화면을 미리 연 채 T에 누름 | 예약 스케일링이 "시각을 알고 미리 늘리는" 장면 |
| 쿠폰 | 회차마다 새 쿠폰 1개를 SQL로 만듦(`migration/sql.sh`) | 옛 시드 쿠폰 상태와 무관하게 0장 발급에서 시작 |
| 순서 | 없이 3회(회차마다 태스크가 2개로 돌아온 뒤) → 있게 3회(예약 하나: 첫 T 5분 전 ~ 마지막 T + 10분, 최소 4) | 있게 3회를 예약 하나로 묶어 서울 apply 1번 |
| 간격 | 회차 사이 10분 | 1,000명 가입(1 ~ 2분) + 여유 |
| 측정 | 발급 수(초과 0) · 남았는데 거절 0 · 1인 1매(SQL) · 발급 p95(연결 포함) · 100장 소진 시각 · 쏠림 동안 조회 p95 · 태스크 수 변화(CloudWatch) | 03 완료 기준 |

- 목표 추적은 1분 지표가 3번 연속 넘어야 늘어난다(11-16 확인). 그래서 수 초짜리 쏠림 동안에는 반응하지 못할 것으로 본다(예측). "없이"는 IDC와 같은 조건이고, 목표 추적은 쏠림 뒤 몇 분짜리 부하에만 안전망이다
- 스모크(Claude, 11-18, 기록용 아님): 로컬 MySQL + 지금 앱, 30명 · 10장 · 45초 뒤 T. 오픈 예정 확인 → 가입 → T에 누름: 발급 10 · 소진 20 · 예상 밖 0 · 늦은 손님 0, 확인 SQL 10 · 10 · 10 · 10
- 점검표: 1 연결 포함 시간(E-03에서 고친 방식) · 2 아래 예측과 판정(발급 100 · 초과 0 · 예상 밖 0은 실패 조건) · 3 조건마다 3회 · 4 T와 예약 시각을 스크립트 · 변수로 고정 · 5 발생기 1대(IP 1개)와 PC → 발생기 시계(Amazon Time Sync) · 6 분석은 E-03 보고 방식 재사용 · 7 해당 없음 · 8 스모크(몇 명, 10장)

| 예측 | 뜻 | 로컬 E-03 | Claude 예측 | 사용자 예측 |
|---|---|---|---|---|
| 발급 | 정확히 100장, 초과 · 예상 밖 0 | 100 · 0 · 0 | 같음(없이 · 있게 모두) | Claude와 같음 |
| 발급 p95 | 누른 손님 100명 중 95번째가 기다린 시간 | 1.0 ~ 1.2초 | 없이 1 ~ 3초, 있게 0.7 ~ 2초 | Claude와 같음 |
| 100장 소진 | T부터 마지막 발급까지 | 0.8초 | 1 ~ 3초(RDS까지 왕복이 늘어남) | Claude와 같음 |
| 쏠림 동안 조회 p95 | 쿠폰과 무관한 손님이 느낀 지연 | 99 ~ 172ms | 없이 0.3 ~ 1.5초, 있게 0.2 ~ 1초 | Claude와 같음 |
| 태스크 수 | 쏠림 동안 | (로컬 1개) | 없이 2개 그대로, 있게 4개 | Claude와 같음 |

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
- 구현(11-18, [waf.tf](../../infra/global/waf.tf)): 규칙 순서를 **관리형 4개(10 ~ 13) → 발생기 허용(15, 시험 날만) → 요청 수 한도 3개(20 ~ 22)**로 둔다. 허용(Allow)에 걸리면 그 뒤 규칙은 보지 않으므로, 발생기 요청은 관리형 검사를 받고(손님과 같은 WAF 검사 시간) 한도에서만 빠진다. 처음 안(한도 규칙마다 범위 조건 안에 NOT IP set을 겹쳐 넣기)보다 단순하고, 공식 예시가 없던 모양을 쓰지 않는다
- 순서를 바꾼 영향: 관리형 규칙에 막힌 공격 요청은 한도 횟수에 안 들어간다. 어느 쪽이든 막히는 결과는 같다
- 발생기 IP는 global apply 때 `-var loadtest_ips`로 넣고 기본은 빈 목록(IP 세트 · 허용 규칙을 안 만듦). global은 시험 날마다 지우므로 예외가 남지 않는다

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

## 정한 것 (2026-11-18, 사용자)

| # | 결정 | 이유 (자료 / 추론) |
|---|---|---|
| ① 덤프 전달 | **S3 경유 + 일회성 복원 태스크**(`mysql:8.4` 이미지에 curl · mysql 있음, 확인함) | 자료: **AWS가 만든 온프레미스 → RDS 이관 기능(Restore from S3)도 백업을 S3에 올려 복원한다**([RDS 문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MySQL.Procedural.Importing.html), Aurora도 같음) → S3 경유는 AWS가 공식으로 열어 둔 길이다(그 기능은 물리 백업 전용이라 덤프는 우리 태스크가 넣음). VPC 피어링은 VPC끼리만 잇는다([피어링](https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html)) → 실제 IDC에는 못 씀. IDC → AWS 연결은 VPN · 전용선([Site-to-Site VPN](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html))이고, v1이 VPN + DMS였다. AWS도 덤프를 같은 리전의 중간 서버로 옮겨 넣는 절차를 안내한다([RDS 문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-importing-data-reduced-downtime.html)). 추론: 한 번뿐인 작은 덤프라 상시 통로 없이 인터넷(HTTPS)으로 파일만 보낸다. 원본이 진짜 IDC여도 바깥 인터넷 출구만 있으면 같은 절차. 덤프에 개인정보(이메일 · 비밀번호 해시)가 있어 TLS 전송 · 저장 암호화 · 끝나면 삭제 · 업로드 권한은 그 경로 하나만 |
| ② 점검 | **공지된 새벽 점검처럼, 옛 앱 자리에 503 점검 페이지**(`Retry-After`) | 자료: **AWS 이관 가이드는 중단 창을 앱 소유자와 합의하는 것을 정해진 단계로 둔다**([컷오버 단계](https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html)). **실제 예: 인터파크(NOL, 숙박 · 투어 · 티켓 예약) 2026-03-17 03:00 ~ 07:30, 2023-03-23 00:00 ~ 07:00 점검**([점검 페이지](https://avis.interpark.com), [공지](http://m.shop.interpark.com/777.html)). 01 가정 "이관 시 새벽 점검 시간을 쓸 수 있다"와 [ADR-008](../04-decisions.md#adr-008). 계획된 중단에는 오류 · 연결 거부 대신 503 안내 페이지를 권한다([Google](https://developers.google.com/search/docs/crawling-indexing/pause-online-business)). 작은 DB는 오프라인 덤프로 충분하고 중단을 줄여야 하면 DMS · 변경 복제를 쓴다([AWS 패턴](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/migrate-an-on-premises-mysql-database-to-amazon-rds-for-mysql.html)). 국내 새벽 점검 공지 예: [업비트](https://docs.upbit.com/kr/changelog/점검-서버-점검-안내-0524-0200~) · [정부24](https://www.gov.kr/portal/ntcItm/107348). 숙박 플랫폼의 점검 공지는 찾지 못함 |
| ③ 전환 범위 | **새 구조(global 포함)를 미리 올리고**, 중단 시간 = 점검 페이지 켬 → 새 주소에서 예약 성공 | 자료: RDS 문서도 새 DB를 미리 만들어 데이터를 넣은 뒤, 마지막에 쓰기를 멈추고 앱을 옮긴다. 추론: 앱 · 입구도 같은 원리로, 옛 사이트가 평소대로 영업하는 동안 미리 만들어 둔다(손님에게 중단이 아님). 한계: 도메인이 처음부터 새 구조만 가리켜 DNS 전환 · 반영 시간은 재지 않는다 |
| ④ 일정 | **하루에 1 → 4** | 사용자: 빨리 끝낸다. legacy를 한 번만 올림 |
| ⑤ WAF | **요청 제한 규칙 3개만 발생기 IP 예외, 관리형 규칙은 그대로** | 위 WAF 절 |

## 근거 조사 (2026-11-18)

**덤프 하나에 VPN이 필요한가**
- AWS가 만든 온프레미스 → RDS 경로도 S3를 거친다: 백업을 S3에 올려 새 RDS로 복원([RDS Restore from S3](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MySQL.Procedural.Importing.html)), Aurora도 같은 방식([Aurora XtraBackup + S3](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraMySQL.Migrating.ExtMySQL.S3.html))
- 계속 복제하는 DMS도 VPN · 전용선 말고 인터넷 경로(원본 방화벽에 NAT IP만 허용 + TLS)를 지원한다([DMS 네트워크](https://docs.aws.amazon.com/dms/latest/userguide/instance-profiles-network.html), [DMS 보안](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Security.html))
- 국내 기준: 개인정보의 안전성 확보조치 기준 제7조는 인터넷으로 주고받을 때 **암호화**를 요구한다(2차 자료 [itwiki](https://itwiki.kr/w/%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4%EC%9D%98_%EC%95%88%EC%A0%84%EC%84%B1_%ED%99%95%EB%B3%B4%EC%A1%B0%EC%B9%98_%EA%B8%B0%EC%A4%80_%EC%A0%9C7%EC%A1%B0)로 확인, 국가법령정보센터 원문은 미확인). 전송 수단으로 VPN을 지정한다는 내용은 찾지 못했다
- 추론: VPN · 전용선은 이미 있거나, 데이터가 크거나, 계속 복제할 때 쓴다. 덤프 한 번 때문에 새로 깔아야 한다는 자료는 없다 → S3 경유 + 올리기 전 암호화 유지

**새벽 점검을 고객사가 허용하나**
- AWS 이관 가이드는 중단 창(outage window)을 앱 소유자와 합의하고, 넘칠 때 되돌림 계획을 맞추는 것을 정해진 단계로 둔다([컷오버 단계](https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html))
- 국내 예: 인터파크(NOL) 2026-03-17 03:00 ~ 07:30 · 2023-03-23 00:00 ~ 07:00 점검([점검 페이지](https://avis.interpark.com), [공지](http://m.shop.interpark.com/777.html)), 카카오뱅크 2024-05-12 01:00 ~ 08:00 금융거래 중단([기사](https://news.mtn.co.kr/news-detail/2024050709472686874)), 하나은행 2025-09-13 00:00 ~ 08:00([공지](https://www.kebhana.com/cont/news/news01/news0101/1509675_118324.jsp))
- 못 찾은 것: "고객사가 얼마나 자주 허용하는가" 통계, 야놀자 · 여기어때 · 아고다의 점검 공지
