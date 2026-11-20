# 03. 진행 계획

각 단계는 **측정값이 기록돼야 완료**입니다. 결과는 README의 진행 상태 표와 이 문서에 함께 기록합니다.

## 진행 원칙

- 단계마다 작게 만들고 끝까지 검증한 뒤 다음으로 넘어갑니다.
- 범위는 예약 API까지로 고정합니다. 새 기능 아이디어는 v2가 끝난 뒤의 후보로만 적어 둡니다.
- 쿠버네티스(EKS)와 Prometheus·Grafana는 v2가 끝난 뒤 같은 컨테이너 이미지로 별도 실습합니다.
- 코드→빌드→배포 경로를 처음부터 연결하고(walking skeleton), 단계마다 살을 붙입니다.

## 0단계: 앱과 로컬 실행

| 할 일 | 완료 기준 |
|---|---|
| 모듈러 모놀리스(인증·호텔·예약)와 MySQL 스키마 | 예약 생성·변경·취소·조회 동작 |
| [데이터 모델 원칙](02-architecture.md#데이터-모델-원칙) 적용 | 같은 객실·날짜에 동시 예약 N건 → 1건만 성공 |
| 멱등키 처리 | 같은 `Idempotency-Key`로 재요청 → 1건만 생성 |
| 쿠폰(선착순 발급, 예약 적용, 취소 시 반환)과 리뷰(이용 후 1회, 평점 집계) | 30명이 수량 10장 쿠폰을 동시에 받으면 정확히 10장. 같은 숙소 동시 리뷰 5개가 모두 저장되고 평점 일치 |
| docker compose(앱 + MySQL) | 명령 한 번으로 로컬 실행 |
| GitHub Actions CI (PR마다 테스트·이미지 빌드) | CI 통과 |
| v1·v2 월 비용 추정 (AWS 요금 계산기) | 비교표 작성 |
| 로컬 실험 결과 정리 (E-01~E-06이 모두 끝난 뒤) | 07 문서와 포트폴리오 한 페이지에 이어 붙이던 결과를 실험별로 나눠, 한눈에 보이는 요약과 같은 틀로 다시 정리. 그래프 구조도 다시 보고, E-02는 "하룻밤에 예약 1건"이 보이게 밤별 표(원한 사람 수 / 잡힌 예약)로 바꾸고 예약한 때(11/4)와 묵는 밤(1월)을 구분해 설명 |

## 1단계: 이전 환경 재현과 부하 기준선

| 할 일 | 완료 기준 |
|---|---|
| AWS Budgets 알림 (월 $50, 실제 50·80·100% + 예측 100%) | 알림 설정 확인 |
| v1 이력의 `3tier-seoul.yml`(EC2 7대, 단일 AZ)을 v2 앱 기준으로 축소: 웹+앱 EC2 1대, MySQL EC2 1대, NAT 인스턴스 1대([ADR-016](07-experiments.md#adr-016)) → `infra/legacy/` | 이전 환경에서 앱 동작 |
| k6 시나리오 작성 (조회 위주 + 일부 예약) | 부하를 단계적으로 올려 에러율 1% 또는 p95 1초를 처음 넘는 지점의 처리량과 p95 응답 시간 기록 ([기준선](experiments/baseline.md)) |

## 1.5단계: DB 병목 분석과 개선 (로컬, [ADR-024]((#adr-024)))

| 할 일 | 완료 기준 |
|---|---|
| 로컬에서 1단계 모양 재현 (DB 컨테이너 CPU 제한 + seed-volume) | 500명 근처에서 DB 포화, 그 위에서 1단계와 같은 무너짐 |
| 원인 찾기: DB 시간을 많이 쓰는 조회, 무너질 때 DB · 앱 상태, 실패로 받았는데 저장된 예약 | 원인마다 근거(조회별 DB 시간, 처리 목록 등) 기록 |
| 앱 개선 (비싼 조회, 무너지는 방식, 시간 초과된 예약) | 수정 전 실패 → 수정 후 통과하는 테스트, 로컬 전 · 후 비교 |
| 옛날 구조에서 고친 앱으로 재측정 (AWS 1회) | "같은 구조, 앱만 고쳐서 N명" 기록 |

## 2단계: AWS 목표 인프라와 CD

| 할 일 | 완료 기준 |
|---|---|
| `infra/bootstrap` (state 버킷, GitHub OIDC 역할, Budgets 알림) | 1회 적용 |
| `infra/modules/regional` + `infra/seoul`, `infra/global` ([ADR-011](04-decisions.md#adr-011)) | [아키텍처](02-architecture.md) 구성 적용 |
| 도쿄 VPC Origin 전환 PoC ([ADR-035](04-decisions.md#adr-035)), global(서울) 바로 다음 · 사진보다 먼저 | 원본을 도쿄로 바꿨다가 서울로 되돌리기, 걸린 시간 기록. 실패하면 앱 앞 구성을 다시 고름(ADR-035 재검토). 방법(2026-11-15 결정): global의 `origin_region`만 바꿔 apply(새 통로 · 새 입구 → 원본 교체 → 옛 것 삭제), 도쿄는 화면 · `/api/health`만 확인(DB 복원은 5단계), 전환 apply 시간과 1초 간격 요청으로 손님이 본 끊김 측정. 2회(왕복)라 정식 시간은 5단계 드릴에서 3회 이상 |
| 숙소 사진 `img.hotel.vundle34.cloud` ([ADR-035](04-decisions.md#adr-035) · [055](04-decisions.md#adr-055)) | HTTPS · 캐시 Hit, 서울 S3를 막으면 도쿄 S3에서 나옴(원본 장애 조치), 서울 → 도쿄 복제 지연 기록, 브라우저가 칸에 맞는 크기(640 · 1200)를 받음. **2026-11-16 완료**(결과 표 2-3 사진 ① ~ ③ · 원본 장애 조치) |
| CD 워크플로 (ECR 푸시, 스키마 변경, ECS 배포) | main 병합 → 자동 배포 성공, 커밋부터 반영까지 시간 기록 |
| 재현성 확인 | `destroy` 후 다시 `apply`해서 같은 상태로 복구. 방법(2026-11-16 결정): 사진까지 넣고 처음부터 전체를 올리는 날(seoul → global → CD) 아래 5가지를 확인해 기록. ① apply 개수가 런북과 같음(서울 43, global 7 + 사진으로 늘어난 수) ② 다 올린 뒤 다시 `plan` = No changes ③ 사이트 · `/api/health/deep` 정상 ④ 시드 행 수(숙소 1,010 · 객실 5,030 · 회원 20,003 · 예약 100,013 · 리뷰 50,013) ⑤ 사진 표시 · 캐시 Hit. 그전 apply · destroy(서울 4회 · 도쿄 1회)는 "같은 상태" 기준 없이 해서 갈음하지 않음. **2026-11-16 완료**(결과 표 2-3 전체 올리기) |
| ECS 예약 스케일링 (이벤트 전 최소 태스크 수 상향) | 지정 시각에 태스크 수가 바뀌는지 확인. **2026-11-16 완료**(결과 표 2-3 오토스케일링, 목표 추적도 같이 만듦) |
| 단계 마무리: README · 포트폴리오 대문 갱신 (2026-11-16 결정, **이후 단계마다 반복**) | "왜 단계를 나눠 진행했나"(1단계 DB 병목 → 로컬 $0에서 앱 수정(ADR-024) → 같은 k6로 앱 효과 · 인프라 효과 분리) · 비용을 아낀 결정 표(결정 · 아낀 돈이나 이유 · ADR) · 단계 그림(`stages.svg`, 1.5단계 추가 · 실측 금액)을 그 단계 숫자로 갱신. 남은 손질(2단계 "$42", "검증 기록" 문구)도 함께 |
| 계정 기본 보안: CloudTrail 기록 보관, GuardDuty, Security Hub ([ADR-056]((#adr-056))) | 켠 날짜 기록, Security Hub 점검 결과와 고친 항목 목록, 30일 무료 체험이 끝나기 전에 끄거나 비용 기록. 방법(2026-11-17 결정, [ADR-057](04-decisions.md#adr-057)): `infra/security`. CloudTrail(90일) · GuardDuty(서울 · 도쿄 · us-east-1) 상시, 점검(Config + Security Hub CSPM, 서울 + us-east-1)은 인프라 올리기 전에 켜서 하루치 구성 항목 수를 구간별로 재고 다음 날 아침 끔. 보안 4종 합계가 월 $8 이하면 상시 |
| CD 보안 검사: npm 의존성, ECR 이미지 스캔, Terraform 정적 검사 | CD에서 검사가 돌고 결과가 남음. 일정이 밀리면 가장 먼저 뺌 |

## 3단계 전: 결제 · 알림 앱 기능 (2026-11-18 결정)

기능 개발은 3단계에 들어가기 전에 끝낸다. 인프라 없이 로컬 테스트로 만든다. 설계는 [앱 결정 기록](https://github.com/yubin05/hotel-booking-app/blob/main/docs/decisions.md)(APP-001 ~ 003).

| 할 일 | 완료 기준 |
|---|---|
| 토스페이먼츠 데모 결제(예약 먼저 + 10분 결제 대기) · 예약 확정 메일(SES) · 카카오톡 "나에게 보내기" | 앱 테스트 통과(**2026-11-18 완료**). 키를 넣고 로컬에서 실제 결제 · 발송 확인 |
| 배포 환경 연결 | SES 도메인 인증(DKIM, Route 53) · 앱 태스크 역할(`ses:SendEmail`) · 앱 태스크에 키(SSM) · `MAIL_FROM` · `APP_URL`. 키를 넣기 전에는 결제 · 메일이 꺼진 채 지금처럼 동작 |

- 3단계 부하 비교는 결제 · 알림이 꺼진 상태(1단계와 같은 동작)로 잰다. 켠 상태는 따로 잰다.

## 3단계: 덤프 이관과 비교

| 할 일 | 완료 기준 |
|---|---|
| 로컬 앱 변경 효과(2026-11-18 결정): 기능을 더하기 전 커밋(`02096dc`)과 지금 앱을 1.5단계 로컬 환경에서 같은 k6로 각 3회. 새 기능이 k6 경로에 더한 것은 로그인 보안 로그 · 예약 뒤 알림 조회 · 내 예약 목록의 결제 LEFT JOIN · 1분마다 결제 만료 정리 → [설계 · 기록](experiments/app-change.md) | 차이를 재서 3단계 비교표에 각주. 3단계 비교가 인프라 효과만 되게 |
| 점검 모드 → `mysqldump` → RDS 복원 → 건수·체크섬 검증 → 트래픽 전환 (덤프·복원 모두 `--default-character-set=utf8mb4` 명시, 0단계 한글 깨짐 사례 참고) | 이관 중단 시간 실측, 데이터 일치, 한글 데이터 확인 |
| 1단계와 같은 k6 부하를 목표 구조에 적용 | 이전/이후 비교표 (처리량, 에러율, p95), 오토스케일링 동작 확인 |
| 쿠폰 오픈 시각 k6 스파이크 테스트 (예약 스케일링 없이 / 있게) | 초과 발급 0건, 남은 수량 거절 0건, 오픈 순간 p95 응답 시간 비교, 쿠폰 행의 처리량 상한 |
| 실측 기반 라이트사이징(2026-11-18 결정): 위 부하 시험의 태스크 CPU · 메모리로 태스크 한 개의 크기를 정함(개수를 바꾸는 오토스케일링과 별개) | 크기 확정, 바꾼 크기로 같은 k6에서 p95 · 에러 유지 확인, 월 비용 차이 |

- 실행 계획(순서 · 정할 것 · 점검표): [3단계 실행 계획](experiments/migration.md)
- 사고 시나리오는 "정해진 시각의 쿠폰 오픈에 손님이 몰림"으로 통일한다(2026-11-18, ADR-059 서론과 같게). 01 시나리오 · README · 포트폴리오에 남은 "유튜버 영상"을 고쳤다(2026-11-18, 01의 평소 동시 접속 500명 근거에서 유튜버 수치를 빼도 계산이 그대로 맞음. v1 팀 페이지는 팀이 처음 가정한 시나리오라 그대로 둠). 쿠폰 스파이크의 "예약 스케일링 없이"는 이관 전 IDC(늘릴 수 없음) 재현이자, 예상보다 많이 몰리거나 예약을 깜빡했을 때 목표 추적이 안전망인지 보는 시험.
- 시험 화면을 다른 사람에게 실시간으로 보여 줄 때 CloudWatch 대시보드 공유는 쓰지 않는다: 링크를 받은 사람이 계정의 모든 CloudWatch 지표를 조회할 수 있다([공유 문서](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch-dashboard-sharing.html)). 직접 화면 · 녹화 · 정적 보고 페이지로.

## 4단계: 장애 테스트

로컬 예행연습: [07 로컬 장애·부하 실험](07-experiments.md)

장애 실험은 모두 여기서 합니다(3.5단계에서 되돌림, [ADR-059]((#adr-059))). ECS 태스크 강제 종료 · RDS 강제 장애 조치 · 깨진 버전 배포를 먼저 각 3회 하고(감지까지 시간, 복구까지 시간, 손님이 본 오류 수), 마감 2026-11-30([ADR-063](#adr-063), 처음 이관 마감은 11-27)에 밀리면 AZ 하나 장애 · 오토스케일링 상한은 하지 않은 것으로 남깁니다.

- 2026-11-19 범위 변경(사용자): **AZ 하나 장애도 한다.** "리전 장애까지 시험하면서 AZ 장애를 빼면 맞지 않다"는 판단, 도쿄 한 AZ 장애 사례(2019-08-23)와 AWS의 AZ 우선 지침을 근거로. **오토스케일링 상한은 따로 돌리지 않고** 3단계 k6(3,000명까지, 최대 4)에서 상한에 닿은 뒤 구간을 분석한다. 실행 계획 · 예측: [4단계 장애 테스트](experiments/faults.md), 스크립트 `drill/fault.sh`, 런북 5-7

| 시나리오 | 측정 |
|---|---|
| ECS 태스크 강제 종료 | 대체 태스크 기동 시간, 사용자 에러 수 |
| RDS 강제 장애 조치 (Multi-AZ) | 쓰기 불가 구간 |
| AZ 하나 장애 가정 (NAT 2개 · Multi-AZ를 켜고 한 AZ의 서브넷을 차단) | 다른 AZ에서 대체 태스크가 뜨는 시간, 사용자 에러 수, 잠정 목표 10분([ADR-036](04-decisions.md#adr-036)) |
| 일부러 깨진 버전 배포 | circuit breaker 자동 롤백까지 시간 |
| 오토스케일링 상한 도달 | 상한 이후 동작(거절·지연)과 비용이 상한 안에 머무는지 |

## 5단계: 리전 복원 드릴과 Failback

| 할 일 | 완료 기준 |
|---|---|
| [리전 장애 복구 흐름](02-architecture.md#8-리전-장애-복구-흐름-backup--restore) 수행, 드릴 스크립트화 | 단계별 시간이 포함된 실측 RTO |
| 드릴 중 순번 예약을 계속 생성 | 실측 RPO |
| 서울로 Failback 후 대조 | 데이터 대조 결과 |
| 드릴 3회 | 잠정 목표([ADR-036](04-decisions.md#adr-036): 리전 RTO 1시간)와 비교해 확정, 넘으면 Pilot Light 검토 |

- 2026-11-19: 백업 복제 · 도쿄 복원 · 되돌리기 방식 결정([ADR-062](04-decisions.md#adr-062)), 드릴 스크립트 `drill/region.sh`(전환 → 되돌리기를 한 번에, 단계 시각 · 사람 확인 시간 · 대조 · 체크섬). 순번 쓰기는 예약 API(재전송 키 `drill-<run>-<순번>`)로: 가입은 로그인 쪽 WAF 한도(IP당 5분 100건)에 걸려서. 실행 계획 · 예측: [5단계 리전 복원 드릴](experiments/region-drill.md), 런북 5-8

**마무리**
- DORA 지표 정리: 배포 빈도, 변경 리드타임, 변경 실패율, 복구 시간
- 실제 청구 금액과 v1·v2 비용 비교
- v1/v2 비교 문서 완성
- README · 포트폴리오 대문을 "① 이관 / ② 보안 운영"으로 정리: 옛 3.5단계 "다음 단계 계획" 절(README, 포트폴리오 v2 페이지) 교체, 단계 그림(stages.svg) 다시 만들어 복사 ([ADR-059]((#adr-059)))

## 6단계: 보안 운영 (공격 재현 · 자동 대응 · 보고, 옛 3.5단계, [ADR-056]((#adr-056)) · [ADR-059]((#adr-059)))

5단계까지 이관을 마친 뒤, 고객사가 맡긴 보안 운영으로 합니다. 공격을 경보 · 이벤트 → Lambda 판단 → 조치 → 사건 보고서 흐름으로 처리하고, 감지 · 차단 시간을 잽니다. 장애 실험 3종은 4단계로 되돌렸습니다.

| 할 일 | 완료 기준 |
|---|---|
| 대응 흐름 | 아래 공격 3종이 같은 흐름으로 감지되고 기록됨 |
| 공격 재현 3종, 실제 사례([ADR-058]((#adr-058))): ① 회원 계정 탈취 → 적립금 도용(메리어트형, IP 하나 · 여러 개 로그인 대입 포함) ② 호스트 계정 탈취 → 손님 정보 조회(Booking.com형) ③ 쿠폰 오픈 봇. 앱에 적립금 · 호스트 화면 · 관리자 사건 복구 · 탐지용 로그 추가(토큰 무효화는 보안 강화 단계, [ADR-060]((#adr-060))) | 공격 시작부터 탐지 · IP 차단까지 시간(WAF 한도만일 때 약 41초와 비교), 여러 IP 공격은 계정 단위로 못 막는다는 것을 확인해 보고서 권고로, 정상 손님 오차단 0건, 각 3회. IP 차단은 1시간 뒤 자동 해제 |
| 보안 강화 (시간이 남으면, [ADR-060]((#adr-060))) | 보고서 권고(세션 끊기 · 잠금 · 다른 경로 알림 · MFA)를 넣고 같은 공격을 다시 해 차단까지 시간 전 · 후 비교 |
| 임계값 | 정상 k6 시나리오의 평소 최댓값 × 배수로 정하고 근거 기록 |
| 사건 보고서 (AI, Bedrock) | 규칙이 판정 · 조치하고 AI(Bedrock Claude Sonnet 5, 서울 안에서 호출)는 고객 보고용 초안만 씀. AI가 실패해도 차단 동작 |
| 통합 대시보드 (CloudWatch, Terraform) | 경보 상태 · 서비스 · 보안 · 대응 기록이 한 화면. WAF 지표 · 경보는 us-east-1 |

**통합 대시보드 구성** (6단계를 시작할 때 확정)

| 줄 | 원천 (리전) | 보이는 것 |
|---|---|---|
| 1. 경보 상태 | CloudWatch 경보 (서울 · us-east-1) | 지금 울린 경보: 오류 급증, DB CPU, WAF 차단 급증 |
| 2. 서비스 | ALB (서울) | 요청 수, 5xx, 응답 시간 p95, 정상 대상 수(살아 있는 태스크 수로 사용) |
| | ECS (서울) | 서비스 CPU · 메모리 |
| | RDS (서울) | CPU, DB 연결 수 |
| | CloudFront (us-east-1) | 요청 수, 오류율. 캐시 적중률은 추가 지표(유료)라 사진 확인할 때만 켬 |
| 3. 보안 | WAF (us-east-1) | 규칙별 허용 · 차단 수 |
| | 앱 로그 (서울, Logs Insights) | 로그인 실패를 IP별 · 계정별로 센 표 |
| | 대응 Lambda가 남기는 사용자 지표 | 자동 차단된 IP 수, 공격 시작부터 차단까지 시간 |
| 4. 대응 기록 | 대응 Lambda 로그 (서울, Logs Insights) | 최근 자동 조치 목록, AI 사건 보고서 요약 |

- 대시보드 밖: GuardDuty · Security Hub 결과는 각 콘솔에서 본다(필요하면 EventBridge로 로그에 남겨 4번 줄에 띄움). CloudTrail은 사건을 조사할 때 찾아보는 기록이라 넣지 않는다.
- ECS 태스크 수가 기본 지표에 있는지는 공식 문서가 엇갈려 계정에서 확인한다. 없으면 ALB 정상 대상 수로 대신한다([ECS 지표](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/available_cloudwatch_metrics.html), [Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-metrics-ECS.html)).
- 로그 표(Logs Insights)는 조회한 데이터 양만큼 요금이 붙고, 대시보드는 사용자 정의 3개 · 지표 50개 이하가 무료다([CloudWatch 요금](https://aws.amazon.com/cloudwatch/pricing/)).

일정이 밀리면 CD 보안 검사(2단계) → Failback 대조(5단계) → 공격 ③ 쿠폰 봇 → 고객사 보고 페이지(영상으로 대신) 순으로 뺍니다. AI 사건 보고서는 캡스톤 과정 이름(보안 Agent)과 맞닿아 빼지 않습니다.

## 비용 운영

- 테스트할 때만 `apply`하고 끝나면 `destroy`합니다.
- RDS Multi-AZ와 도쿄 리소스는 해당 테스트를 할 때만 켭니다.
- AWS Budgets 알림(월 $50)은 1단계 시작 전에 먼저 설정하고, 2단계 bootstrap에서 코드로 옮깁니다([09 비용 추정](09-cost-estimate.md)).
- 단계별 실제 비용을 기록합니다.

## v2 이후 후보

v2 범위에는 넣지 않고, 끝난 뒤 이어서 할 수 있는 것만 적습니다.

| 후보 | 내용 | 적은 날 |
|---|---|---|
| 보안 확장 | [10 보안 점검](10-security.md) 6절의 앱 · WAF 후보(토큰 저장 방식, CSP, Bot Control 등). 로그인 실패 제한은 [ADR-054](04-decisions.md#adr-054)로, 로그인 공격 자동 대응은 6단계(옛 3.5단계)로 옮김 | 2026-11-15 |

## 구현 전에 확인할 것

공식 문서나 작은 PoC로 확인합니다. 결과에 따라 설계를 고칩니다.

| 항목 | 이유 | 안 될 때 대안 |
|---|---|---|
| ~~RDS 자동 백업 리전 간 복제: MySQL 8.4·작은 인스턴스·서울→도쿄 지원 여부, 비용, 복제 지연~~ → 2026-11-13 확인: RDS for MySQL 모든 현재 버전 지원, Multi-AZ DB 인스턴스 지원(클러스터는 미지원), 서울 → 도쿄 지원 짝, 비용은 복사 전송 + 도쿄 저장([문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReplicateBackups.html)). 복제 지연은 5단계 드릴에서 RPO로 잰다 | 리전 장애 대비의 핵심 | AWS Backup 리전 간 복사 (RPO 증가) |
| ~~CloudFront VPC Origin: 전제 조건, 다른 리전 원본으로 전환, 반영 시간~~ → 인터넷 게이트웨이 필요(2026-11-13 문서). 2026-11-15 PoC로 확인: 서울 ↔ 도쿄 VPC Origin 전환 가능, 손님 오류 0. 통로를 리전 루트로 옮긴 최종 구조에서 손님이 넘어가기까지 약 1분 이하(결과 표 2-3, [ADR-035](04-decisions.md#adr-035)) | 진입점과 리전 전환 방식의 핵심 | Public ALB + 비밀 헤더 |
| RDS for MySQL 버전 지원 일정 (8.0, 8.4) | 버전 선택 | - |
| 서울 리전 가격 (NAT, ALB, Fargate, RDS, WAF, 공인 IPv4) | 비용 추정 | - |
| ECR 리전 간 복제와 기본 스캔 비용 | 도쿄에서 기동, 이미지 보안 | 도쿄 ECR에 직접 푸시 |
| Terraform S3 네이티브 잠금(`use_lockfile`) 지원 버전 | state 잠금 | DynamoDB 잠금 |
| GitHub Actions OIDC 신뢰 조건 | 권한을 저장소·브랜치로 제한 | - |
| ~~ECS 예약 스케일링(Application Auto Scaling 예약 작업) 설정과 반영 시각~~ → 2026-11-16 확인: `Asia/Seoul` 시간대로 설정됨, 예약 실행이 23 ~ 38초 늦고 새 태스크 준비까지 예약 시각부터 약 1분 반 | 쿠폰 이벤트 대응 | 이벤트 전에 최소 태스크 수를 수동으로 변경 |
| DORA 최신 지표 용어 | 문서 표기 | - |

## 진행 · 범위 결정

단계 순서 · 범위 · 저장소 · 포트폴리오에 관한 결정. 번호는 [04 설계 결정](04-decisions.md)과 같은 일련번호.

<a name="adr-024"></a>
### ADR-024 2단계 전에 DB 병목을 로컬에서 분석·개선한다 (1단계 기록은 그대로)

- **상황:** [1단계 기준선](experiments/baseline.md)에서 옛날 구조는 동시 접속 500명에서 DB CPU 91~93%로 먼저 한계였고(앱 18~21%), 1,000명부터는 DB · 앱이 한가한데 실패가 97~99%였으며, 실패로 받았는데 저장된 예약이 1건 있었다. 3단계 목표 구조의 ECS 오토스케일링은 앱 수만 늘리고, RDS for MySQL은 인스턴스 크기와 읽기 전용 복제본 수를 자동으로 바꾸지 않는다([인스턴스 수정](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ModifyInstance.Settings.html), [자동 확장은 저장 공간만](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.Autoscaling.html)).
- **검토한 대안:**
  - 그대로 2단계로: 같은 앱이라 RDS에서도 같은 병목과 무너지는 방식이 옮겨 가고, 3단계 비교에서 원인을 설명할 수 없다.
  - 1단계 이전 환경을 고쳐 다시 재기: "IDC 그대로"인 기준선이 사라진다.
  - RDS를 크게 잡아 해결: 원인이 비싼 조회라면 비용으로 덮는 것이고, 무너지는 방식(시간 초과 처리)은 그대로다.
- **결정:** 2단계 전에 로컬에서(DB 컨테이너 CPU 제한 + seed-volume) 1단계의 모양을 재현해 원인을 찾고 앱을 고친다. 1단계 기록(옛 앱 + 옛 구조 = 500명)은 지우지 않는다. 고친 앱으로 같은 옛날 구조에서 한 번 더 재서 "앱 개선 효과"를 따로 남기고, 3단계는 고친 앱으로 비교해 "인프라 효과"만 남긴다.
- **근거:** 한 번에 하나씩 바꿔야 무엇 덕분에 좋아졌는지 나눠 설명할 수 있다. 로컬은 비용이 없다.
- **결과:** 03 진행 계획에 1.5단계가 생긴다. 로컬 PC는 t3.micro와 CPU가 달라 숫자가 아니라 모양(DB 포화, 무너지는 방식)을 재현한다. 옛날 구조 재측정에 AWS 1회(약 $0.3)가 든다.

<a name="adr-043"></a>
### ADR-043 앱 · 이전 환경은 고객사 저장소(hotel-booking-app, Public)로 분리, 이 저장소는 To-Be 인프라와 이관 전후 부하 시험

- **상황:** 시나리오는 고객사 개발팀이 GitHub으로 앱을 운영하고, 우리(인프라팀)가 AWS로 이관하는 것이다. 그런데 앱 코드, CI/CD, 고객사가 운영하던 이전 환경(legacy)이 모두 이 저장소에 있어 시나리오와 맞지 않았다(2026-11-13).
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 한 저장소 유지 (monorepo) | 시나리오와 다르다. OIDC `sub`가 저장소 · 브랜치 단위라 "배포 실행은 고객사, 배포 권한은 우리"를 권한으로 나눌 수 없다 |
  | 앱 저장소 비공개 | 앱 코드는 이미 이 공개 저장소의 기록에 있어 숨겨지지 않는다(지우려면 기록을 다시 쓰고 force push). 인프라 작업인 CD 워크플로가 면접관에게 보이지 않는다. 개인 Free 계정의 비공개 저장소는 비밀 스캔이 없다. Actions 한도(월 $12, Linux 2코어 약 2,000분)는 실측 약 600분/월이라 문제는 아니었다 |
  | CD를 이 저장소에 | 배포 신호(main 머지)와 재료(이미지)가 앱 저장소에 있다. 이 저장소가 받으려면 고객사 저장소에 신호용 토큰을 비밀값으로 둬야 한다 |
  | legacy를 이 저장소에 유지 | legacy는 "고객사가 이미 운영하던 환경"이라는 가정과 맞지 않는다 |
  | legacy를 별도 고객사 저장소로 | 개발팀과 운영팀이 나뉜 고객사라면 더 사실적이지만 저장소가 3개가 된다 |

- **결정:**
  - 앱은 [yubin05/hotel-booking-app](https://github.com/yubin05/hotel-booking-app)(Public)으로 분리한다. 고객사 앱 저장소 역할이고, 그 README에 "평가 대상은 인프라 저장소"라고 적는다.
  - CI와 CD는 앱 저장소에서 돈다. CD 워크플로는 인프라팀이 작성해 고객사 저장소에 제공하는 형태다. 배포 역할 · 권한 · 신뢰 조건은 이 저장소(bootstrap)가 관리한다. 고객사에 넘기는 값은 역할 ARN · 리전 · ECR 이름 같은 식별자뿐이고, AWS 키는 넘기지 않는다.
  - 배포 역할의 `sub`는 앱 저장소 main 하나: `repo:yubin05@87186282/hotel-booking-app@1456714451:ref:refs/heads/main`.
  - 고객사가 운영하던 이전 환경(legacy)과 0단계 앱 실험(E-01~E-06, `run-k6.sh`, 보고서, 정합성 검사 · 데이터 채우기 SQL)은 고객사 쪽(앱 저장소 `legacy/` · `load/` · `scripts/`)으로 옮긴다(④-b). 앱 로직이 맞는지(중복 예약, 쿠폰 초과)는 개발팀 몫이다.
  - 이관 전후 부하 비교는 이관 수행사인 우리 몫이다. 1단계 기준선 도구(`baseline.js`, `run-baseline.sh`, 서버 상태 기록 스크립트, 기준선 보고서)는 이 저장소 `load/`에 남기고, 3단계 이관 후에도 같은 `baseline.js`로 잰다.
  - 예외: 부하 발생기 Terraform은 이전 환경의 서브넷 · 키 페어를 같이 써서 고객사 legacy 루트에 그대로 둔다. "우리 측정 장비를 고객사 환경 안에 띄운 것"으로 본다. 따로 떼면 이 저장소가 다른 저장소의 서브넷에 기대게 되어 legacy를 바꿀 때 깨질 수 있다.
  - legacy 작업용 IAM 정책은 고객사 저장소의 별도 루트 `legacy/iam`(관리자만 apply, state는 S3 `legacy-iam/terraform.tfstate`)으로 옮긴다. legacy 루트 안에 두면 매일 apply하는 평소 사용자에게 IAM 쓰기 권한이 필요해 자기 권한을 스스로 늘릴 수 있다. 정책이 아무 데도 붙어 있지 않아, 관리 주체를 옮기는 `removed` · `import` 대신 bootstrap에서 지우고 같은 이름으로 다시 만든다.
  - `k6-lib.mjs`와 `check-consistency.sql`은 0단계 보고서와 기준선 시험이 함께 써서 양쪽에 같은 파일을 두고 출처를 적는다.
  - 이 저장소에는 To-Be(v2) 인프라, 이관 전후 부하 시험, 문서만 남는다.
- **근거:** 실제 이관 프로젝트에서 앱 저장소는 고객사에 이미 있고, 인프라팀은 인프라 저장소를 새로 만든다. [ADR-039](04-decisions.md#adr-039)에서 "태스크 정의 설정은 Terraform, 이미지는 CD"로 나눠 두어 경계가 이미 있었다. 코드를 공개해도 RDS는 `publicly_accessible = false`이고 프라이빗 서브넷에 있으며 비밀번호는 Secrets Manager가 관리해 보안이 약해지지 않는다. 공개 저장소는 Actions 표준 러너가 무료이고 비밀 스캔이 자동으로 돈다([Actions 요금](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [비밀 스캔](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning)).
- **결과:**
  - 바꾸는 순서는 "두 저장소 같이 허용 → 새 저장소에서 확인 → 옛 것 제거"(병행 후 전환)로, 배포 수단이 비는 때가 없게 했다.
  - ① 2026-11-13: `git subtree split`으로 `app/` 히스토리 26개를 옮기고, 워크플로와 compose를 저장소 루트 기준으로 바꿨다. `.gitattributes`가 없어 `db/test-db.sh`가 CRLF로 받아진 것을 같은 LF 규칙을 넣어 고쳤다. ② 저장소를 만들고 첫 CI가 성공했다(23:42).
  - ③ 2026-11-14: `sub`를 두 저장소 목록으로 바꿔 apply(state 저장 00:00:49). 앱 저장소의 OIDC check가 성공했다(00:01:19). Arn은 역할 이름 · 세션 이름이라 그대로였다.
  - ④-a 2026-11-14: 이 저장소에서 `app/`, compose, 워크플로 3개를 지우고 `sub`에서 이 저장소를 뺐다(apply는 [03-plan](03-plan.md)). 앱 코드를 가리키던 문서 링크 24개는 지우기 직전 커밋 `d04aad9`의 고정 링크로 바꿨다. 실험 당시의 코드를 가리켜야 하고, 분리하면서 앱 저장소의 커밋 해시가 달라졌기 때문이다. 앱 저장소의 OIDC check 워크플로는 확인이 끝나 지웠다.
  - ④-b 2026-11-14: bootstrap에서 legacy 정책을 빼는 변경을 ④-a와 한 번에 apply했다(0 · 1 · 1, state 저장 00:47:00). `infra/legacy` · `load` · `scripts`를 `git subtree split`과 `subtree add`로 히스토리째 고객사 저장소에 넣고, 양쪽에서 상대편 몫의 파일을 지웠다. `run-baseline.sh`는 이 저장소 `load/`로 옮기고 서버 IP를 고객사 저장소 legacy state에서 읽게 했다(`terraform -chdir`, 기본 `../../hotel-booking-app/legacy`, 다르면 `LEGACY_DIR`). PC에만 있던 legacy state(리소스 0개) · 변수 파일은 새 위치로 복사해 내용이 같은지 확인한 뒤 옛 폴더를 지웠다. 지운 파일을 가리키던 문서 링크 15개는 직전 커밋 `39d0819`의 고정 링크로 바꿨다. 고객사 저장소 CI는 `legacy/` · `load/` · `scripts/` · 문서만 바뀌면 건너뛴다.
  - 권한 확인 2026-11-14: 평소 사용자(그룹에 `operator-v2`만 붙은 상태)를 IAM 정책 시뮬레이터(`aws iam simulate-principal-policy`, 관리자 역할로 실행)로 점검했다. IAM 쓰기 4개(`CreatePolicyVersion` · `AttachGroupPolicy` · `PutUserPolicy` · `CreateRole`) `implicitDeny`, PassRole은 ECS 실행 역할(`ecs-tasks.amazonaws.com`에 넘길 때) `allowed` · `Administrator-Role` `implicitDeny`, state 읽기는 `seoul` `allowed` · `legacy-iam` `implicitDeny`. 허용은 모두 `operator-v2`에서 나왔고, 정책에 Deny 문장이 없어 거부는 모두 "허용 문장 없음"이다. 대상 ARN을 여러 개 넣으면 대상별 결과는 `ResourceSpecificResults`에 있다.

<details>
<summary>확인한 근거와 메모</summary>

- 계정 ID는 비밀로 보지 않는다(*"not considered secret, sensitive, or confidential information"*, [계정 식별자](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-identifiers.html)). 역할 ARN도 신뢰 조건이 지킨다.
- 공개 저장소의 표준 러너는 무료, 비공개 저장소는 Free 계정에 월 $12어치가 포함되고, 결제 수단이 없으면 넘을 때 과금되지 않고 막힌다(*"usage is blocked once you use up your quota"*). 2,000분은 문서의 Linux 2코어 단가 $0.006/분으로 계산한 값.
- 실측(11-03 ~ 11-13): Actions 97회, CI 평균 1.2분, 합계 약 188분.

</details>

<a name="adr-056"></a>
### ADR-056 3단계 다음에 운영 사건 대응 자동화(장애 · 보안)를 3.5단계로 넣고, 4단계의 짧은 장애 실험 3개를 앞당긴다

- **상황:** 2026-11-17부터 약 10일 동안 집중 작업 기간(SKT ALEPH 캡스톤)이 있다. 2단계 남은 일과 3단계에 더해 무엇을 할지 정해야 했다. 보안 쪽에 남은 틈은 세 가지다. WAF 로그인 한도는 약 41초 늦게 걸리고, IP 단위라 여러 IP로 나눈 공격을 못 막는다([10 보안 점검](10-security.md) 5절). 앱의 계정 잠금([ADR-054](04-decisions.md#adr-054))은 여러 계정에 유출 비밀번호를 넣는 공격(크리덴셜 스터핑)에는 잘 안 통한다. 또 v1 회고의 셋째 문제(장애 복구를 정량 검증하지 못함)는 4 · 5단계 몫이라 아직 답이 없다.
- **결정:**

  | 항목 | 고른 것 |
  |---|---|
  | 순서 | 2단계 나머지 → 3단계 → **3.5단계(운영 사건 대응 자동화)**. 4단계 중 ECS 태스크 강제 종료 · RDS 강제 장애 조치 · 깨진 버전 배포는 3.5단계에서 먼저 한다. 4단계 나머지(AZ 하나 장애, 오토스케일링 상한)와 5단계는 그 뒤 |
  | 흐름 | 경보 · 이벤트 → Lambda 판단 → 조치 → 사건 보고서. 장애는 AWS가 스스로 복구하므로(ECS 태스크 교체, RDS 장애 조치, 배포 자동 롤백 [ADR-010](04-decisions.md#adr-010)) 감지 · 기록 · 보고 · 측정만 한다 |
  | 보안 조치 | 앱 로그의 로그인 실패를 IP와 계정으로 묶어(한 IP가 여러 계정, 한 계정에 여러 IP) WAF IP 세트에 자동으로 넣고 1시간 뒤 자동으로 뺀다. 범위가 넓거나 돈이 드는 조치(IP 대역 차단, 유료 Bot Control 켜기)는 사람이 승인한다. 계정 잠금은 앱이 이미 한다(ADR-054) |
  | 임계값 | 정상 k6 시나리오의 평소 최댓값 × 배수. 지금 WAF 한도 같은 가설값 대신 잰 값에서 정한다 |
  | AI | 판정과 조치는 규칙이 하고, AI는 사건 보고서(고객 보고용 초안)만 쓴다. AI가 실패해도 차단은 동작한다. 모델은 **Bedrock의 Claude Sonnet 5를 서울 리전 안에서(on-demand)** 부른다(2026-11-17 추가) |
  | 계정 기본 보안 | CloudTrail 기록 보관, GuardDuty, Security Hub(설정 점검)를 서비스 작업 전에 켠다. GuardDuty는 웹 요청 내용을 보지 않으므로 로그인 공격 탐지에 쓰지 않고, 샘플 탐지 결과로 알림 경로만 확인한다 |
  | 화면 | CloudWatch 대시보드 1개(Terraform): 경보 상태 · 서비스 · 보안 · 대응 기록. 부하 시연과 공격 · 장애 시연을 같은 화면으로 보여 준다 |

- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 새 보안관제 프로젝트를 따로 시작 | 이야기가 둘로 갈리고, 10일 안에 v2만큼의 깊이를 만들기 어렵다 |
  | GuardDuty · Security Hub를 켜기만 | 탐지 도구 도입일 뿐 판단 · 조치 · 측정이 없다 |
  | 보안 대응만(장애 제외) | MSP 운영은 장애와 보안 사건을 같은 방식으로 감지하고 보고한다. 장애 쪽은 같은 흐름을 다시 쓰고 복구는 AWS가 하므로 더하는 일이 작다 |
  | 계정 잠금을 사람 승인 조치로 | 앱이 이미 자동으로 잠근다(ADR-054). 같은 일을 두 곳에서 하면 결과가 엇갈린다 |
  | CloudWatch 이상 탐지 경보 | 과거 데이터로 평소 범위를 머신러닝으로 자동 학습하지만 학습에 최대 2주가 걸린다. 매일 지우는 환경과 k6로 만든 트래픽에는 익힐 평소 패턴이 없다 |
  | ZTNA(AWS Verified Access) | 직원용 사내 앱이 없는 시나리오다. 앱 하나에 시간당 $0.27로 상시면 월 약 $197이라 월 고정비 추정 $205([09 비용 추정](09-cost-estimate.md))와 맞먹는다. SSH · 배스천 없음(Fargate), 키 없는 배포(OIDC), Secrets Manager로 제로트러스트 원칙은 이미 들어가 있다 |
  | "XDR"이라는 이름 | 엔드포인트 · 네트워크 · 클라우드 · 계정 신호를 묶는 제품 범주라 이 범위에 붙이면 과장이다. 여러 원천을 묶는 생각만 쓴다 |
  | AI를 Anthropic API로 직접 호출 | API 키를 따로 보관 · 교체해야 하고, 고객 로그(IP · 계정)가 AWS 밖으로 나간다. Bedrock은 Lambda의 IAM 역할로 부르고, 입력 · 응답을 학습에 쓰지 않으며 모델 제공사와 공유하지 않는다(문서) |
  | Bedrock global 교차 리전 추론(Sonnet 5.5 · Haiku 5.5 등 최신 모델) | 서울에서 최신 Claude 대부분은 inference profile로만 부를 수 있다(계정에서 확인). global은 Bedrock이 전 세계 상용 리전 중 처리 리전을 고르므로 고객 로그가 한국 밖에서 처리될 수 있고, `aws:RequestedRegion` 조건과도 맞춰야 한다. 보고서 초안에는 최신 모델이 필요 없다 |

- **근거:** AWS Startup Security Baseline은 CloudTrail · GuardDuty · Security Hub를 계정 단위 통제로 두고 처음에 켜라고 한다. GuardDuty가 분석하는 것은 CloudTrail 관리 이벤트 · VPC 흐름 로그 · DNS 로그다. CloudFront에 붙은 WAF 지표는 us-east-1에만 쌓이고, 한 계정 안이면 대시보드 하나에 리전이 다른 지표를 같이 띄울 수 있다.
- **결과:**
  - 일정이 밀리면 CD 보안 검사 → AI 보고서 → 깨진 버전 배포 실험 순으로 뺀다. 3단계 이관 전 · 후 비교는 빼지 않는다.
  - 경보는 다른 리전의 지표를 볼 수 없어 WAF 경보는 us-east-1에 만든다.
  - GuardDuty · Security Hub는 리전마다 30일 무료 체험이다. 체험이 끝나기 전에 끄거나 비용을 기록한다.
  - 자동 차단이 WAF 한도(약 41초)보다 빠를지는 가설이다. WAF IP 세트를 바꾼 뒤 실제로 걸리기까지의 시간을 확인하지 않았다.
  - 여러 IP 공격을 재현하는 방법(발생기 여러 대 등)은 구현할 때 정한다.
  - 리전 전체 장애의 RTO · RPO는 5단계에 남는다. 3.5단계에서는 서버 · DB 수준의 복구 시간만 나온다.
  - Bedrock 호출은 Lambda 기본 제한 시간(3초)으로는 응답을 못 기다릴 수 있어 늘리고, 차단이 끝난 뒤에 따로 부른다(AI가 늦거나 실패해도 차단에 영향 없게). Bedrock 단가는 확인하지 않았다(호출은 시험 횟수만큼 수십 번 수준).
  - 보고서 단계를 읽기 전용 조사 Agent로 키울지는 캡스톤 평가 기준을 강사에게 확인한 뒤 정한다.

<details>
<summary>확인한 근거와 메모</summary>

- [AWS Startup Security Baseline – 계정 통제](https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-startup-security-baseline/controls-acct.html), [ACCT.14 GuardDuty](https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-startup-security-baseline/acct-14.html)(분석 원천, 리전별 30일 무료 체험), [ACCT.15 Security Hub](https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-startup-security-baseline/acct-15.html).
- [GuardDuty 요금](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-pricing.html), [Security Hub 요금](https://aws.amazon.com/security-hub/pricing/), [GuardDuty 결과를 EventBridge로](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_eventbridge.html)(새 결과는 거의 실시간, 반복 결과는 기본 6시간).
- [CloudWatch 이상 탐지](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html)(머신러닝 모델, 시간 · 일 · 주 패턴), [이상 탐지 경보](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Create_Anomaly_Detection_Alarm.html)("up to two weeks").
- [Verified Access 요금](https://aws.amazon.com/verified-access/pricing/)(2026-11-16 조회, HTTP(S) 앱 시간당 $0.27).
- [WAF 지표(CloudFront용은 us-east-1)](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-testing-view-metrics.html), [리전 간 대시보드 · 경보 제한](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Cross-Account-Cross-Region.html), [CloudWatch 요금](https://aws.amazon.com/cloudwatch/pricing/)(사용자 정의 대시보드 3개 · 지표 50개 이하 무료).
- 판정은 규칙, AI는 설명만이라는 원칙은 SKT ALEPH 수업의 보안 Agent 과제(기존 엔진이 판정 · 집행, AI는 근거 설명과 제안)에서 가져왔다.
- Bedrock: [데이터 보호](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)(학습에 쓰지 않음, 모델 제공사와 공유 안 함), [모델 접근](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)(첫 호출 때 Marketplace 구독 자동, Claude Opus 4.7부터는 사용 사례 양식 불필요), [global 교차 리전 추론](https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html)(처리 리전을 Bedrock이 고름), [Lambda 제한 시간](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html). 서울 리전 호출 방식은 2026-11-17 `aws bedrock list-foundation-models --by-provider anthropic`으로 확인: 서울 안에서 바로 부를 수 있는(on-demand) Claude는 `claude-opus-5` · `claude-sonnet-5`뿐이고, 나머지는 inference profile(최신은 global, `apac`은 Claude 3 계열만)로만 부른다.

</details>

<a name="adr-058"></a>
### ADR-058 3.5단계 공격 재현은 실제 사례 3개(회원 계정 탈취 · 숙소 계정 탈취 · 쿠폰 봇)로 하고, 앱에 적립금 · 호스트 화면 · 토큰 무효화를 더한다

- **상황:** [ADR-056](#adr-056)은 공격 재현을 로그인 대입 2종(IP 하나, IP 여러 개)으로 잡았다. 2026-11-17 강사 피드백은 "실제로 일어난 사례를 그대로 해 보는 편이 낫다"였고, 고른 사례는 셋이다. 메리어트(회원 계정이 털려 적립 포인트가 빠져나감, FTC가 계정 점검 요청 창구와 도난 포인트 복구를 명령), Booking.com(숙소 직원 PC의 정보 탈취 악성코드로 파트너 계정이 털려 진짜 손님에게 사기 메시지), 여행 업계 봇(가짜 계정 · 자동화 요청). 그런데 우리 앱에는 적립금이 없다. 호스트는 DB에만 있다(`users.role`의 `host`, `hotels.host_id`. 시드 숙소 10곳을 주인 2명이 6 · 4곳으로 나눔). 호스트 계정 · 화면 · API는 없다. 로그인 토큰(JWT)은 1시간 유효하고 서버가 중간에 취소할 방법이 없다.
- **결정:**

  | 항목 | 고른 것 |
  |---|---|
  | 시나리오 1 (메리어트형) | 유출 목록 대입(크리덴셜 스터핑) → 회원 계정 탈취 → 남의 적립금으로 예약 → 탐지 → 세션 끊기 · 비밀번호 재설정 안내 · **적립금 복구** |
  | 시나리오 2 (Booking.com형) | 호스트 직원 PC 악성코드가 비밀번호를 훔쳤다고 가정한다(악성코드는 재현하지 않음). 공격자 PC(낯선 IP)에서 정상 비밀번호로 호스트 로그인 → 손님 예약 정보(이름 · 연락처 · 날짜) 대량 조회 → 탐지 → 세션 끊기. 사기 메시지 발송은 재현하지 않는다(메시지 기능 없음). 가장 이른 탐지 지점인 "손님 정보가 빠져나가는 순간"까지만 |
  | 시나리오 3 (여행 업계 봇) | 선착순 쿠폰 오픈 시각에 가짜 계정 대량 가입 → 쿠폰 독식 → 탐지 → 차단 · 봇 계정 쿠폰 회수. 스크래핑은 하지 않는다 |
  | 적립금 저장 | 거래 내역 테이블. 적립 · 사용 · 복구를 한 줄씩 쌓고 잔액은 합계. 복구는 되돌림 한 줄이고, 누가 · 언제 · 어디서 썼는지가 탐지 · 감사 근거가 된다 |
  | 적립 | **숙박 완료 때** 결제액의 5%(시연용 값). 숙박 완료는 호스트가 "숙박 완료(체크아웃)" 버튼으로 처리하고, **체크인 날짜가 오늘이거나 지난 예약만** 된다. 시험은 오늘 체크인 예약 → 바로 완료(조기 체크아웃)로 날짜 우회 없이 한다. 가입 보너스는 없다(시나리오 3과 섞임) |
  | 적립금 사용 | 예약할 때 결제액에서 차감 |
  | 호스트 | 화면 한 페이지(내 숙소 예약 목록 + 숙박 완료 버튼)와 API. 계정 2개(시드 `host_id` 2개)는 일회용 스크립트가 SSM Parameter Store의 비밀번호로 만든다. 공개 저장소라 시드에 비밀번호를 넣지 않는다 |
  | 세션 끊기 | 사용자별로 "이 시각 이전에 발급한 토큰은 무효"를 기록하는 테이블을 두고 인증할 때 확인한다. 대응 자동화가 부른다 |

- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 쿠폰을 포인트로 간주(새 기능 없음) | 강사 의견: 실제 적립금 기능이 있어야 사례와 같고 시연이 낫다 |
  | `users`에 잔액 칸 | 배포 때 도는 스키마 작업은 이미 있는 테이블 구조를 바꾸지 않는다. 무엇이 털렸는지 근거가 남지 않아 복구 금액을 알 수 없다 |
  | 예약하자마자 적립 | 실제(숙박 후 적립)와 다르다. 오늘 체크인 + 조기 체크아웃으로 실제 규칙 그대로 시험할 수 있다 |
  | 숙박 완료에 날짜 검사 없음 | 털린 호스트 계정이 미래 예약을 완료로 바꿔 적립금을 찍어낼 수 있다 |
  | 비밀번호 재설정만 | 공격자가 이미 가진 토큰이 최대 1시간 유효하다. "차단했다"고 말할 수 없다 |
  | 토큰 15분 + 갱신 토큰 | 실무 표준에 가깝지만 로그인 구조 전체를 고쳐야 해 10일 일정에 크다 |
  | 호스트 API만 | 시연에서 공격자가 보는 호스트 화면을 보여 줘야 한다 |
  | 스크래핑 봇 | 10일 안에 사례마다 깊이 있게 한다. 쿠폰 봇이 우리 대표 이벤트(선착순 쿠폰)와 이어진다 |

- **결과:**
  - ADR-056의 공격 재현 2종(로그인 대입)은 시나리오 1의 탈취 단계가 된다. WAF IP 자동 차단(1시간 뒤 해제)은 그대로 쓰고, 세션 끊기 · 적립금 복구가 더해진다. 공격자는 IP를 바꿀 수 있어 IP 차단만으로는 봉쇄가 안 된다.
  - 로그인한 요청마다 DB 조회가 1번 늘어 부하 시험 수치가 바뀔 수 있다. 구현 뒤 잰다.
  - 앱 변경은 hotel-booking-app에서 한다([ADR-043](#adr-043)). 시나리오별 탐지 규칙 · 임계값 · 자동/승인 조치 · 재현 방법 · 성공 기준은 구현 세션에서 정해 덧붙인다.
- **구현 전 세부 결정 (2026-11-17):** 위 표의 "일회용 스크립트"와 "대응 자동화가 부른다"를 아래처럼 구체화한다.

  | 항목 | 고른 것 |
  |---|---|
  | 적립금 사용 | 결제액 전액까지. 쿠폰을 먼저 빼고 남은 금액에서 적립금을 뺀다 |
  | 적립액 | 실제 결제액(쿠폰 · 적립금을 뺀 금액) × 5%, 원 미만 버림 |
  | 예약 취소 | 쓴 적립금을 같은 내역 테이블에 '환원' 한 줄로 돌려준다. 되돌림 줄(환원 · 복구)은 되돌린 사용 줄을 가리키고 그 칸이 유니크라, 한 사용을 두 번 되돌릴 수 없다 |
  | 예약 변경 (구현 중 결정) | 숙박을 줄여 쓴 적립금이 새 결제액보다 많아질 때만, 같은 트랜잭션 안에서 '환원' 한 줄 + 새 결제액까지 '사용' 한 줄을 쓴다. 늘리거나 조금 줄이는 변경은 사용액을 그대로 둔다. 거절하고 "취소 후 다시 예약"으로 돌리면 그 사이 다른 손님이 그 객실 · 날짜를 가져갈 수 있다(사용자 지적) |
  | 동시 사용 (구현 중 결정) | 예약 INSERT보다 먼저 `users` 행을 `FOR UPDATE`로 잠근다(INSERT의 외래 키 검사가 거는 공유 잠금 뒤에 잠그면 동시 요청끼리 교착, 쿠폰 발급과 같은 이유). 잔액 합계는 잠금 읽기(`FOR SHARE`)로 구한다. 기본 격리 수준(REPEATABLE READ)의 일반 읽기는 "트랜잭션 첫 읽기 때의 스냅샷"을 봐서, 잠금을 기다리는 동안 커밋된 사용을 못 보고 두 번 쓸 수 있다([MySQL 일관된 읽기](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)). 같은 잔액으로 동시 예약 5건 → 1건만 되는 테스트로 확인 |
  | 세션 번호 | 토큰에 `jti`를 넣고 적립금 사용 줄에 남긴다(복구 범위 · 보고서). 배포 때 테이블 구조를 바꿀 수 없어 처음부터 넣는다 |
  | 세션 끊기 경로 | **보안 강화 단계로 미룸([ADR-060](#adr-060), 2026-11-18).** 아래는 미루기 전 기록. 관리용 문을 인터넷에 열지 않는다(사용자 원칙). 사람이 손으로 끊지 않고 자동으로 한다. 후보: ECS 일회성 태스크(추천: migrate와 같은 방식이라 새 서비스 없음, 시작에 수십 초는 가설로 시험에서 잼) · SQS 명령 큐. 어느 쪽이든 기계는 끊기 · 잠금만 하고 시간당 상한을 두며, 처리 결과를 로그로 남긴다 |
  | 같은 초 | 끊은 시각(초) 이하에 발급된 토큰은 모두 무효. 주인은 다시 로그인하면 된다 |
  | 끊은 뒤 처리 | **보안 강화 단계로 미룸([ADR-060](#adr-060)).** 미루기 전 추천: 토큰 탈취(로그인한 적 없는 IP에서 같은 세션 번호가 쓰임)는 끊기만 해 주인이 바로 다시 로그인하고, 비밀번호 탈취(공격 IP에서 로그인 성공)는 끊기 + 잠금. 잠금 해제 · 임시 비밀번호 · 사건 복구(공격자 세션이 쓴 적립금 되돌림 + 그 세션이 만든 예약 취소)는 관리자 계정(사람)만 한다. 이메일 인증 재설정은 재발 방지 권고 |
  | 계정 | 호스트 2개 + 관리자 1개. migrate 태스크가 배포마다 없으면 만든다. 비밀번호는 SSM SecureString(`/hotel-booking/host-password/<host_id>`, `/hotel-booking/admin-password`)을 ECS가 환경 변수로 넣고, 값이 없으면 건너뛴다 |
  | Google SSO | 지금 넣지 않는다. 사건 보고서의 재발 방지 권고(직원 계정 SSO · MFA)로 내고, 시간이 남으면 적용한 뒤 같은 공격을 다시 해서 전 · 후를 비교한다 |
  | 적립금 테이블 크기 | 내역 테이블 + `user_id` 색인만. 한 사람 줄이 많아지면 잔액 표, 전체가 커지면 아카이브. 예약 id는 외래 키라 MySQL이 색인을 자동으로 만든다([외래 키 조건](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html), 로컬 `SHOW INDEX`로 확인) |
  | 고객사 확인 | 관제 화면(CloudWatch 대시보드, 켜져 있을 때 실시간) + 고객사 보고 페이지(포트폴리오 사이트, 사건별 시간표 · 숫자 · 보고서, 언제든 열림) + 시연 영상. 먼저 만들어 보고 피드백을 받는다. CloudWatch만으로는 처음 보는 사람이 들어갈 수 없고 밤에 인프라를 내리면 비며, 앱 안에 관제 사이트를 따로 만들면 CloudWatch와 겹친다 |

  | 버린 대안 | 이유 |
  |---|---|
  | 관리 API + 비밀 헤더(CloudFront 경유) | 관리용 문이 인터넷 경로에 열린다. 비밀값이 새면 잠금 남발(서비스 마비)까지 된다 |
  | 대응 Lambda가 DB에 직접(VPC Lambda) | 복구 규칙이 앱 · Lambda 두 곳에 생기고, 털리면 DB 전체 쓰기 |
  | 내부 전용 관리 API(WAF로 `/api/admin` 차단 + VPC Lambda) | VPC Lambda는 지울 때 네트워크 인터페이스 정리에 최대 20분이 걸려([AWS 지식 센터](https://repost.aws/knowledge-center/lambda-eni-find-delete)) 매일 destroy가 길어진다 |
  | 세션 끊기 · 잠금을 관리자가 손으로 | 하루 종일 지켜볼 수 없고, 탈취 시도가 많으면 손으로 못 한다 |
  | Lambda가 복구 · 잠금 해제까지 | 자동 경로가 털리면 예약 취소 · 계정 재개방까지 된다 |
  | 비밀번호 탈취에 끊기만 | 공격자가 아는 비밀번호로 바로 다시 로그인한다 |
  | 일회용 스크립트로 계정 생성 | 서울을 밤마다 내려 DB가 매일 새로 생기므로 매일 다시 돌려야 한다 |
  | 토큰 1인 1개 | 주인과 공격자가 서로 튕기기만 하고, 비밀번호를 아는 공격자는 못 막는다 |
  | 예약 변경: 적립금이 넘치면 거절("취소 후 다시 예약") | 취소와 재예약 사이에 다른 손님이 객실 · 날짜를 가져갈 수 있다 |
  | 예약 변경: 적립금 쓴 예약은 변경 불가 | 늘리는 변경까지 막히고, 위와 같은 빈틈이 생긴다 |

<details>
<summary>확인한 근거와 메모</summary>

- 메리어트: [FTC 발표(2024-10)](https://www.ftc.gov/news-events/news/press-releases/2024/10/ftc-takes-action-against-marriott-starwood-over-multiple-data-breaches), [최종 명령(2024-12)](https://www.ftc.gov/news-events/news/press-releases/2024/12/ftc-finalizes-order-marriott-starwood-requiring-them-implement-robust-data-security-program-address). 탈취 수단이 크리덴셜 스터핑이었는지는 원문에서 다시 확인하지 않았다. 회원 계정 탈취로 숙박을 예약한 사례는 업체 자료([Kasada](https://www.kasada.io/loyalty-fraud-prevention/))다.
- Booking.com: [KELA](https://kelacyber.com/your-compromise-is-confirmed-how-threat-actors-access-hotel-accounts-on-booking-com)(숙소 계정 탈취 방식).
- 여행 업계 봇: [Netacea](https://netacea.com/blog/are-bots-threatening-the-travel-industry)(스크래핑 · 재고 고갈, 업체 자료).
- 앱 확인(hotel-booking-app `02096dc`): 예약은 과거 날짜만 거부해 오늘 체크인이 된다. 예약을 `completed`로 바꾸는 코드는 없다. 토큰은 `expiresIn: '1h'`이고 검증은 서명 · 만료만 본다.

</details>

<a name="adr-059"></a>
### ADR-059 포트폴리오를 이관과 보안 운영 두 이야기로 나누고, 5단계까지 이관을 먼저 끝낸 뒤 보안 운영(6단계)을 한다. 저장소는 늘리지 않는다

- **상황:** 2026-11-17 데이터센터 관제 경력 동료와 서로 프로젝트를 설명해 보니 "진행이 안 된 느낌, 질문에 설명이 어렵다"는 피드백을 받았다. 한 프로젝트 안에 v1 회고(멀티클라우드 오버엔지니어링), 이관 · 성능 · 장애 · 리전 복원 검증, 공격 재현 · 자동 대응 · AI 보고서 · 고객사 대시보드가 섞여 한 문장으로 설명되지 않았다. 캡스톤은 과정 시간표상 "보안 Agent/앱 캡스톤 실습"(11-19 ~ 12-02 오전, 성과 공유 12-08 ~ 09)이고, 바로 앞 수업이 이상탐지 자동화 · 자동 대응(SOAR)이다. 3 · 4 · 5단계(실제 덤프 이관, 장애 테스트, 리전 복원 RTO · RPO)는 아직 결과가 없다.
- **결정:**

  | 항목 | 고른 것 |
  |---|---|
  | 이야기 | ① 이관(v1 회고 → 규모 맞춤 설계 → 이관 → 부하 · 장애 · RTO · RPO) ② 보안 운영(이관을 마친 고객사가 맡긴 운영 · 보안: 공격 재현 → 자동 탐지 · 대응 → 대시보드 · 보고서). 캡스톤 발표의 중심은 ② |
  | 서론 (발표 30초) | "숙박 예약 회사가 선착순 쿠폰 이벤트를 열자 손님이 몰려 서버가 멈췄습니다. 기존 서버는 동시 접속 500명이 한계였습니다. 그래서 AWS로 옮겼는데, 처음 팀 프로젝트(v1)는 실제 문제와 맞지 않는 멀티클라우드 DR까지 넣어서 월 고정비가 약 $679로 추정되는 과한 구조였습니다. 이를 고객 규모에 맞게 다시 설계해 약 $205로 줄였습니다(v2). 이관을 마치고 운영 단계로 넘어오면서 고객사가 보안 운영을 맡겼고, 오늘은 그 이야기입니다." |
  | 순서 | 3 → 4 → 5단계를 먼저 끝내고 보안 운영을 한다. 이관 마감 2026-11-27(금), 주말 작업 포함. 3.5단계는 5단계 뒤 6단계로 옮기고, 장애 실험 3종(ECS 태스크 종료 · RDS 장애 조치 · 깨진 배포)은 4단계로 되돌린다 |
  | 저장소 | 늘리지 않는다. 앱 기능 · 관리자 화면은 hotel-booking-app, 탐지 · 대응 · 대시보드 · 보고서는 v2의 새 Terraform 루트, 계정 기본 보안은 v2 `infra/security` 그대로, 고객사 보고 페이지는 포트폴리오 사이트 |
  | 보여 주기 | 포트폴리오 사이트 하나에 프로젝트 페이지 2개. v2 README는 이관이 끝날 때 "① 이관 / ② 보안 운영" 두 부분으로 정리한다 |
  | 앱 기능([ADR-058](#adr-058)) | 인프라 없이 로컬 테스트로 되므로 이관과 나란히 먼저 만든다 |

- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 한 이야기로 계속(2026-11-16 캡스톤 범위) | 설명이 길어지고 듣는 사람이 핵심을 못 잡는다(동료 피드백) |
  | 보안 운영 먼저, 이관은 캡스톤 뒤 | 수료 뒤에는 작업하지 않을 계획이라 ①이 끝나지 않는다. 서론의 "이관을 마치고"가 사실이 되려면 실제 덤프 이관(3단계)이 먼저다 |
  | 보안 운영 새 저장소 | 만드는 것마다 이미 자리가 있다(위 표). 남는 건 v2 값에 기대는 Terraform뿐이라 출력값 약속 · 매일 올리기 단계만 늘어난다. 고객사 앱과 따로 배포하는 앱(여러 고객사를 보는 관제 포털 등)이 생기면 그때 나눈다 |
  | `infra/security`를 보안 운영 쪽으로 옮김 | 계정 기본 보안은 실무에서 인프라 · 플랫폼 팀이 계정을 만들 때 까는 기반이고, 보안 운영은 그 결과를 가져다 쓴다. 옮기면 state 경로 · 런북 · 링크를 다 고쳐야 한다 |
  | 포트폴리오 사이트 2개 | 보는 사람의 눈이 흩어진다 |

- **결과:**
  - 2026-11-16 캡스톤 범위(이관 + 운영 대응 자동화를 한 주제로, 4 · 5단계는 캡스톤 뒤)를 바꾼다. 보안 운영은 11-28 ~ 12-02 오전(주말 포함)에 한다. 밀리면 CD 보안 검사 → Failback 대조 → 공격 ③ 쿠폰 봇 → 고객사 보고 페이지(영상으로 대신) 순으로 빼고, AI 사건 보고서는 과정 이름(보안 Agent)과 맞닿아 빼지 않는다.
  - 이관 마감까지 못 하면 4단계의 AZ 하나 장애 · 오토스케일링 상한은 README에 하지 않은 것으로 남긴다.
  - v1은 4인 팀, v2는 개인 작업이라는 구분을 서론 · 포트폴리오에서 지킨다.
  - 포트폴리오 구성(2026-11-18): 카드 3장을 발전 순서(① v1 팀 → ② v2 이관 → ③ 보안 운영)로 시험 중이고, 카드마다 요약 첫 문장을 그 카드의 핵심 한 줄로 둔다. 직무별 대문 `/cloud`(② 대표) · `/security`(③ 대표)를 만들어 두고, 이력서 링크 칸에는 지원 직무에 맞는 경로를 쓴다. 내용은 대문과 같고 순서 · 첫 줄만 다르다. ③ 카드에는 시작 날짜를 쓰지 않는다(시작 시점 미정).
  - 옛 3.5단계를 설명하는 "다음 단계 계획" 절(README, 포트폴리오 v2 페이지 `src/content/projects/hotel-booking-aws-v2.md`)과 단계 그림(stages.svg)은 이관이 끝날 때 대문을 "① 이관 / ② 보안 운영"으로 정리하면서 한 번에 고친다. 그때까지 약 10일 동안 옛 계획 절이 보이는 것은 받아들인다("측정 전 계획"이라고 붙어 있고, README와 포트폴리오를 같은 문장으로 맞추는 규칙상 한 번에 고치는 편이 일이 적다).

<a name="adr-060"></a>
### ADR-060 세션 끊기 · 계정 잠금 · 주인 알림은 6단계 보고서의 권고를 거쳐 보안 강화 단계에서 넣고, 관리자 화면은 계정 조회 · 사건 복구만 먼저 만든다

- **상황:** [ADR-058](#adr-058)은 앱에 토큰 무효화(세션 끊기)를 넣어 대응 자동화가 부르게 했고, 전달 경로(ECS 일회성 태스크 · SQS)와 끊은 뒤 처리(잠금 여부)는 미정이었다. 2026-11-18 앱 작업 중 확인한 사실: SQS는 매달 100만 요청이 무료다. 탐지 자체가 분 단위다(로그 지표 필터의 지표에는 해상도 설정이 없고, 표준 경보의 최소 주기는 60초). AWS Cognito도 "취소한 토큰은 서명 · 만료만 보는 서버에서 만료까지 유효"라고 쓴다. 잠그려면 주인 알림과 공격자가 모르는 경로의 재설정이 함께 필요한데, 앱에는 이메일 발송이 없다. 사용자 판단: 보안 대응 · 강화는 진단(공격 재현 · 탐지 · 시각화) → 보고서 지적 다음에 오는 것이 순서다.
- **결정:**

  | 항목 | 고른 것 |
  |---|---|
  | 세션 끊기 · 잠금 · 알림 | 지금 넣지 않는다. 6단계 1차는 공격 재현 → 탐지 · 시각화 → WAF IP 자동 차단 → AI 보고서까지. 보고서가 "IP를 바꾸면 계정 단위로는 못 막는다"를 지적하고 세션 끊기 · 잠금 · 다른 경로 알림 · MFA를 권고한다. 시간이 남으면 보안 강화 단계에서 넣고 같은 공격을 다시 해 전 · 후를 비교한다(Google SSO와 같은 방식) |
  | 그때 쓸 판단 기준 | 토큰 탈취 = 새 로그인 없이 주인의 세션 번호가 다른 IP · 브라우저에서 쓰임 → 끊기만(주인은 다시 로그인). 비밀번호 탈취 = 그 계정이 써 본 적 없는 IP에서 새 로그인 성공(특히 같은 IP에서 여러 계정이 실패한 뒤) → 끊기 + 잠금. 정보 탈취 악성코드는 비밀번호와 세션 쿠키를 둘 다 가져가므로 악성코드 종류가 아니라 흔적으로 가른다. IP 변화만으로 확정하지 않는다(모바일 등 정상 변화) |
  | 주인 알림 원칙 | 비밀번호 탈취는 "다음 로그인 때 비밀번호 변경 화면"만으로는 안 된다. 공격자가 먼저 로그인해 바꿔 버린다. 재설정은 공격자가 갖지 못한 경로(이메일 링크 · 문자 · MFA · 관리자 본인 확인)로 한다 |
  | 끊기 경로 후보 | SQS 명령 큐가 앞선다. 비용 $0(무료 범위 안, 넣는 쪽은 IAM 권한 있는 대응 Lambda뿐이고 시간당 상한을 둠), 몇 초 안에 반영. ECS 일회성 태스크는 뜨는 시간(가설: 수십 초)이 차단 시간에 그대로 더해진다. 보안 강화 때 확정 |
  | 관리자 화면 | 지금 만든다: 이메일로 계정 찾기 → 적립금 내역(세션 번호 포함) → 사건 복구(세션 번호를 넣으면 그 세션이 쓴 적립금을 '복구' 줄로 되돌리고, 그 적립금으로 만든 확정 예약을 취소). 피해 복구는 막기가 아니라 운영자가 하는 일이다(메리어트도 도난 포인트 복구 명령, ADR-058) |
  | 시연 계정 | 호스트 2 · 관리자 1은 시연용 고정 계정. migrate가 배포마다 없으면 만든다(환경 변수 `HOST1_PASSWORD` · `HOST2_PASSWORD` · `ADMIN_PASSWORD`, 없으면 건너뜀). 비밀번호 값은 사용자가 SSM Parameter Store(SecureString, 표준 무료)에 직접 넣는다. 대화 기록 · Terraform 상태 · 저장소에 남지 않게 하려는 것. ECS 연결은 2026-11-18에 넣었다(다음 날 동료 시연에 호스트 · 관리자 화면이 필요해 앞당김): 서울만 켜고(`demo_accounts`), 도쿄 복원은 끈다(없는 파라미터를 참조하면 태스크가 못 뜰 수 있음, 가설). 실행 역할에는 `ssm:GetParameters`만 더한다(기본 키라 `kms:Decrypt` 불필요, [ECS 실행 역할](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)). 절차는 런북 5-3. 실제 서비스는 호스트가 스스로 가입한 뒤 숙소 확인을 받고, 직원은 회사 SSO로 들어온다. 첫 관리자 1명만 배포 비밀값으로 만드는 것은 흔한 방식이다(Keycloak · Grafana) |
  | 탐지용 로그 (구현 중 결정) | 보안 이벤트를 한 줄 JSON(`log=security`)으로: 가입, 로그인 성공 · 실패, 토큰 거절, 예약(적립금 사용액), 호스트 예약 조회(건수), 숙박 완료(적립액), 쿠폰 발급, 관리자 조회 · 복구. 손님 IP는 Express `trust proxy` 2: CloudFront → ALB가 X-Forwarded-For 끝에 하나씩 덧붙이므로 손님이 보낸 가짜 값은 왼쪽에 남아 무시된다(프록시 단계가 바뀌면 같이 고침). 로그인 실패 이메일은 SHA-256 앞 16자(개인정보와 이메일 칸에 잘못 친 비밀번호가 로그에 안 남음), User-Agent는 200자까지 |

- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 지금 SQS로 끊기 · 잠금 | 주인 알림 · 안전한 재설정 없이 잠그면 반쪽 대응이고, 이관 마감(11-27)과 겹친다 |
  | 지금 ECS 일회성 태스크 | 위와 같고, 끊는 데 수십 초(가설)가 더 걸린다 |
  | 관리자 화면 전체를 강화 단계로 | 시나리오 1의 피해 복구를 보고서에 "했다"고 쓸 수 없다 |
  | 관리자만 비밀값, 호스트는 관리자 화면에서 만들기 | DB가 매일 새로 생겨 시연 전마다 만들어야 한다 |
  | 호스트 직접 가입 + 관리자 승인 | 가장 실제와 같지만 기능이 가장 크고, 매일 다시 해야 한다 |
  | 시연 비밀번호를 Terraform `random_password`로 | 비밀번호가 상태 파일에 남고 서울을 내릴 때마다 바뀐다 |
  | 시연 비밀번호를 Secrets Manager에 | 비밀 1개당 월 $0.40 + API 1만 건당 $0.05(3개면 월 $1.20). 자동 교체 · 리전 복제가 장점인데, 시연 비밀번호는 사람이 정해 넣고 교체할 필요가 없으며 도쿄 복원에서 쓰지 않는다. SSM 표준 파라미터는 추가 요금 없음. 대가: 비밀 보관 장소가 Secrets Manager(JWT · 앱 DB, 복제 필요)와 SSM 두 군데로 나뉜다. AWS는 비밀값에 Secrets Manager를 권장하므로 실제 운영 계정이면 Secrets Manager + 교체 ([SSM 요금](https://aws.amazon.com/systems-manager/pricing/), [Secrets Manager 비교](https://aws.amazon.com/compare/kms-and-secrets-manager/), [Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)) |

- **결과:**
  - 6단계 완료 기준을 "공격 시작부터 탐지 · IP 차단까지 시간"으로 바꾸고, 계정 단위 차단은 보고서 권고 · 전후 비교로 옮긴다([03 6단계](03-plan.md)).
  - 공격자 세션 번호가 적립금 사용 줄과 보안 로그에 남으므로, 강화 전에도 탐지와 복구 범위 산정은 된다. 적립금을 쓰지 않은 공격자 예약은 DB에 세션 번호가 없어 로그(`booking_created`)로 찾는다.
  - 관리자 화면은 인터넷에 열린 사이트의 관리자 로그인이다. 직원 계정 SSO · MFA는 ADR-058대로 보고서의 재발 방지 권고다.

<details>
<summary>확인한 근거</summary>

- SQS 무료 요청: [SQS 요금](https://aws.amazon.com/sqs/pricing/) "1 million Amazon SQS requests for free each month"
- 탐지 주기: [지표 필터 MetricTransformation](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_MetricTransformation.html)(해상도 칸 없음), [CloudWatch 개념](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html)(표준 경보는 60초의 배수)
- 토큰 취소의 한계: [Cognito 토큰 취소](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html) "revoked tokens will still be valid if they are verified using any JWT library"
- 악성코드: [Microsoft, Lumma Stealer](https://www.microsoft.com/en-us/security/blog/2025/05/21/lumma-stealer-breaking-down-the-delivery-techniques-and-capabilities-of-a-prolific-infostealer/) "extracts saved passwords, session cookies"
- 세션 탈취 신호: [OWASP 세션 관리](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)(세션 도중 IP · User-Agent 변화, 단독으로는 신뢰 못 함)
- 비밀값 보관: [Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html), [요금](https://aws.amazon.com/systems-manager/pricing/)(표준 무료), [ECS에서 Parameter Store 값 넣기](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html)(태스크 시작 때 한 번 넣음, 실행 역할 권한 필요)
- 계정 관행: [Booking.com 파트너 가입](https://join.booking.com/), [Keycloak 첫 관리자](https://www.keycloak.org/server/configuration), [Grafana admin_password](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/)("Set once on first-run")
- 손님 IP: [CloudFront X-Forwarded-For](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html), [ALB X-Forwarded-For(기본 append)](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/x-forwarded-headers.html), [Express behind proxies](https://expressjs.com/en/guide/behind-proxies.html)

</details>

<a name="adr-063"></a>
### ADR-063 3 · 4 · 5 · 6단계를 모두 2026-11-30에 끝내고, 영상 촬영 · 편집만 12-01 이후로 미룬다. 바깥에는 실측 기록을 재생하는 포트폴리오 페이지를 보여 준다

- **상황:** 2026-11-20 사용자. 녹화 준비, 촬영용 재실행, 편집 때문에 실험이 늦어지고 구현 · 검증 시간이 줄어드는 것을 피하고 싶다. 수료일은 12-09. [ADR-059](#adr-059)의 일정은 이관 11-27, 보안 운영 11-28 ~ 12-02 오전이었다.
- **결정:**

  | 항목 | 고른 것 |
  |---|---|
  | 마감 | 3단계(라이트사이징 포함) · 4단계 · 5단계 · 6단계 모두 **2026-11-30**. 실험 범위 · 반복 횟수 · 완료 기준은 줄이지 않는다 |
  | 영상 | 11-30까지 하지 않는다: 녹화 준비, 촬영용 재실행, 편집 · 자막, 업로드, 포트폴리오 영상 플레이어. 12-01 ~ 12-09에 필요한지 다시 판단 |
  | 바깥에 보여 주기 | 포트폴리오(Astro · Vercel)에 **실측 재생 페이지**: 정적 JSON, 같은 시간축에 VU · 요청 수 · p95 · 오류율 · 태스크 수, 재생 · 일시정지 · 처음부터 · 시점 이동, 사건 표시(스케일링 결정 · 태스크 준비), 결과 카드. 아직 안 잰 칸은 "실측 대기". AWS를 내려도 열린다. 첫 목표는 3단계 쿠폰 오픈 · 오토스케일링 하나, 그다음 같은 형식으로 4단계 장애 · 5단계 리전 복원. [ADR-061](04-decisions.md#adr-061)의 바깥용 "한 화면 페이지"를 이것으로 정한다 |
  | 원본 | 영상을 미뤄도 원본은 지금부터 남긴다: k6 요청별 기록, CloudWatch 1분 · 앱 1초, 스케일링 결정 · ECS 이벤트, 시작 · 끝 시각, 코드 커밋 · 태스크 크기, 정합성 결과. 수집 주기가 다른 값 사이를 메우는 중간값은 만들지 않는다(1분 값은 1분 계단으로 그림) |
  | LIVE + REPLAY (같은 날 추가) | 인프라가 켜져 있으면 지금 상태(LIVE), 꺼져 있거나 방문자가 고르면 실측 재생(REPLAY). 켜져 있어도 재생은 언제든 된다. 방문자는 읽기만 한다. 부하 실행 · 쿠폰 초기화 · 리소스 생성 · 삭제 · 장애 주입은 관리자 환경에서만 한다. 숙박 사이트가 200을 준다고 LIVE로 보지 않고, 확인 시각과 지표의 최신성으로 판정한다(꺼짐 · 지표 지연 · AWS 조회 실패를 구분). LIVE의 서버 요청 수와 k6 가상 사용자 수를 섞지 않는다(VU는 재생에서만). 순서: 수집 보완 → 실측 REPLAY → 인프라 연결 상태 → 읽기 전용 LIVE 지표 → 자동 · 수동 전환 → 4 · 5단계로 확장. 마감이 위험하면 LIVE부터 줄이고 실측 · 라이트사이징 · 장애 · DR · 보안 운영을 지킨다. 연결 방식(인증 · 권한)은 사용자가 고른 뒤 04에 기록 |
  | 쿠폰 시험 조건 | 11-18 확정안(1,000명 · 100장) 그대로. 사용자 메모의 "30장"은 대표 예시였고, 확정안이 로컬 E-03과 같아 로컬 → AWS 비교가 된다 |

- **결과:** `load/cw-metrics.sh`가 회차마다 `scaling.json`(스케일링 결정 시각 · 이유, 안 늘린 이유 포함) · `ecs-service.json`(최근 ECS 이벤트 100개: 태스크 시작 · 대상 등록 시각) · `task-def.json`(태스크 CPU · 메모리 · 이미지) · `commit.txt`도 받는다. 회차 동안에는 `load/record-tasks.sh`가 목표 · 실행 · 대기 태스크 수를 5초마다 `tasks.log`에 남긴다(평소 사용자, ECS 조회). Container Insights를 켜지 않아 CloudWatch에 태스크 수 지표가 없어서다. Container Insights는 켜지 않고 5초 기록으로 대신했다(Claude 제안, 켜자고 하면 `cw-metrics.sh` 쿼리에 더함): 지표 문서에 수집 주기가 적혀 있지 않고([지표 목록](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-metrics-ECS.html)), 서울 apply와 지표 요금이 더해진다. 켜더라도 1초 지표 · 이벤트는 사라지기 전에 받아 둬야 해서 `cw-metrics.sh`는 그대로 필요하다. [3단계 계획](experiments/migration.md)의 영상 A(다시 찍기)는 12월로 미루고, B(기록 재생)가 이 페이지다. 관제용 CloudWatch 대시보드(런북 5-6)는 운영 화면으로 그대로 두고 바깥 페이지와 섞지 않는다. ADR-059 자르는 순서의 "고객사 보고 페이지(영상으로 대신)"는 영상이 12월로 밀려 대신할 것이 없다. 자를 때 다시 정한다.

## 결과 기록

| 단계 | 날짜 | 측정값 | 비용 | 메모 |
|---|---|---|---|---|
| 0-a 백엔드 | 2026-11-03 | 같은 객실·날짜 동시 예약 10건 → 201 1건, 409 9건 (4회 반복 동일). 같은 멱등키 재요청 → 같은 예약 반환(200). 테스트 10개 통과 | $0 (로컬) | v1의 "조회 후 저장" 경쟁 상태를 DB 기본 키 제약으로 해결 |
| 0-b 화면·CI | 2026-11-03 | 화면 파일을 컨테이너에 포함(`/`, `/js`, `/css` 200), 예약 요청에 멱등키 헤더 추가, GitHub Actions CI(MySQL 서비스 + 테스트 11개 + 이미지 빌드) | $0 | 범위 밖 기능은 진입점만 숨김 (코드 정리는 후속) |
| 0 트러블슈팅 | 2026-11-03 | 시드의 한글이 깨짐(`그` → `C3AAC2B7C2B8`, 이중 인코딩). 원인: MySQL 컨테이너 초기화 클라이언트의 문자셋이 `latin1`. 시드에 `SET NAMES utf8mb4` 추가, 한글 회귀 테스트 추가(수정 전 실패 → 수정 후 통과 확인) | $0 | 3단계 덤프 이관에도 같은 위험이 있어 문자셋을 명시하기로 함 |
| 0 쿠폰·리뷰 | 2026-11-03 | 30명/수량 10장 동시 발급 → 정확히 10장 (초과 0, 남은 수량 거절 0). 같은 사용자 동시 5회 → 1장. 같은 숙소 동시 리뷰 5개 → 모두 저장, 평점 일치. 테스트 22개 3회 반복 통과. 테스트 전용 DB를 시연용 DB와 분리 | $0 | |
| 0 화면 | 2026-11-03 | React로 화면 7개(홈·검색·상세·예약·내 예약·쿠폰·로그인) 재작성, v1 화면의 숨겨 둔 코드 제거. 응답 서버 배지(X-Served-By). 화면 단위 테스트 6개, API 테스트 23개 | $0 | 꾸미기는 여기서 멈추고 장애 실험으로 넘어감 |
| 0 트러블슈팅 2 | 2026-11-03 | 쿠폰 동시 발급에서 10장 중 4장만 발급되고 26명이 거절됨(교착). 원인: 받은 기록 INSERT의 외래 키 검사가 쿠폰 행에 공유 잠금을 걸고, 이어진 발급 수 UPDATE가 배타 잠금을 기다리며 서로 막힘. 쿠폰 행을 먼저 잠그도록 순서를 바꿨고, 같은 구조인 리뷰 저장(숙소 평점 갱신)도 함께 고침 | $0 | 동시성 테스트가 없었다면 이벤트 당일 "쿠폰이 남았는데 소진" 장애로 이어졌을 것 |
| 0 트러블슈팅 3 | 2026-11-03 | 숙소를 누르면 화면 전체가 하얗게 꺼지고 새로고침해야 보임. 헤드리스 Edge를 CDP로 조작해 재현 → `TypeError: l is not a function`. 개발 모드 경고로 effect가 Promise를 반환함을 확인. 원인: `useEffect(() => window.scrollTo(0, 0))`가 scrollTo의 결과를 반환하는데, 최신 Chromium의 scrollTo가 Promise를 반환해 React가 정리 함수로 호출하다 실패. effect를 블록으로 감싸 수정, 같은 패턴 1곳도 함께 수정. 재현 스크립트로 수정 후 정상 확인 | $0 | 화면 전환을 자동으로 확인하는 브라우저 테스트가 없어 사용자가 먼저 발견함 |
| 0 실험 결과 정리 | 2026-11-09 | 07을 목록·공통 준비·정합성 검사만 남기고 실험별 파일 6개([experiments/](experiments/))로 나눔. 같은 틀: 실사용 상황 · 하는 일 · 기대 결과 · 결과 · AWS에서 잴 것 → 기록. E-02에 밤별 표(원한 사람 수 / 잡힌 예약) 추가. 포트폴리오도 요약 표 + 실험별 페이지 6개로 나눔 | $0 | |
| 0 비용 추정 | 2026-11-09 | 월 고정 비용: 상시 v1 $679 → v2 $155 (−77%), 작업 시간(평일 9~18시, 195시간) v1 $182 → v2 $42. 단가는 AWS Price List API · Azure Retail Prices API | $0 | 사용량 비용 제외. Budgets 월 $50 제안 → [09](09-cost-estimate.md) |
| 1 Budgets 알림 | 2026-11-11 확인 | 월 $50 알림 설정됨 (사용자 확인, 설정한 날짜는 기록 안 됨) | $0 | 평소 사용자 정책에는 budgets 권한이 없어 콘솔(관리자)에서만 보임. 2단계 bootstrap에서 코드로 옮김 |
| 1 legacy 네트워크·NAT | 2026-11-10 | plan 12개 추가(예측 8: 라우팅 테이블 연결 2·경로 2를 빠뜨림. plan 수는 콘솔에 보이는 물건이 아니라 `resource` 블록 수). apply 후 NAT 시스템 로그에서 user_data가 끝까지 실행됨(iptables 규칙 저장 OK), 프라이빗 라우팅 `0.0.0.0/0` → NAT ENI 확인, destroy 12개 후 state 비어 있음 | $0.02 미만 (NAT t3.micro $0.013 + 공인 IPv4 $0.005 /시간, 켜 둔 시간 미기록) | 첫 실행은 `aws login` 세션이 관리자 역할로 잡혀 관리자 권한으로 돌았다. 같은 날 평소 사용자 + 직접 쓴 정책([legacy-operator-policy.json](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/iam/legacy-operator-policy.json))으로 다시 apply·destroy → 권한 거부 없음, NAT 로그 동일. NAT의 실제 전달은 과제 2의 DB EC2 설치로 확인 |
| 1 앱 EC2·키 페어 | 2026-11-10 | plan 16개 추가(과제 1의 12 + SG 2 + 키 페어 1 + 앱 EC2 1. 인라인 SG 규칙은 리소스로 세지 않음). 첫 apply는 `ImportKeyPair` 400(`Character sets beyond ASCII are not supported`)으로 14개만 만들고 멈춤: 공개 키 코멘트에 한글(`학원`). Terraform은 롤백하지 않고, 앱 EC2는 `key_name`이 키 페어 리소스를 참조해 생성을 시작하지도 않음. 코멘트를 ASCII로 고친 키로 다시 apply → 2개 추가. SSH 접속 후 Docker `enabled` · `active (running)` 확인. destroy 후 state 비어 있고 서울 리전 인스턴스 0대 | 시간당 약 $0.036 (NAT·앱 t3.micro $0.013씩 + 공인 IPv4 2개 $0.005씩), 켜 둔 시간 미기록 | 평소 사용자로 실행. 400(입력값 오류)이므로 `ImportKeyPair` 권한은 통과(권한이 없으면 403 `UnauthorizedOperation`). 리뷰에서 앱 SG 22번의 `protocol = -1`을 발견: 모든 프로토콜·포트가 열리는데 validate·plan은 통과함 |
| 1 DB EC2·NAT 검증 | 2026-11-10 | plan 17개(16 + DB 1). 첫 ProxyJump가 앱 → DB 22번에서 멈춤(`connect failed: Connection timed out`): 앱 EC2 코드를 복사하며 DB에 앱 SG가 붙음. SG는 거절하지 않고 패킷을 버려 시간 초과로 보임. DB SG로 고쳐 `apply -replace`로 DB만 다시 만듦(실행 중 SG 변경은 정책에 없는 네트워크 인터페이스 수정 권한이 필요할 수 있어서). [check-db.sh](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/legacy/check-db.sh)로 cloud-init `done`, SQL 2개(7,055·22,080바이트), `mysql:8.4` 이미지 확인 → NAT가 실제로 전달함(과제 1에서 남긴 검증). MySQL 컨테이너는 initdb로 DB·`app` 계정·스키마·시드를 만들고 호텔 10개, 한글 저장 정상(`그` = `EAB7B8`) | 시간당 약 $0.049 (t3.micro 3대 + 공인 IPv4 2개), 켜 둔 시간 미기록 | 컨테이너 안 `mysql` 클라이언트로 조회하면 한글이 `???`: 저장은 정상이고 클라이언트 기본 문자셋이 latin1이라 읽을 때 바뀜(`--default-character-set=utf8mb4`로 확인, 앱은 `db.ts`에서 utf8mb4 지정). NAT 대기 1회는 NAT가 이미 떠 있던 상태라 경합은 아직 시험하지 않음 |
| 1 DB 데이터 양·처음부터 apply | 2026-11-10 | 처음부터 apply(17개) 후 [start-db.sh](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/legacy/start-db.sh) 하나로 user_data 완료 대기 → 비밀값 전송 → initdb(스키마 → 시드 → [seed-volume](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/scripts/seed-volume.sql)) → 호텔 1,010개, 한글 정상. seed-volume은 t3.micro에서 12초(로컬 약 10초). NAT 경합 실제 발생: DB의 첫 `curl`이 NAT 준비 전이라 실패하고 10초 뒤 두 번째에 성공(대기 루프가 없었다면 `dnf`에서 user_data가 멈춤) | 시간당 약 $0.049 (t3.micro 3대 + 공인 IPv4 2개) | `check-db.sh`·`start-db.sh`는 매번 예전 서버 키 기록을 지워서, 같은 날 두 스크립트를 이어 실행하면 지문을 다시 물음(새 서버 키로 인한 접속 거부를 막는 대가) |
| 1 앱 배포 (과제 2-4) | 2026-11-11 | 커밋 SHA 태그로 이미지 빌드([ADR-022](04-decisions.md#adr-022)) → push 전에 이미지 안 확인(`/app`에 빌드 결과물만 있고 환경 변수에 비밀값 없음) → Docker Hub 공개 저장소에 push. [start-app.sh](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/legacy/start-app.sh): 비밀값 전송(600) → pull → `docker run -p 80:3000` → `/api/health/deep` 200. 브라우저에서 숙소 조회는 정상이고 예약 화면이 하얗게 멈춤(아래 트러블슈팅) → 수정 커밋 `62702e2`로 다시 배포. 브라우저가 받는 JS 파일명이 바뀐 것으로 새 이미지를 확인했고 예약 화면·내 예약 화면 정상. 새 버전으로 예약 생성은 다음 apply에서 확인(아래 3-1 행) | 약 $0.03 (11:37~12:14 KST 37분, 시간당 약 $0.049) | DB 비밀번호는 보낼 때 db.env에서 꺼내 써서 두 파일에 복사하지 않음. `.dockerignore`에 env 파일 패턴(`**/*.env`, `**/.env.*`) 추가: Vite는 web의 env 파일 값(`VITE_`)을 화면 JS에 써 넣어 공개 이미지와 브라우저로 샐 수 있음(지금은 env 파일 없음, 예방) |
| 1 트러블슈팅: HTTP 예약 화면 | 2026-11-11 | 앱 서버(HTTP)에서 숙소를 고르고 예약 화면으로 가면 화면 전체가 하얗게 꺼짐. 네트워크 탭에 `/api` 요청이 하나도 없어 데이터를 부르기 전에 화면 JS가 멈춘 것으로 판단. 원인: 멱등키를 `crypto.randomUUID()`로 만드는데, 이 함수는 보안 컨텍스트(HTTPS·localhost)에서만 있어 공인 IP의 HTTP에서는 `TypeError`로 React가 화면을 내림. HTTP에서도 되는 `crypto.getRandomValues`로 바꿔(서버는 100자 이하 문자열이면 받음) 다시 배포 후 정상 | $0 (위 시간에 포함) | 1단계 HTTP와 3단계 HTTPS의 조건 차이가 동작을 바꾼 실제 사례. 로컬은 localhost라 보안 컨텍스트여서 0단계에서는 드러나지 않음. 콘솔 오류 문구는 따로 확인하지 않았고 코드와 수정 후 동작으로 확인. 화면 전환을 자동으로 확인하는 브라우저 테스트가 없는 한계는 0 트러블슈팅 3과 같음 |
| 1 DB 재시작 중 앱 | 2026-11-11 | DB 컨테이너를 `docker restart`하는 동안 1초 간격으로 `/api/health/deep` 15회: 200 → 500 4회(대부분 15~20ms, 1회 1.03초) → 200 10회. 예측(꺼진 동안 실패, 앱 재시작 없이 회복, 다시 뜬 직후 첫 요청부터 정상) 모두 맞음 | $0 (위 시간에 포함) | 포트가 닫혀 연결 거부가 바로 와서 3초 상한(503)까지 가지 않고 일반 오류 500. 정상 종료라 MySQL이 연결마다 끊는다는 신호를 보내 풀이 죽은 연결을 미리 버림. 신호 없이 사라지는 장애(서버 다운, RDS 장애 조치)는 시험하지 않음 → 2단계 장애 실험 |
| 1 부하 발생기 (과제 3-1) | 2026-11-11 | 부하 발생기 EC2와 전용 SG를 `is_load_test` 변수로 켤 때만 만듦(`count`). plan: 끈 날 17개 · 켠 날 19개 추가(예측과 같음). 발생기에서 `grafana/k6:1.0.0` 실행(로컬 실험과 같은 버전). 발생기 → 앱 공인 IP `/api/health/deep` 200 **4.4ms**, 같은 요청을 내 PC에서 14.4ms(각 1회). 서버 4대(NAT·앱·DB·발생기) 크레딧 방식 모두 unlimited(앱·DB·발생기는 코드에 명시, [ADR-023](07-experiments.md#adr-023)). 새 버전(`62702e2`)으로 예약 생성 → 내 예약에 보임: **1단계 "이전 환경에서 앱 동작" 완료** | 시간당 약 $0.067 (t3.micro 4대 + 공인 IPv4 3개), destroy 15:05 KST(19개), apply 시각 미기록 | 발생기에 처음엔 앱 SG를 붙였다가 리뷰에서 전용 SG로 바꿈: DB SG가 앱 SG를 출발지로 허용해서 발생기가 DB 3306·22번에 닿을 수 있었음(DB에 앱 SG가 붙었던 2-3과 같은 모양). 내 PC도 14ms라 국내에서는 인터넷 지연 자체는 작다. 서울 EC2를 쓰는 주된 이유는 지연보다 PC·집 회선 한계와 에러 원인 구분([ADR-019](07-experiments.md#adr-019)) |
| 1 부하 기준선 (과제 3) · **1단계 완료** | 2026-11-11 | 손님을 500명씩 늘리는 6층 계단(최대 3,000명, 1회 37분) × 3회(3회차는 집 PC · 새 서버). 3회 모두 **동시 접속 500명(초당 85~86건, p95 0.76~0.96초)까지 버팀, 1,000명에서 무너짐**(에러율 59~69%, p95 9초). 500명에서 DB CPU 평균 91~93%(앱 18~21%)로 DB가 먼저 한계. 발생기(t3.medium)는 CPU 최대 41%로 병목 아님. 정합성 검사 모두 0 → [기준선](experiments/baseline.md) | 약 $0.3 (1·2회차 ~17:59, 3회차 20:49~21:49, 시간당 약 $0.106) + 데이터 전송 회당 약 0.7센트 + CPU 초과분 | 예측 ③(앱이 먼저 한계) · ⑤(로그인이 가장 느림) 틀림: DB가 꽉 차서 DB를 기다리는 요청이 느려짐. 1,000명 이후 DB · 앱이 한가한데 실패 97~99%인 원인은 미확인(스냅샷을 못 찍음 → 짧은 진단으로 확인). 2회차에 실패로 받았는데 저장된 예약 1건 |
| 1.5 DB 병목 로컬 분석 · 개선 | 2026-11-11 | 조회별 DB 시간: 추천 숙소가 약 60%(숙소 전체 최저가를 계산한 뒤 8개만 남김). 로컬 DB 0.3코어로 1단계 모양 재현("실패로 받았는데 저장된 예약" 3건 포함). ① 추천 숙소를 8개 먼저 고르게 고쳐 같은 조건 1,000명 에러 90% → 0%(p95 318ms), DB 시간 1/100 ② 조회 시간 상한 2초를 MySQL이 직접 지키게 해 0.1코어 과부하 500명 에러 57% → 39% ③ 예약 화면이 503이면 같은 멱등키로 자동 재시도 → [기록](experiments/db-bottleneck.md) | $0 (로컬) | 연결 재접속(과부하에서 9분에 약 1만 번)은 줄지 않아 후속. AWS 옛날 구조 재측정은 사용자 확인 후. 앱 테스트 29개 · 화면 테스트 12개 통과 |
| 1.5 고친 앱으로 옛날 구조 재측정 (AWS 1회) | 2026-11-11 | 같은 계단 · 같은 서버. 500명 p95 0.96초 → **0.24초**(DB CPU 93% → 68%), 1,000명 실패 59~69% → **15%**. 1,000명 이후 무너진 원인 확인: 앱 EC2의 연결 추적 표(conntrack) 7,680칸이 손님 재연결로 가득 차 새 연결(손님 → 앱, 앱 → DB)을 버림(`nf_conntrack: table full`) → "DB · 앱이 한가한데 실패 99%"의 정체. 예약 181 = 181 → [기록](experiments/db-bottleneck.md) | 약 $0.11 (23:23~00:21) | 앱이 5초 만에 연결을 닫아(Node keepAliveTimeout) 화면마다 새 연결, 닫힌 연결이 표에 120초 남음. 다음 후보: keepAliveTimeout을 손님 쉬는 시간 · ALB(60초)보다 길게 |
| 1.5 연결 유지 수정 후 AWS 재측정 | 2026-11-12 | 앱이 연결을 65초 유지(keepAliveTimeout). 새로 연결한 요청 63.8% → 2.1%, 연결 추적 표가 차는 시점 1,000명 → 1,500명 층. 1,000명 실패 15.7%로 그대로인데 원인이 바뀜: DB CPU 100%(검색 조회 p95 5.9초). 1,500명 실패 69% → 42% → [기록](experiments/db-bottleneck.md) | 약 $0.09 (00:51~01:39) | 다음 한계는 DB(검색). 연결 추적 표는 열린 연결로 약 1,900명에서 참(1단계 서버 한계). DB가 꽉 차면 연결 재접속(Aborted_clients 8천)이 다시 보임 |
| 1.5 검색 조회 수정 · **1.5단계 완료** | 2026-11-12 | 검색도 추천 숙소와 같은 모양(조건에 맞는 숙소 전부의 최저가를 계산한 뒤 12개만)이라, 보여 줄 숙소에만 계산하고 개수는 숙소만 셈. 조회 한 번 4.9 → 0.7ms(목록), 4.8 → 2.0ms(개수). 같은 DB에서 연달아 잰 로컬(0.3코어) 1,000명 p95 559ms → 4ms, 검색 DB 시간 약 1/16 → [기록](experiments/db-bottleneck.md) | $0 (로컬) | AWS 재측정은 하지 않음(조회 비용은 로컬로 확정, 버티는 인원은 3단계에서). 비교용 앱 버전 `a1fa568`로 고정 |
| 1.5 최종 앱으로 옛날 구조 재측정 | 2026-11-12 | 앱 `a1fa568`, 같은 계단 · 서버. 500명 p95 0.96 → **0.14초**(DB CPU 93% → 55%), 1,000명 실패 59~69% → **1.47%**(기준 1%를 조금 넘어 판정은 여전히 500명), 1,500명부터 연결 추적 표 가득 참. 1,000명의 남은 한계는 DB CPU 100%(계산 92%, 디스크 대기 0%), 가장 많이 돈 조회는 리뷰 → [기록](experiments/db-bottleneck.md) | 약 $0.09 (02:40~03:31) | 리뷰 조회는 로컬에서는 가벼웠음(로컬 ≠ AWS). 결과를 가져올 때 SSH 시간 초과로 db.vmstat를 따로 가져옴 → run-baseline.sh가 접속될 때까지 기다리게 고침 |
| 2 확인: state 잠금 | 2026-11-12 | S3 네이티브 잠금 `use_lockfile`은 Terraform 1.10.0 추가, 1.11.0 정식(GA). DynamoDB 잠금은 1.11.0부터 deprecated. 잠금 파일은 state 옆 `<key>.tflock`이고 잠금 파일에 `s3:GetObject`·`PutObject`·`DeleteObject` 필요. 우리 Terraform 1.17.0이라 DynamoDB 없이 `use_lockfile` 사용. 출처: [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3), [v1.11 CHANGELOG](https://github.com/hashicorp/terraform/blob/v1.11/CHANGELOG.md) | $0 | |
| 2-1 state 버킷 (bootstrap) | 2026-11-12 | 관리자 역할로 apply: 리소스 4개 추가(예측 4: 버킷 · 버전 관리 · 공개 차단 · 수명 주기). 11:33:54 시작 → 로컬 state 저장 11:35(약 1분, 예측 1분 이내). 버킷 이름 59자(계정 전용 이름 공간 `-an`). 리뷰에서 `-an` 누락과 67자(최대 63)를 apply 전에 고침. backend 블록에 `local`을 썼다가 backend는 변수 · local을 못 써서 글자 그대로로 고침. `init -migrate-state` 첫 시도는 로그인 만료(`login session has expired`)로 backend 연결 단계에서 멈춤(변경 없음) → 다시 로그인 후 성공. 버킷에 `bootstrap/terraform.tfstate` 8,483B, 로컬 `terraform.tfstate`는 0B로 비워지고 `.backup`에 옮기기 전 내용 8,483B가 남음. 옮긴 뒤 `plan` = `No changes`(S3의 state를 읽음), 로컬 사본 두 개는 지움 | 약 $0 | 1회 적용, destroy 안 함([ADR-025](04-decisions.md#adr-025)) |
| 2-1 GitHub OIDC 역할 (bootstrap) | 2026-11-12 | 관리자 역할로 apply: 리소스 2개 추가(예측 2: OIDC 공급자 · 역할), 12:38:15 시작 → state 저장 12:38:29(14초). 신뢰 조건은 이 저장소 main 브랜치만, `sub`는 2026-07-15 이후 만든 저장소의 불변 형식(`OWNER@ID/REPO@ID`). 권한 정책 없이 손으로 실행한 OIDC check(12:44, job 7초)가 역할을 받고 `get-caller-identity` = `arn:aws:sts::248563009287:assumed-role/hotel-booking-aws-v2-github-deploy/GitHubActions`(예측과 같음). 리뷰에서 `Action`에 `"allow"`(Effect 값)를 쓴 것을 apply 전에 `sts:AssumeRoleWithWebIdentity`로 고침. main 밖 브랜치에서 거부되는지는 확인 안 함 | $0 (IAM 무료) | 권한 정책은 2-2에서 리소스 이름이 정해질 때 추가([ADR-026](04-decisions.md#adr-026)) |
| 2-1 예산 알림 (bootstrap) | 2026-11-12 | 콘솔 예산(월 $50, 실제 50 · 80 · 100% + 예측 100%)을 import 블록으로 가져옴. `plan -generate-config-out`이 만든 설정에 `metrics`만 있고 짝인 `filter_expression`이 없어 plan 실패 → `metrics`를 빼자 plan이 실제 값을 지우려 함(1 to change) → `ignore_changes`로 해결. 생성 설정에서 지운 줄(`account_id`, 기간, 빈 태그 · SNS 목록)은 차이 없음. 최종 plan `1 to import, 0 to change`(예측 같음), apply 뒤 state 저장 13:06:43(state 버전 시각). apply 뒤 import 블록을 빼고 plan해도 `No changes`. 이메일은 커밋하지 않는 `terraform.tfvars` | $0 | [ADR-027](04-decisions.md#adr-027). 2-1 bootstrap 끝 |
| 2-2 평소 사용자 state 권한 | 2026-11-12 | 평소 그룹 인라인 정책([legacy-operator-policy.json](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/iam/legacy-operator-policy.json))에 state 버킷 권한 추가: ListBucket(버킷, 조건 없음), state Get · Put과 잠금 파일 Get · Put · Delete는 seoul · global · tokyo 경로만. 리뷰에서 `*/terraform.tfstate`(bootstrap도 걸림)와 잠금 경로 `terraform.tfstate/*.tflock`(실제 이름은 `terraform.tfstate.tflock`)을 반영 전에 고침. 관리자 역할로 `get-group-policy` 백업 → `put-group-policy` 반영. 평소 사용자로 14:34 확인: `:user/`, 목록 `["bootstrap/terraform.tfstate"]`, bootstrap state HeadObject 403, 아직 없는 seoul state 404(예측 4개 모두 같음) | $0 | [ADR-028](04-decisions.md#adr-028). 쓰기 · 잠금은 seoul 첫 plan에서 확인 |
| 2-2 ECS 실행 역할 (bootstrap) | 2026-11-12 | 관리자 역할로 apply: 2개 추가(예측 2: 역할 · 인라인 정책), state 저장 15:30:08(state 버전 시각). 신뢰 정책은 `ecs-tasks.amazonaws.com`. 권한은 관리형 정책 대신 직접: 토큰 `*`, ECR 받기 3개는 저장소 ARN, 로그 2개는 `log-stream:*` ARN, 각각 서울 · 도쿄 2줄. `get-role-policy`로 statement 3개와 ARN 확인. 리뷰에서 `jsondecode`(→ `jsonencode`), 액션 2개의 `ecr:` 빠짐, 도쿄 로그 줄에 ECR ARN이 복사된 것을 apply 전에 고침 | $0 (IAM 무료) | [ADR-029](04-decisions.md#adr-029), [ADR-030](04-decisions.md#adr-030). 이미지 받기 · 로그 쓰기는 seoul 첫 태스크에서 확인 |
| 2-2 GitHub 배포 역할 권한 (bootstrap) | 2026-11-12 | 관리자 역할로 apply: 1개 추가(예측 1: 인라인 정책), state 저장 16:08:46(state 버전 시각). `get-role-policy`로 statement 7개 확인(ECR 로그인 · 이미지 넣기, 태스크 정의 등록, 스키마 태스크 실행 · 확인, 서비스 교체 · 상태, 실행 역할 PassRole). 서울 · 도쿄 두 리전. 리뷰에서 태스크 정의 ARN의 서비스 자리 `logs` → `ecs`, 패밀리 `*` → 앱 · 스키마 두 개로 고침 | $0 (IAM 무료) | [ADR-026](04-decisions.md#adr-026). 실제 권한은 첫 CD 실행에서 확인 |
| 2-2 서비스 연결 역할 (bootstrap) | 2026-11-12 | 관리자 역할로 `list-roles`(경로 `/aws-service-role/`) 확인: ECS · ELB · RDS · App Auto Scaling(ECS) 4개는 이 프로젝트 전(2026-04-13~05-28)에 생겨 있었고, ECR 복제 · CloudFront VPC Origin은 없음. 예측(4개 모두 없음) 틀림. 첫 실행은 Git Bash가 `/aws-service-role/`을 `C:/Program Files/Git/aws-service-role/`로 바꿔 ValidationError → `MSYS_NO_PATHCONV=1`로 해결. 6개를 `for_each`로 두고 있는 4개는 `import` 블록으로 가져옴: plan `4 to import, 2 to add`, apply `4 imported, 2 added`(둘 다 예측과 같음). SLR 2개 생성 16:39:15(CreateDate) → state 저장 16:39:18(state 버전 시각). import 블록 6개를 모두 주석 처리한 뒤 plan `No changes` | $0 (IAM 무료) | [ADR-032](04-decisions.md#adr-032). 복제 설정 없이 ECR 복제 SLR만 먼저 만들 수 있음을 확인. seoul · global 첫 apply는 SLR 때문에 막히지 않음. apply 시작 시각은 기록 못 함 |
| 2-2 seoul 뼈대 (모듈 연결 · state 잠금) | 2026-11-12 | 리소스 0개로 `infra/seoul`(버전 범위 · backend · provider 리전을 파일에 고정)과 `modules/regional`(provider 요구 조건 `>= 6.0`만, provider 블록 없음)을 만들고 평소 사용자로 init · plan. init: 모듈 설치, 루트 `~> 6.0`과 모듈 `>= 6.0`을 합친 조건(`>= 6.0.0, ~> 6.0`)으로 aws v6.73.0 설치(예측 6.x). plan `No changes`(예측과 같음), 잠금 오류 없음. 그 뒤 `seoul/` 아래 객체 0개(예측 0, 잠금 파일이 남지 않았고 plan은 state를 쓰지 않음). 리뷰에서 backend region을 서울로 바꾼 것(버킷은 도쿄), provider 블록 누락, 모듈 버전 `"6.0"`(연산자 없음 = 6.0.0만)을 실행 전에 고침. 객체 수는 처음에 `--query KeyCount`로 봐서 `null`(CLI가 페이지를 합칠 때 `KeyCount`를 버림) → `--no-paginate`로 다시 확인 | $0 (리소스 없음) | [ADR-011](04-decisions.md#adr-011). [ADR-028](04-decisions.md#adr-028)의 잠금 쓰기 · 지우기와 state 읽기(없음) 확인. state 쓰기는 네트워크 apply에서 |
| 2-2 평소 권한을 고객 관리형으로 (bootstrap) | 2026-11-13 | 관리자 역할로 apply 2회. ① 13:10: 정책 2개 + 그룹 연결 2개(4 추가, 예측 4), 정책 생성 13:10:19, state 13:10:21. 기존 인라인 `legacy-operator-policy`는 13:05 · 13:11 백업 뒤 삭제. 그룹 인라인에 남은 `AssumeAdminRolePolicy`는 관리자 전환 권한이라 유지. ② 13:20: "작업 단계 정책만 붙이기"로 바꿔 legacy 정책 교체(설명 변경) + legacy 연결 떼기(1 추가 · 2 삭제, 예측과 같음), state 13:20:32. 그룹에는 v2만 연결됨을 확인 | $0 (IAM 무료) | [ADR-038](04-decisions.md#adr-038). count를 붙이며 `moved` 블록으로 기존 연결을 옮김 |
| 2-2 서울 ① 네트워크 | 2026-11-13 | 평소 사용자(v2 정책만)로 plan 21 · apply 21(예측 21: VPC 1, 서브넷 6, IGW 1, EIP 1, NAT 1, 라우트 테이블 4, 연결 6, S3 게이트웨이 1). 14:14:32 시작 → 14:16:37 끝(2분 5초), NAT 생성 14:14:44라 대부분 NAT 대기. state 14:16:38 저장(객체 1, `state list` 22줄 = 리소스 21 + data 1). az3 앱 안내판: local, `0.0.0.0/0` → az1 NAT(`nat_count = 1`이라 공유), S3 주소 목록 → 게이트웨이. 이 계정은 apne2-az1 = 2a, apne2-az3 = 2c. 리뷰에서 객체 vs ID(`.id` 누락), count에 목록, vpc_id에 CIDR, public · app 연결 뒤바뀜(NAT가 자기 자신으로 나가 출구 전부 막힘), 공용 모듈의 default(도쿄 대역 · 서울 AZ), `min(…)-1`(0번에서 -1)을 apply 전에 고침 | NAT + IP $0.064/시간 (켜 둔 채 ALB · ECS로 진행) | [ADR-033](04-decisions.md#adr-033) · [ADR-034](04-decisions.md#adr-034). [ADR-028](04-decisions.md#adr-028)의 평소 사용자 state 쓰기 · 잠금 모두 확인 |
| 2-2 ECR 저장소 · 도쿄 복제 (bootstrap) | 2026-11-13 | 관리자 역할로 plan 5 · apply 5(예측 5: 저장소 서울 · 도쿄 2, 수명 주기 2, 복제 설정 1). 14:56:53 → 14:57:11(18초), 저장소 생성 14:57:09 · 14:57:10. 두 저장소 모두 태그 불변 · 올릴 때 스캔 · 최근 10개만 남김, 복제 규칙은 서울 → 도쿄(이름 앞부분 필터). 서울용 provider alias(`aws.seoul`)를 bootstrap에 추가. 리뷰에서 저장소 이름에 리소스 종류(`aws_ecr_repository`)를 넣은 것을 `local.project_name`으로 고침 | 이미지 보관 GB당 월 $0.10 × 2리전 (아직 이미지 없음) | [ADR-040](04-decisions.md#adr-040). 도쿄로 복제되는지는 첫 이미지 push 때 확인 |
| 2-2 CD 1부: 빌드 · 서울 ECR push | 2026-11-13 | [cd.yml](https://github.com/yubin05/hotel-booking-aws-v2/blob/d04aad9257eb038e2eb3446131102b9de7aadf5e/.github/workflows/cd.yml)을 손으로 실행(main, 배포 역할 OIDC): 15:01:31 → 15:02:20(49초) 성공. 서울 ECR에 `76645fc` push 15:02:16(압축 크기 63.4MB), 도쿄 복제본 15:02:25(**약 8초**). 예측(push 1개, 몇 분 안에 복제)과 같고 복제는 예측보다 빠름. 저장소가 태그 불변이라 같은 커밋이면 빌드를 건너뛰게 함 | 이미지 보관 리전당 월 약 $0.06(63MB × 최근 10개) | [ADR-040](04-decisions.md#adr-040). 배포 역할의 ECR push 권한(ADR-026)이 실제로 동작함을 확인 |
| 2-2 앱 비밀값 금고 (bootstrap) | 2026-11-13 | 관리자 역할로 plan · apply: 4 추가 · 1 변경(예측과 같음: 금고 2 + 값 넣기 2, 실행 역할 정책에 `ReadAppSecrets`). 15:46:03 → 15:46:21(18초), 금고 생성 15:46:20, state 15:46:22. `jwt-secret` · `db-app-password` 모두 도쿄 복제본 InSync. plan에 임시 비밀번호가 `Opening` → `Closing`으로만 나타남. **state를 열어 보니 금고 값 칸은 비어 있고(`secret_string` 빈 값, `secret_string_wo` 없음) `wo_version: 1`만, random 리소스는 아예 없음** → 비밀값이 장부에 남지 않음을 확인. random provider 3.9.1 추가 | 금고 2 + 복제본 2 × 월 $0.40 | [ADR-041](04-decisions.md#adr-041). 카카오 키 금고는 알림 단계에서(값을 사람이 넣음) |
| 2-2 서울 ② 내부 ALB · ECS | 2026-11-13 | 평소 사용자로 plan 12 · apply 12(사용자 예측 4: 태스크 2개는 서비스가 띄워 Terraform 리소스가 아니고, ALB는 리스너 · 대상 그룹 · 보안 그룹 · 규칙이 따로라 차이 남). 첫 plan은 금고 주소 조회(`data aws_secretsmanager_secret`)가 `secretsmanager:GetResourcePolicy` 권한 없음으로 멈춰 10개만 나옴 → v2 정책에 추가(관리자 apply, 정책 버전 v3) 후 12. apply 16:21:24 → 16:23:57(2분 33초). 태스크 16:24:19 · 16:24:54 시작, 대상 등록 16:24:53 · 16:25:26, 16:25:37 steady state. 대상 2개 healthy(2a · 2c에 하나씩), 두 태스크 로그 `listening on 3000`(비밀값이 없으면 종료하는 앱이라 금고 주입 확인). 멈춘 태스크 없음. 로그 조회 첫 시도는 Git Bash 경로 변환으로 실패 → `MSYS_NO_PATHCONV=1` | ALB $0.0225 + Fargate 2개 $0.0568 + NAT $0.064 /시간 | [ADR-039](04-decisions.md#adr-039) · [ADR-041](04-decisions.md#adr-041). [ADR-029](04-decisions.md#adr-029)의 실행 역할 이미지 받기 · 로그 쓰기 확인. 관리자 전환은 `aws login --profile admin` + `AWS_PROFILE=admin`으로 |
| 2-2 서울 ③ RDS · 태스크 재배포 | 2026-11-13 | 첫 plan 전에 v2 정책에 RDS 권한, RDS가 만드는 관리자 금고(`rds!*`) CreateSecret · TagResource, `kms:DescribeKey` 추가(관리자 apply 17:21:52, 정책 v4). 평소 사용자로 apply `5 added, 0 changed, 1 destroyed`(사용자 예측과 같음: 보안 그룹 · 규칙 · 서브넷 그룹 · DB 4개 + 태스크 정의 교체 1. 환경 변수가 바뀐 태스크 정의는 고칠 수 없어 새로 만들고, 서비스는 `ignore_changes`라 그대로). 17:23:52 → 17:31:53(8분, 예측 10분): DB 생성 17:27:39 → 첫 자동 백업 17:28:53 ~ 17:31:26(약 2분 반). available, MySQL 8.4.11, db.t4g.micro, 단일 AZ(2c), 백업 7일, 암호화, 관리자 금고 active. 서비스는 리비전 1을 계속 돌려서 `aws ecs update-service`로 리비전 2를 지정(나중에 CD가 할 일): 17:34:27 이전 태스크 연결 비우기 시작 → 17:35:56 배포 완료(약 1분 반), 대상 2개 healthy | RDS 약 $0.026/시간(09의 Multi-AZ 값의 절반) + 위 ALB · ECS · NAT | [ADR-042](04-decisions.md#adr-042) · [ADR-041](04-decisions.md#adr-041). 비밀값과 환경 변수는 태스크가 시작할 때만 들어가서, 태스크 정의를 바꿔도 새 태스크를 띄워야 반영됨 |
| 2-2 서울 destroy | 2026-11-13 | 평소 사용자로 plan 37 destroy. 17:38:33 → 17:44:34(6분): 36개를 지우고 EIP에서 `ec2:DisassociateAddress` 403으로 멈춤. RDS · `rds!` 금고 · 자동 백업은 모두 지워짐. 원인: 실행 시작 때 읽은 state에는 NAT 연결 ID가 있었고, 같은 실행에서 NAT를 지운 뒤에도 Terraform이 그 ID로 "떼기"부터 호출(CloudTrail 17:40:24). v2 정책에 추가(관리자 apply 17:49:52, 정책 v5) 후 다시 destroy 17:50:06 → 17:50:14, 1개. 이번에는 처음 읽을 때 연결이 없어 떼기 없이 바로 `ReleaseAddress`(CloudTrail 확인, "다시 떼기를 호출한다"는 예측 틀림). 끝난 뒤 state 0, VPC · EIP · NAT · RDS · 자동 백업 · ALB · ECS 클러스터 · 로그 그룹 0, 금고는 bootstrap 2개만 | 연결 없는 EIP 17:44 ~ 17:50 $0.005/시간. 오늘 서울 전체 약 $0.35 추정(NAT · IP 14:14 ~ 17:44, ALB · Fargate 16:21 ~, RDS 17:23 ~) | 평소 권한 검증은 apply만으로 끝나지 않고 destroy까지 해 봐야 함. 다음 destroy가 한 번에 끝나는지 확인 |
| 2-2 앱 저장소 분리 ③ 배포 역할 신뢰 조건 (bootstrap) | 2026-11-14 | 앱을 고객사 저장소 역할의 [hotel-booking-app](https://github.com/yubin05/hotel-booking-app)으로 분리 중(11-13 히스토리 26개 째 옮김, 첫 CI 23:42 성공). 관리자 역할로 plan · apply: 1개 변경(사용자는 처음에 예측 못 함 → "바뀐 줄 · 속한 리소스 · 이미 있나 · 그 자리 수정 가능한가" 4단계로 풀어 0 · 1 · 0, plan과 같음). `sub`를 인프라 저장소 하나 → 인프라 · 앱 저장소 목록(값 목록은 OR)으로, 역할은 그 자리 수정(`~`)이라 ARN 그대로. apply 00:00:29 시작 → state 저장 00:00:49(20초). 00:01:07 앱 저장소에서 OIDC check 실행 → 성공(11초), `get-caller-identity` = `arn:aws:sts::248563009287:assumed-role/hotel-booking-aws-v2-github-deploy/GitHubActions`(11-12와 같음. Arn은 역할 이름 · 세션 이름이라 저장소가 바뀌어도 같다) | $0 (IAM 무료) | 인프라 저장소 `sub` 줄은 ④ 정리에서 지움 |
| 2-2 앱 저장소 분리 ④ 신뢰 조건 정리 · legacy 정책 넘기기 (bootstrap) | 2026-11-14 | 이 저장소에서 `app/` · compose · 워크플로를 지운 뒤, 관리자 역할로 ④-a(`sub`에서 인프라 저장소 빼기)와 ④-b(bootstrap에서 legacy 정책 빼기)를 한 번에 apply. plan 0 추가 · 1 변경 · 1 삭제(사용자 예측 "2 변경" → 정책은 코드에서 빠지면 변경이 아니라 삭제. 그룹 연결은 count 0이라 지울 것이 없음). apply 00:46:43 시작 → state 저장 00:47:00(17초). 확인: 신뢰 조건 `sub`는 `hotel-booking-app` main 하나, 고객 관리형 정책은 `operator-v2`만 남음 | $0 (IAM 무료) | [ADR-043]((#adr-043)). legacy 정책은 고객사 저장소 `legacy/iam`에서 같은 이름으로 다시 만든다 |
| 2-2 앱 저장소 분리 ④-b legacy 정책 다시 만들기 (고객사 `legacy/iam`) | 2026-11-14 | `legacy` · 0단계 `load` · `scripts`를 히스토리째 고객사 저장소로 옮긴 뒤(커밋 85개), 관리자 역할로 고객사 저장소 [legacy/iam](https://github.com/yubin05/hotel-booking-app/tree/main/legacy/iam)에서 init(S3 `legacy-iam/terraform.tfstate`) · plan · apply: 1개 추가(사용자 예측 1, "연결을 true로 바꾸면 2" → 맞음). apply 01:03:16 시작 → 정책 생성 01:03:26 · state 저장 01:03:27(11초). 16분 전 지운 것과 같은 이름으로 바로 만들어짐. 확인: `hotel-booking-aws-v2-operator-legacy` 연결 0(평소에는 떼어 둠), `operator-v2` 연결 1. 고객사 저장소 CI(`ci.yml` 변경으로 실행) 성공 | $0 (IAM 무료) | [ADR-043]((#adr-043)). legacy 작업 날은 `attach_operator_legacy = true`로 관리자 apply. 앱 분리 완료 |
| 2-2 ③-b 스키마 태스크 · TLS 권한 (bootstrap) | 2026-11-14 | 관리자 역할로 apply: 0 · 2 · 0(사용자 예측 생략, "plan에서 확인"), 끝 20:36:42 · state 저장 20:36:43. ① ECS 실행 역할 인라인 정책에 `ReadRdsMasterSecret`(서울 · 도쿄 `rds!db-*` 읽기, [ADR-044](04-decisions.md#adr-044)) ② 평소 정책 `operator-v2`에 `ReadEcrImages`(이미지 자동 선택, [ADR-039](04-decisions.md#adr-039) 변경 메모)와 `Rds`에 파라미터 그룹 권한 5개([ADR-045](04-decisions.md#adr-045)), 5,062 / 6,144자. 정책 버전이 이미 5개(한도)였는데 provider가 새 버전 직전에 기본이 아닌 가장 오래된 v1을 지우고 v6을 기본으로 만들었다(`list-policy-versions`로 v2~v6 확인) | $0 (IAM 무료) | plan에서 `Rds` 권한이 전부 `-`로 보였지만, statement 목록을 자리 순서로 비교해서다(앞에 `ReadEcrImages`를 끼움). 빠진 권한 없음 |
| 2-2 서울 ④ 스키마 태스크 · DB TLS (apply · migrate · 확인) | 2026-11-14 | 평소 사용자로 plan 39 add(어제 37 + 스키마 태스크 정의 + 파라미터 그룹, 사용자 예측 생략). plan 성공 자체가 `ReadEcrImages` 확인(데이터 소스가 plan 때 ECR 조회). apply 20:41:48 → 20:51:01(9분 13초), 이미지는 가장 최근 push인 `33146c2`가 자동 선택됨. 스키마 태스크(관리자로 `run-task`, 평소 정책엔 RunTask 없음): 호출 21:04:00 → 시작 21:04:19 → 스키마 21:04:20 → 시드 · 운영 규모 데이터 14.9초(로컬 · CI 6~7초, 1단계 t3.micro 12초) → 종료 21:05:02, 종료 코드 0, 행 수 숙소 1,010 · 객실 5,030 · 회원 20,003 · 예약 100,013 · 리뷰 50,013. 앱 태스크 정의로 1회용 확인 태스크(컨테이너 안에서 서버를 켜고 `localhost` 호출, ALB는 Internal이고 입구가 없어 밖에서 못 부름): `/api/health/deep` = ok, `/api/hotels` = 숙소 목록, 종료 코드 0 | NAT · IP $0.064 + ALB $0.0225 + Fargate 2개 $0.0568 + RDS $0.026 = 약 $0.17/시간 | 가설 3개 해소: RDS 관리 금고의 JSON 키 `password`, 마스터의 `GRANT`, RDS 인증서 · 주소 확인 TLS([ADR-044](04-decisions.md#adr-044) · [ADR-045](04-decisions.md#adr-045)) |
| 2-2 서울 destroy (④ 뒤) | 2026-11-14 | 평소 사용자로 39 destroy, 21:09:13 → 21:15:45(6분 32초), **한 번에 끝남**(사용자 예측 "권한을 다 붙였으니 한 번에" 맞음). 어제 403이 났던 EIP 떼기도 막히지 않았다 | 오늘 서울 약 $0.10 추정(20:42 ~ 21:16, 약 34분) | 어제의 남은 가설 "다음 destroy가 403 없이 한 번에 끝나는지" 확인. 지운 뒤 관리자로 조회(다시 로그인 뒤): RDS · 파라미터 그룹 · 서브넷 그룹 · 자동 백업 · 스냅샷 · `rds!` 금고 · VPC · NAT · EIP · ALB · ECS 클러스터 · 활성 태스크 정의 · 로그 그룹 · 떠도는 네트워크 카드 모두 0 |
| 2-2 CD 2부 권한 (bootstrap) | 2026-11-14 | 관리자 역할로 apply: 0 · 1 · 0, 23:32:49 → 23:33:14. 배포 역할 인라인 정책에 `ecsDescribeTaskDefinition`(`*` + 서울 · 도쿄 리전 조건)과 `logsReadMigrate`(`migrate/*` 스트림만) 추가([ADR-046](04-decisions.md#adr-046)). 이번 plan은 새 statement만 `+`로 나왔다(끼워 넣기만 해서). 저녁 plan에서 `Rds`가 전부 `-`로 보인 건 옮기면서 동시에 고쳤기 때문 | $0 (IAM 무료) | — |
| 2-2 CD 2부 (자동 배포) 시험 | 2026-11-14 ~ 15 | ① 인프라 없을 때(서울 내림): 앱 저장소 push(`d66ea28`) → CI `test` 통과 → 같은 실행의 `deploy`가 `cd.yml`을 불러냄 → OIDC 로그인 성공(재사용 워크플로에서도 `sub` = main) → 이미지 push → "서울 인프라 없음"으로 성공 종료. 액션을 해시로 고정한 뒤(`7e498d5`)도 같은 결과. ② 전체 경로: seoul apply 39개 23:33:44 → 23:43:20(9분 36초) 뒤 CD를 손으로 실행, 00:06:55 → 00:11:46(4분 51초). 이미지 있음 → 건너뜀(2초), 서비스 확인(1초), 레시피 개정 `app:5` · `migrate:3`(4초), 스키마 태스크 65초(시드 · 운영 규모 데이터 14.5초, 종료 코드 0, 로그가 GitHub 요약에 찍힘, 사용자 예측 "빈 DB라 넣음" 맞음), 롤링 교체 3분 26초(서비스 `app:5`, 2/2, `COMPLETED` 재확인). 교체 3분 26초 내역(ECS 이벤트): 새 태스크 2개가 23초 간격으로 따로 뜸(약 40초) → 상태 검사 통과 약 45초(30초 간격 × 연속 3번) → 옛 태스크 연결 정리 30초씩 두 번(약 70초) → ECS 안정 판정 약 35초 → 대기 명령 감지(15초 간격) | 서울 약 $0.17/시간 × 약 40분(23:34 ~ 00:14) ≈ $0.11 | 손으로 실행해 "커밋부터 반영까지"는 의미 없는 값이라 다음 실제 push에서 잰다. 교체를 줄이려 대상 그룹을 10초 간격 × 2번, 연결 정리 10초로 바꿈(다음 배포에서 재측정, 예상 1분 반 ~ 2분은 가설) |
| 2-2 서울 destroy (CD 2부 뒤) | 2026-11-15 | 평소 사용자로 39 destroy, 00:13:51 → 00:19:13(5분 22초), 한 번에 끝남. 관리자로 잔여 조회: RDS · 파라미터 그룹 · `rds!` 금고 · VPC · NAT · EIP · ALB · 자동 백업 0. 태스크 정의는 Terraform이 등록한 `app:4` · `migrate:2`만 INACTIVE가 되고, CD(배포 역할)가 등록한 `app:5` · `migrate:3`은 ACTIVE로 남음([ADR-046](04-decisions.md#adr-046) 예상대로, 무료) | 위 행에 포함 | `list-task-definitions --family-prefix`는 접두어가 아니라 패밀리 이름 전체를 받는다. 앞선 잔여 확인의 "활성 태스크 정의 0"은 `hotel-booking-aws-v2`로 조회해 늘 0이 나오는 방법이었다(그때는 CD 개정판이 없어 결과는 같음) |
| 2-2 Route 53 영역 (bootstrap) | 2026-11-15 | 관리자 역할로 apply: 1 · 0 · 0(사용자 예측 생략), 01:40:27 → 01:41:11. 새 네임서버 4개를 가비아에 넣음. 사전 조회에서 `vundle34.cloud`가 지워진 Route 53 영역으로 위임된 채(주인 없는 위임) 전 세계에서 조회 실패하던 것을 발견([ADR-048](04-decisions.md#adr-048)) | 월 $0.50(크레딧, 2027-04-11 만료) | `.cloud` 등록소 반영 01:52:30(가비아 변경 뒤 약 10분 안, 2분 간격 확인), 같은 때 공용 DNS 8.8.8.8 · 1.1.1.1에서도 새 네임서버 · SOA 조회 성공. 가비아 안내의 "최대 48시간"보다 훨씬 빨랐다 |
| 2-3 global 권한 (bootstrap) | 2026-11-15 | 관리자 역할로 apply: 2 · 0 · 0(사용자 예측 생략, Claude 예상과 같음), 03:53:47 → 03:54:01. `operator-edge` 정책(1,750자) 생성 + 평소 그룹 연결 | $0 (IAM 무료) | [ADR-053](04-decisions.md#adr-053) |
| 2-3 서울 apply (ALB HTTPS) | 2026-11-15 | 평소 사용자로 42 · 0 · 0(Claude 예상과 같음), 03:55:47 → 04:04:59(9분 12초). ALB 인증서 발급 대기가 더해졌지만 전과 같은 시간 | 켠 시간만큼 | [ADR-049](04-decisions.md#adr-049) |
| 2-3 global apply (첫 브라우저 접속) | 2026-11-15 | 평소 사용자로 8 · 0 · 0(예상과 같음), 04:19:20 → 04:32:14(12분 54초, 자원별 시간은 기록 못 함). `https://hotel.vundle34.cloud` 200. 확인: HTTPS 원본 이름 가설 맞음, ALB 443 입구, 캐시(`index.html` no-cache · JS 1년, 두 번째 `Hit`), 보안 헤더, GET의 `Authorization` 전달(가설 맞음), WAF 공격 모양 4종 403 · 한글 통과, 로그인 한도는 110건 통과 뒤 약 41초부터 403([10 5절](10-security.md#5-apply-뒤-확인할-것)). apply 직후에는 DB API가 500(`Access denied for user 'app'`): 새 RDS에 `app` 계정을 만드는 migrate를 CD가 아직 안 돌렸기 때문. CD 실행 뒤 정상 | 켠 시간만큼(WAF 시간 단위) | [ADR-050](04-decisions.md#adr-050) · [051](04-decisions.md#adr-051) · [052](04-decisions.md#adr-052) |
| 2-3 CD 실측: 커밋부터 반영까지 | 2026-11-15 | 앱 `0f47150`(seed-volume 문구 수정) push 04:45:00 → 배포 완료 04:52:12, **7분 12초**. CI `test` 82초, `deploy` 5분 41초(이미지 빌드 · push 22초, 레시피 4초, migrate 73초, 롤링 교체 223초). 새 문구가 사이트에 보임. **롤링 교체 3분 43초로 예상(약 2분) 틀림**(전 3분 26초). 태스크 기록(관리자 `describe-tasks`)으로 나눈 시간: ① 교체 요청 → 첫 새 태스크 생성 약 24초 ② 새 태스크 준비(자리 · 이미지 4초 · 시작) 29~41초, **두 번째 새 태스크는 첫 번째보다 34초 늦게 생성**(동시에 안 띄움) ③ 옛 태스크는 새 태스크가 건강해진 뒤 하나씩 멈춤 ④ 옛 태스크 멈춤: 멈춤 시작 → 컨테이너 종료 35 · 45초(연결 정리 10초 포함, 종료 코드 0이라 강제 종료는 아님) → 완전히 멈춤까지 23 · 26초 더. 마지막 옛 태스크가 완전히 멈춘 04:52:03에 배포 완료. 예상에 없던 것: 새 태스크를 하나씩 띄움(서비스의 가용 영역 재배치는 `ENABLED`이지만, [문서](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-rebalancing.html)상 안정 상태 뒤 쏠림을 고치는 기능이고 배포 순서를 바꾼다는 내용은 없어 원인일 가능성은 낮음. AZ 장애 뒤 균형을 되찾는 기능이라 끄지 않음), 멈춤 시작 → 컨테이너 종료 35 · 45초(07:23 강제 재배포에서 종료 로그로 나눔: 연결 정리 시작 → SIGTERM 26~30초, **앱은 SIGTERM과 같은 밀리초에 연결 정리를 끝냄**, SIGTERM → 컨테이너 종료 11초. "앱이 끝나기까지 30초" 가설은 틀림, 시간은 SIGTERM 전 ECS가 ALB에서 빼는 대기), 컨테이너 종료 뒤 Fargate 정리 약 25초 | - | [ADR-046](04-decisions.md#adr-046) |
| 2-3 도쿄 apply (전환 PoC 준비) | 2026-11-15 | 관리자 역할로 bootstrap apply(v2 · edge 정책에 도쿄 리전 · ARN 추가, v2 5,405자) 05:14:55 → 05:15:10. tokyo 42개 apply 05:17:16 → 05:26:44: **터미널에 남은 관리자 프로필로 돌다 관리자 세션이 만료**돼 마지막 state 저장이 `ExpiredToken`으로 실패. apply 중 중간 저장된 state에 39개(RDS 9분 12초 포함)가 남아 있어, 평소 사용자로 plan → 3개(태스크 정의 2 · 서비스) 05:37:09 → 05:37:36. ECS 안정 05:38:56. 도쿄 39개의 생성 권한(평소 사용자)은 미확인 → 5단계 드릴에서 확인. 이후 관리자 명령은 `export` 대신 명령 앞에만 붙임 | 켠 시간만큼 | [ADR-035](04-decisions.md#adr-035) |
| 2-3 도쿄 전환 PoC: 서울 → 도쿄 | 2026-11-15 | 첫 전환 plan이 **통로를 제자리 수정**(1 · 1 · 1)으로 나옴 → 이대로면 손님이 도쿄로 먼저 가고 도쿄 입구는 나중에 열려 끊김(도쿄의 CloudFront 보안 그룹은 통로가 도쿄에 생겨야 생김) → 취소. `terraform_data`(원본 리전) + `replace_triggered_by`로 교체를 강제하고 `create_before_destroy` · `depends_on`으로 "새 통로 · 새 입구 → 원본 교체 → 옛 것 삭제" 순서를 보장. `terraform_data`는 처음 생길 때 신호가 안 가서 서울 값으로 먼저 apply(1 · 0 · 0, 05:50:45 → 05:51:00). 전환 apply 2 · 2 · 2, **05:53:35 → 06:10:45(17분 10초)**. 1초 간격 `/api/health` 1,572건 중 **오류 0**, 응답 리전은 **06:03:17에 서울 → 도쿄로 한 번** 바뀜(시작 후 9분 42초, 뒤 7분 28초는 서울 정리). 예측: 사용자 15분 · 0초, Claude 10~20분 · 0초 | 켠 시간만큼 | [ADR-035](04-decisions.md#adr-035) |
| 2-3 도쿄 전환 PoC: 도쿄 → 서울 (1차 방식) | 2026-11-15 | 2 · 2 · 2 apply 06:14:32 → 06:17:18 **멈춤**: 새 서울 통로 "완료"(2분 6초) 직후 서울 CloudFront 보안 그룹을 찾다 `no matching EC2 Security Group`. 관리자로 CloudTrail(이벤트 기록, 무료) 확인: 보안 그룹은 **3초 뒤 06:17:21**에 CloudFront 서비스 역할(`AWSServiceRoleForCloudFrontVPCOrigin`, 세션 이름 `209479269603`)이 생성. 도쿄는 통로 요청 65초 뒤였다. 원본 교체 전 단계라 손님 영향 없음. 다시 apply 1 · 1 · 2 06:25:19 → 06:34:22. 1초 간격 1,133건 오류 0, 06:26:53에 서울로 한 번 바뀜. CloudTrail의 낯선 사용자 이름은 침투가 아니라 서비스 연결 역할의 세션이었다 | 켠 시간만큼 | [ADR-035](04-decisions.md#adr-035) |
| 2-3 도쿄 전환 PoC: 2차 방식(통로를 리전 루트로) | 2026-11-15 | 보안 그룹 시간차 대안 검토(5초 확인 · 3분 대기 · CloudFront IP 목록 · Lambda) 뒤 통로를 regional 모듈로 옮김. 서울 루트 `import`(1 imported) 06:51:22 → 06:51:32, 도쿄 루트 통로 1개 06:52:03 → 07:01:32(9분 29초, 그사이 도쿄 보안 그룹 생성 확인), global에서 통로는 `removed`(지우지 않고 장부에서만 뺌) + 옛 스위치 삭제 0 · 0 · 1 07:02:44 → 07:03:00. **서울 → 도쿄** `-var active_region=ap-northeast-1` 1 · 1 · 1 07:04:04 → 07:05:31(1분 27초), 103건 오류 0, 07:05:04에 도쿄로 바뀌고 4초간 오락가락(엣지 반영 중). **도쿄 → 서울** 1 · 1 · 1 07:06:46 → 07:07:47(1분 1초), 74건 오류 0, 07:07:23에 서울로 한 번 바뀜. 예측: 사용자 "비슷하거나 0초"(오류 0초 맞음) | 켠 시간만큼 | [ADR-035](04-decisions.md#adr-035) · [049](04-decisions.md#adr-049) |
| 2-3 CD 실측 2회차 + 종료 로그 | 2026-11-15 | 앱 `09626fe`(로그인 잠금) · `a06f243`(종료 로그) push 07:14:56 → 배포 완료 07:21:28, **6분 32초**(CI 67초, 이미지 27초, 레시피 5초, migrate 62초, 롤링 209초). 실제 사이트에서 없는 이메일 로그인 5번 401 → 6번째 429. 옛 태스크는 옛 이미지라 종료 로그가 없어, 같은 이미지로 강제 재배포(`--force-new-deployment`, 07:23:53 → 안정 07:27:16). 옛 태스크 2개: 멈춤 시작 → ALB 연결 정리 시작 2 · 11초 → SIGTERM 26 · 30초(연결 정리 10초 + ECS 확인 대기, 가설) → 앱 연결 정리 0초 → 컨테이너 종료 11초 → 완전히 멈춤 26 · 27초(Fargate). 도쿄 destroy 43개 07:14:11 → 07:23:58(9분 47초, 통로 삭제 대기로 서울보다 김, VPC는 1초에 지워져 CloudFront 보안 그룹이 막지 않음 → ADR-052 가설 이번엔 안 일어남). 잔여 0 | 켠 시간만큼 | [ADR-046](04-decisions.md#adr-046) · [054](04-decisions.md#adr-054) |
| 2-3 global · 서울 destroy | 2026-11-15 | global 7개 07:29:40 → 07:34:06(4분 26초, CloudFront 끄고 지우기가 대부분). 서울 plan이 43이 아니라 **42**: 서울 · 도쿄 인증서 이름이 같아 확인 레코드를 같이 썼고, 도쿄 destroy가 그 레코드를 지워 서울 장부에서 빠짐 → 인증서 이름을 리전마다 다르게 바꿈([ADR-049](04-decisions.md#adr-049)). 서울 42개 07:37:23 → 07:46:41(**9분 18초**, 통로 삭제 대기로 전보다 3~4분 김). 평소 사용자로 잔여 조회: VPC · CloudFront 보안 그룹 · EIP · NAT · RDS · ALB · ECS 0, Route 53은 NS · SOA만 | $0 | [ADR-052](04-decisions.md#adr-052) |
| 2-3 사진 ① 창고 · 복제 (bootstrap) | 2026-11-16 | 관리자 역할로 plan 11 · 1 · 0(사용자 예측 11 · 1 · 0, 맞음: 버킷 · 버전 관리 · 공개 차단 · 수명 주기 각 서울 · 도쿄 2개, 복제 역할 · 역할 정책, 복제 설정 / 변경은 `operator-edge`). apply 12:35:24 → 12:36:35(1분 11초, 확인 입력 포함). 조회: 두 버킷 버전 관리 Enabled, 공개 차단 4개 모두 켬, 옛 버전 7일 삭제 규칙, 기본 암호화 SSE-S3(AES256, 따로 설정 안 해도 켜짐), 비어 있음. 복제 규칙 `seoul-to-tokyo` Enabled, 지운 표시 복제 Enabled, 대상 도쿄 버킷. `operator-edge` 기본 버전 v3(OAC 권한 · `PhotoBucketPolicyOnly` 추가), 그룹 연결 1. 계정 전용 이름 공간 버킷끼리도 복제 설정은 받아들여짐(실제 복제는 사진을 올릴 때 확인) | $0 (빈 버킷) | [ADR-055](04-decisions.md#adr-055) |
| 2-3 사진 ② 줄이기 · 올리기 · 도쿄 복제 | 2026-11-16 | 원본 11장(사람이 찍힌 4장은 교체)을 `npm run resize`로 640 · 1200 WebP(3:2) 22개로 줄임 → `npm run stage`로 사진 칸 7,050개 × 2 = 14,100개(하드 링크) → 관리자 `aws s3 sync` 13:07:29 → 13:08:27(**58초**). 13:09:08 조회에서 도쿄도 14,100개 · 1,088,089,320바이트로 서울과 같음 → 마지막 파일(13:08:28)부터 **40초 이내** 복제 완료. 원본 `COMPLETED` · 사본 `REPLICA`, `image/webp` · 1년 Cache-Control도 복제됨. 처음 받은 교체 사진 4장이 페이지 미리보기(폭 629~1170px, AVIF)라 큰 판이 흐려지는 것을 올리기 전에 발견 → Download 버튼으로 다시 받고, 원본이 1200×800보다 작으면 스크립트가 멈추게 함 | 처음 한 번 약 $0.21, 보관 월 약 $0.05 | [ADR-055](04-decisions.md#adr-055). 사본 수정 시각이 원본과 같아 파일별 지연은 못 잼(상한만) |
| 2-3 전체 올리기(사진 포함) · 재현성 확인 | 2026-11-16 | 평소 사용자로 서울 43개 13:13:50 → 13:25:02(11분 12초, 확인 입력 포함, 런북과 같은 수), global 13개(앱 7 + 사진 6) 13:26:07 → 13:30:28(4분 21초, 이번엔 예측 없이). CD(이 PC에 설치한 `gh`로 Claude가 실행, `02096dc`) 13:34:48 → 13:39:51(5분 3초: 이미지 있음 → 빌드 건너뜀, migrate 67초, 롤링 207초). 행 수 숙소 1,010 · 객실 5,030 · 회원 20,003 · 예약 100,013 · 리뷰 50,013(지난번과 같음), 시드 13.8초. `/api/health/deep` ok, 숙소 API가 `img` 주소를 줌(운영 규모 n번 → `hotels/n+10`). 사진: HTTPS 200 · `image/webp` · 1년 캐시 · HSTS, http → 301, 같은 주소 GET 3번 Miss → Miss → Hit(0.145 → 0.070 → 0.052초, 둘째 Miss는 같은 엣지 안의 다른 서버로 봄, 가설), `?x=1`도 Hit(쿼리 문자열이 캐시 키에서 빠짐), 없는 파일 403, S3 직접 요청 403, `x-amz-replication-status: COMPLETED`(서울 원본)가 CloudFront를 거쳐서도 보임, 두 배포 모두 WAF 연결. 재현성 ① ③ ④ ⑤(curl) 확인, ② 다 올린 뒤 다시 plan: 서울 · global 모두 No changes → **재현성 5가지 모두 확인** | 서울 약 $0.17/시간 | [ADR-055](04-decisions.md#adr-055) |
| 2-3 사진 원본 장애 조치 시험 | 2026-11-16 | 사용자 예측: 캐시 안 된 사진은 403. 관리자로 서울 버킷 정책 삭제 → 14:09:32 `NoSuchBucketPolicy` 확인 → 캐시 안 된 사진 3장 모두 **200 · `REPLICA`(도쿄 S3)**, 1.13 · 0.34 · 0.33초(평소 서울 Miss 0.15 ~ 0.25초보다 약 0.2초 느림: 서울 403 → 같은 요청을 도쿄로 다시). 같은 사진을 다시 요청하면 Miss → Hit(0.056초). 이미 캐시된 사진은 Hit · `COMPLETED`(엣지에서 바로 나가 창고 장애와 무관). **예측과 다른 이유:** 장애 조치 조건에 403을 넣어 CloudFront가 도쿄로 다시 보냄. 403을 빼면 예측대로 손님이 403을 받음. 되돌리기: global plan 1 · 0 · 0(바뀐 점을 잡음) → apply 14:11:01 → 14:11:25(24초), 정책에 그날 배포 ARN이 다시 들어감 → 새 사진 3장 `COMPLETED`(서울) 0.15 ~ 0.25초 | 켠 시간에 포함 | [ADR-055](04-decisions.md#adr-055). 서울 S3 리전 전체 장애(5xx · 연결 실패)는 흉내 내지 않음. 연결 실패는 기본값으로 최대 30초 뒤 넘어감(문서) |
| 2-3 global · 서울 destroy (사진 · 오토스케일링 포함) | 2026-11-16 | 평소 사용자로 global 13 destroy(앱 7 + 사진 6), 17:32:10 → 17:36:38(4분 28초, 11-15의 7개 4분 26초와 비슷: CloudFront 2개를 동시에 지움). 서울 45 destroy(43 + 오토스케일링 확장 대상 · 목표 추적 정책), 17:38:37 → 17:48:03(9분 26초). 평소 사용자로 잔여 조회: VPC · RDS · EIP · NAT · ALB · 오토스케일링 대상 · CloudWatch 경보 0, ECS 클러스터 INACTIVE, Route 53은 NS · SOA만. CloudFront 목록은 평소 권한에 없어 못 봄(global destroy 13개 완료로 갈음). 서울 켠 시간 13:13 ~ 17:48 약 4시간 35분 | 약 $0.9 (시간당 약 $0.19) | 사진 창고 · 사진은 bootstrap이라 남음 |
| 2-3 사진 ③ 브라우저가 고른 크기 | 2026-11-16 | Chrome 콘솔에서 `img.currentSrc` · 칸 폭 · 배율 조회. PC(배율 1) 홈: 8장 모두 `640.webp`(Network 탭 19 ~ 55kB). 휴대폰 흉내(iPhone, 폭 440 · 배율 3) 홈: 칸 408px(1열, 계산과 같음) × 3 = 1,224 → 8장 모두 `1200.webp`. PC에서 칸 폭이 103px로 나온 1회는 계산(홈 4열 최소 236px)과 달라 창 상태 때문으로 봄(가설), 어느 쪽이든 640이라 고칠 것 없음. 상세 화면 · 객실 칸은 다음에 올리는 날 | $0 | [ADR-055](04-decisions.md#adr-055) |
| 2-3 ECS 오토스케일링(예약 + 목표 추적) | 2026-11-16 | bootstrap 관리자 0 · 1 · 0(`operator-v2`에 오토스케일링 · CloudWatch 경보 권한, 5,753 / 6,144자) 16:28:16 → 16:28:30. 서울 평소 사용자 4 · 0 · 0(확장 대상 2 ~ 4개 · CPU 60% 목표 추적 · 예약 2개) 16:29:33 → 16:29:42, 둘 다 예측 없이. 목표 추적이 경보 2개를 만듦: 늘리기 CPU 60% 초과 1분 × 3번, 줄이기 54% 미만 1분 × 15번. 시험 이벤트 16:45 ~ 17:00 최소 4: 예약 실행 16:45:38(**+38초**) → 새 태스크 2개 시작 16:45:42 → ALB 등록 16:46:11 → 안정 16:46:29(**예약 시각부터 약 1분 반**, 실행부터 51초). 끝 예약 실행 17:00:23(+23초, 최소 2로) → 줄이기 경보(지난 몇 시간의 낮은 CPU로 16:31부터 ALARM)가 17:01:08 4 → 3, 17:02:08 3 → 2, 17:02:45 2개(17:00부터 약 2분 45초). 1분마다 하나씩 줄인 것은 대기 시간(쿨다운)이 0초로 들어가서(Terraform에서 안 적음, 문서상 ECS 기본 300초) → 줄이기 300초 · 늘리기 60초로 적음(가설값). 실행된 예약 작업은 지워지지 않고 남아 지난 이벤트는 코드에서 지움. 감시 명령은 `scripts/watch-scaling.sh`. 반영: 서울 0 · 1 · 2(대기 시간 추가 · 시험 예약 2개 삭제) 17:11:47 → 17:11:58, 조회로 대기 시간 300 · 60초, 예약 작업 0개, 태스크 2개 확인. 원본 기록: [experiments/autoscaling](experiments/autoscaling/README.md) | 서울 켠 시간에 포함(태스크 2개 추가 약 17분) | [ADR-015](04-decisions.md#adr-015). 부하가 없어 늘리기 경보 · 실제 한계는 3단계 |
| 2-3 계정 기본 보안 켜기 (security) | 2026-11-17 | 관리자 plan 37 add(예측 37). 인프라는 bootstrap만 있는 상태에서 `-var posture_check=true` apply 11:11:37 → 11:15:01: 36개 성공, us-east-1 FSBP 기준 구독만 Terraform 기본 대기 3분 초과(`PENDING`, 서울은 3분 안 `READY`). AWS가 거절한 게 아니라 기다리다 포기한 것이라 state에 `tainted`로 남음 → `READY` 확인 뒤 `untaint`, 대기를 15분으로 늘림(`timeouts`), plan No changes. 켠 직후: Config 기록 서울 · us-east-1 `SUCCESS`, 지표 이름 `ConfigurationItemsRecorded`, 트레일 첫 전달 11:18:59. **GuardDuty 체험: 서울 0일**(예전에 켠 적이 있어 기본 · S3 · RDS 로그인이 바로 과금), 도쿄 · us-east-1 30일. 서울도 끄지 않고 오늘 Config와 같이 측정(크레딧 있음). Security Hub CSPM 체험 30일(2026-12-17 종료, 콘솔 Settings → Usage) | Config 구성 항목 · 서울 GuardDuty는 켠 시각부터 과금. 하루 측정 후 기록 | [ADR-057](04-decisions.md#adr-057). GuardDuty 서울 비용은 `get-usage-statistics`로 확인 |
| 2-3 global · 서울 destroy (점검 켠 채) | 2026-11-17 | 평소 사용자로 global 13 destroy 19:13:39 → 19:18:18(4분 39초). 서울 45 destroy 19:20:09 → 19:28:54(8분 45초). 런북의 46이 아니라 45: 기본 보안 그룹을 state에 넣는 수정이 아직 apply 전이라(보안 점검 세션). Config + Security Hub 점검을 켠 채 지움 → 지울 때 찍히는 구성 항목 수는 보안 점검 세션이 docs/11(계정 보안 점검)에 기록. 잔여 조회는 하지 않음 | 서울 켠 시각 미기록(시간당 약 $0.19) | 보안 점검 외에는 쓰지 않고 켜 둠 |
| 2-3 점검 끄기 · 계정 기본값 (security) + 시연 계정 권한 (bootstrap) | 2026-11-18 | 관리자 security apply 11 · 1 · 10: Config + Security Hub 점검 끔(`posture_check`), 계정 기본값 11개 켬([11 점검 보고서](11-security-audit.md)). **시작 · 끝 시각 미기록.** 관리자 bootstrap apply 0 · 1 · 0: ECS 실행 역할에 `ssm:GetParameters`(시연 계정 비밀번호 3개, 값은 사용자가 SSM에 직접 넣음), 끝 01:33:03 · **시작 미기록** | $0 | [ADR-057](04-decisions.md#adr-057) · [ADR-058](#adr-058) |
| 3 로컬 앱 변경 효과 (old `02096dc` vs new `3efca94`) | 2026-11-18 | 사용자 실행, DB 0.3코어 · 500 → 1,000명 · 번갈아 3회씩. 1차 시도는 new 1 중 PC가 꺼져(09:55, Kernel-Power 41) 처음부터 다시. **500명(여유): p95 · 요청별 p95 · 에러 모두 3회 범위가 겹침 = 차이 없음.** 새 기능만의 조회는 실행당 DB 0.003초. **1,000명: 두 버전 모두 DB 포화**로 p95 0.28 ~ 5.89s · 에러 0 ~ 49%가 실행마다 갈려 비교 제외(실행 전 규칙). DB 시간 상위는 두 버전 공통 검색 4개. 검색 코드 · 색인은 1.5단계와 같아, 1.5단계(1,000명 p95 4ms)와 다른 것은 환경 차이로 봄(가설). 예측 "1,000명 수 ms ~ 수십 ms"는 틀림 | $0 (로컬) | [기록](experiments/app-change.md#결과-2026-11-18-사용자-실행-예열--6회). 3단계 비교표 각주 근거 |
| 3 이관 버킷 (bootstrap) | 2026-11-18 | 관리자 apply 4 · 0 · 0(사용자 예측 생략, Claude 예상 4 맞음), 11:49:04 → 11:50:14(확인 입력 포함). 관리자로 조회: 공개 차단 4개 켬, 버전 관리 한 번도 안 켬(지운 덤프가 옛 버전으로 남지 않음), 수명 주기 `expire-dumps` 1일 · 끊긴 업로드 1일, 정책에 HTTPS 아닌 요청 거부, 기본 암호화 AES256(SSE-S3), 객체 0. 그 전에 Claude가 `terraform validate`(bootstrap · 서울) 통과, 로컬 스모크(덤프 → 잠금 → 풀기 → 복원)에서 12개 테이블 체크섬 · 한글 일치 확인 | $0 (빈 버킷) | [3단계 계획 1절](experiments/migration.md#1-덤프-이관) · [ADR-008](04-decisions.md#adr-008) |
| 3 관제 대시보드 권한 (bootstrap) | 2026-11-18 | 관리자 apply 0 · 1 · 0(사용자 예측 생략, Claude 예상 1 change 맞음), 12:54:42 → 12:54:56. 평소 정책 `operator-v2`에 `Dashboard`(`cloudwatch:*Dashboard*`, 이름 `hotel-booking-aws-v2-*`만) 추가, 공백 뺀 5,892 / 6,144자. 관리자로 조회: 기본 버전 v9에 `Dashboard` 문장 있음. 관제 화면을 도쿄 Grafana 대신 Terraform CloudWatch 대시보드로 바꾼 결정의 준비 | $0 (IAM 무료) | [ADR-061](04-decisions.md#adr-061) 변경 |
| 3 이관 날 ① 옛 환경 권한 붙이기 (고객사 `legacy/iam`) | 2026-11-18 | 이 PC에서 처음이라 `legacy/terraform.tfvars`(SSH 허용 IP = 지금 IP) 새로 만들고 `init`. 관리자 apply 1 · 0 · 0(예상 1 맞음, `attach_operator_legacy = true`, 커밋 안 함 · 끝나면 되돌림), 13:02:31 → 13:03:40(확인 입력 포함) | $0 (IAM 무료) | [ADR-043](#adr-043) |
| 3 이관 날 ② 옛 환경 + 발생기 (고객사 `legacy`) | 2026-11-18 | 평소 사용자 apply `-var is_load_test=true` 19 · 0 · 0(예상 19 맞음), 13:05:38 → 13:06:43. 옛 화면에 사진이 안 뜸: 옛 앱은 사진 칸이 `images`인 이전 버전이고, DB 시드의 사진 주소가 이미 `img.hotel.vundle34.cloud`(사진 CloudFront, global 루트)를 가리키는데 global을 아직 안 올려 연결 실패(000). global을 올리면 뜰 것(가설, 확인 예정). 사진을 가져오는 방식은 이관 전후가 같아(바깥 주소 → 브라우저가 직접) 그대로 두고 한계로 적음(사용자, 3단계 계획 1절) | 켠 시간만큼 | [ADR-055](04-decisions.md#adr-055) |
| 3 이관 날 ③ 서울 | 2026-11-18 | 평소 사용자 apply 49 · 0 · 0(예상 49 맞음: 관제 대시보드 · restore · sql 태스크 정의 포함), 13:11:17 → 13:24:22(13분 5초, 확인 입력 포함, 옛 환경과 동시에). migrate(CD)는 돌리지 않음(빈 RDS에 시드가 들어가 복원과 겹침) | 서울 시간당 약 $0.19 | [3단계 계획](experiments/migration.md) |
| 3 이관 날 ④ global (+ k6 발생기 WAF 예외) | 2026-11-18 | 평소 사용자 `-var loadtest_ips=["<발생기 IP>/32"]` apply 13:25:53 시작 → 6개(인증서 · 확인 레코드 2 · 발급 대기 · 입구 규칙 · OAC) 만든 뒤 **IP 세트에서 `AccessDenied`(wafv2:CreateIPSet)로 멈춤**: IP 세트를 추가하면서 global 권한(`edge` 정책) 확인을 빠뜨림(Claude). `edge` 정책에 IP 세트 권한 4개 추가(2,179 / 6,144자) → 관리자 bootstrap 0 · 1 · 0, 14:04:34 → 14:04:50 → global 다시 8 · 0 · 0(예상 8 맞음), 14:05:43 → 14:09:49. 바깥 확인: 사진 CDN 200(옛 화면 사진 뜸, ②의 가설 맞음), 새 주소 첫 화면 · `/api/health` 200, `/api/health/deep` 500(migrate 전 정상), 옛 주소 200 | 켠 시간만큼(WAF 시간 단위) | [WAF 예외](experiments/migration.md#waf-예외-2--3--4-공통) |
| 3 이관 날 ⑤ 덤프 이관 (리허설 → 진짜) | 2026-11-18 | 관리자로 `cutover.sh prep`(키 · 점검 페이지 준비 · 표지 손님 14:13:21) → **리허설** 14:13:30 → 14:14:51(81초, 점검 페이지 · migrate 없이, 12개 테이블 체크섬 일치) → 진짜 이관 1차 14:20:50은 시작 확인에서 멈춤(bash가 aws를 못 띄움, 손님 영향 없음) → **2차 14:30:58 → 14:33:38, 중단 시간 2분 40초**(손님이 어디서도 예약 못 한 시간 2분 8초). 12개 테이블 · 176,073행 체크섬 · 한글 일치, 덤프 2.66MB, 새 주소 deep 200 · 숙소 1,010. 예측 8 ~ 15분은 틀림, 리허설 뒤 수정 예측 2분 30초 ~ 4분은 맞음. 덤프 · 키는 자동 삭제(14:33:44). 1초 기록기 버그 고침. 서울을 올린 날 확인: migrate 로그에 host1 · host2 · admin 시연 계정 "만듦"(Windows aws가 CP949로 저장해 글자가 깨져 보였음), 1초 지표 10분 599점 1초 간격. 원본 기록은 [migration-data](experiments/migration-data/README.md) | 켠 시간에 포함, S3 · SSM 몇 분 | [결과](experiments/migration.md#결과-2026-11-18-사용자-실행) · [ADR-008](04-decisions.md#adr-008) |
| 3 이관 날 ⑥ 전부 내리기 · 옛 환경 권한 떼기 | 2026-11-18 | 동료 멘토링(이관된 사이트 · 시연 계정 사용) 뒤 global → 서울 destroy, 옛 환경은 global 뒤 destroy(발생기 IP가 반납되기 전에 WAF 예외가 먼저 사라지게). destroy 시각은 사용자 확인 대기. 관리자 `legacy/iam` 0 · 0 · 1(예상 1 맞음, 로컬 `true` 되돌림) 17:20:42 → 17:20:51. 관리자로 잔여 조회: RDS · ECS 클러스터 · EC2 · NAT · EIP · ALB · CloudFront · WAF · IP 세트 · VPC · 대시보드 0, 이관 버킷 객체 0. 부하 시험(2 ~ 4절)과 이관 녹화는 다른 PC · 다른 날로(옛 환경 state가 이 PC에만 있어 여기서 내림) | 서울 13:11 ~ 약 17시(약 4시간, 시간당 약 $0.19) + 옛 환경 · 발생기 · WAF | [3단계 계획](experiments/migration.md) |
| 3 측정 날 ⓪ 어제부터 켜져 있던 서울 · global | 2026-11-20 | 11-19 13:44(NAT) · 13:48(RDS) · 13:53(앱 서비스)에 만든 서울과 global이 내려가지 않은 채 남아 있었음. 이 표에 apply 기록이 없어 AWS 생성 시각으로 확인(10:19). 새 주소 `/api/health/deep`은 500(앱 계정 없음 = migrate 전, 이관 날 ③ · ④까지 한 상태). 옛 환경 EC2는 없었음 | 서울 약 20시간 × 시간당 약 $0.19 ≈ $4 + global(WAF 등) | 사용자: 11-19에 이관 날 순서로 올린 뒤, 포트폴리오를 어떻게 보여 줄지(영상 · 사이트) 고민하다 지쳐 내리는 걸 잊음. 그 고민의 결론이 [ADR-063](#adr-063) |
| 3 측정 날 ① 옛 환경 + 발생기 (고객사 `legacy`) | 2026-11-20 | 집 PC 처음이라 `init`. Claude가 평소 사용자로 plan 19 · 0 · 0(런북 예상 19 맞음) → apply 10:18:03 → 10:18:43. 옛 앱 이미지는 Docker Hub 마지막 태그 `e0486ae`(11-11). 지금 앱 HEAD `3efca94`는 Docker Hub에 없음 | | SSH 키에 암호가 있어 `start-db` · `start-app`은 사용자 터미널에서 |
| 3 측정 날 ② 서울 Container Insights | 2026-11-20 | 이미 떠 있어 plan 1 · 1 · 0. 평소 사용자 apply 10:20:23 → 10:20:27: 로그 그룹 1개 추가, 클러스터 설정 변경은 `ecs:UpdateCluster` 권한이 없어 AccessDenied → 관리자로 다시 apply(남은 1 change). 새로 만드는 날은 CreateCluster에 설정이 같이 들어가 평소 사용자로 됨 | $0 | [ADR-063](#adr-063) |
| 3 측정 날 ③ global 발생기 IP | 2026-11-20 | IP 세트에 오늘 발생기 IP만 바꿈 0 · 1 · 0, 10:20:54 → 10:21:00 (IP 세트가 이미 있었음 = 11-19에도 발생기 예외로 올림) | $0 | |
| 3 측정 날 ④ 서울 Container Insights (관리자) | 2026-11-20 | 관리자 apply 0 · 1 · 0(클러스터 설정 `disabled` → `enabled`), 10:31:45 → 10:32:05 | $0 + Container Insights 지표 요금 | |
| 3 측정 날 ⑤ 덤프 이관 2회차 | 2026-11-20 | `prep`(표지 손님 10:32:23) → `run` **중단 2분 19초**(10:32:35 → 10:34:54), 손님이 예약할 수 없던 시간 1분 45초, 12개 테이블 · 176,073행 체크섬 일치, 한글 그대로. 리허설 생략 | | [2회차 결과](experiments/migration.md#결과-2회차-2026-11-20-사용자-실행-측정-날-데이터-채우기-겸) |
