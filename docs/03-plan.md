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
| v1 이력의 `3tier-seoul.yml`(EC2 7대, 단일 AZ)을 v2 앱 기준으로 축소: 웹+앱 EC2 1대, MySQL EC2 1대, NAT 인스턴스 1대([ADR-016](04-decisions.md#adr-016)) → `infra/legacy/` | 이전 환경에서 앱 동작 |
| k6 시나리오 작성 (조회 위주 + 일부 예약) | 부하를 단계적으로 올려 에러율 1% 또는 p95 1초를 처음 넘는 지점의 처리량과 p95 응답 시간 기록 ([기준선](experiments/baseline.md)) |

## 1.5단계: DB 병목 분석과 개선 (로컬, [ADR-024](04-decisions.md#adr-024))

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
| 숙소 사진 `img.hotel.vundle34.cloud` ([ADR-035](04-decisions.md#adr-035) · [055](04-decisions.md#adr-055)) | HTTPS · 캐시 Hit, 서울 S3를 막으면 도쿄 S3에서 나옴(원본 장애 조치), 서울 → 도쿄 복제 지연 기록, 브라우저가 칸에 맞는 크기(640 · 1200)를 받음 |
| CD 워크플로 (ECR 푸시, 스키마 변경, ECS 배포) | main 병합 → 자동 배포 성공, 커밋부터 반영까지 시간 기록 |
| 재현성 확인 | `destroy` 후 다시 `apply`해서 같은 상태로 복구. 방법(2026-11-16 결정): 사진까지 넣고 처음부터 전체를 올리는 날(seoul → global → CD) 아래 5가지를 확인해 기록. ① apply 개수가 런북과 같음(서울 43, global 7 + 사진으로 늘어난 수) ② 다 올린 뒤 다시 `plan` = No changes ③ 사이트 · `/api/health/deep` 정상 ④ 시드 행 수(숙소 1,010 · 객실 5,030 · 회원 20,003 · 예약 100,013 · 리뷰 50,013) ⑤ 사진 표시 · 캐시 Hit. 그전 apply · destroy(서울 4회 · 도쿄 1회)는 "같은 상태" 기준 없이 해서 갈음하지 않음. **2026-11-16 완료**(결과 표 2-3 전체 올리기) |
| ECS 예약 스케일링 (이벤트 전 최소 태스크 수 상향) | 지정 시각에 태스크 수가 바뀌는지 확인. **2026-11-16 완료**(결과 표 2-3 오토스케일링, 목표 추적도 같이 만듦) |
| 단계 마무리: README · 포트폴리오 대문 갱신 (2026-11-16 결정, **이후 단계마다 반복**) | "왜 단계를 나눠 진행했나"(1단계 DB 병목 → 로컬 $0에서 앱 수정(ADR-024) → 같은 k6로 앱 효과 · 인프라 효과 분리) · 비용을 아낀 결정 표(결정 · 아낀 돈이나 이유 · ADR) · 단계 그림(`stages.svg`, 1.5단계 추가 · 실측 금액)을 그 단계 숫자로 갱신. 남은 손질(2단계 "$42", "검증 기록" 문구)도 함께 |
| 계정 기본 보안: CloudTrail 기록 보관, GuardDuty, Security Hub ([ADR-056](04-decisions.md#adr-056)) | 켠 날짜 기록, Security Hub 점검 결과와 고친 항목 목록, 30일 무료 체험이 끝나기 전에 끄거나 비용 기록 |
| CD 보안 검사: npm 의존성, ECR 이미지 스캔, Terraform 정적 검사 | CD에서 검사가 돌고 결과가 남음. 일정이 밀리면 가장 먼저 뺌 |

## 3단계: 덤프 이관과 비교

| 할 일 | 완료 기준 |
|---|---|
| 점검 모드 → `mysqldump` → RDS 복원 → 건수·체크섬 검증 → 트래픽 전환 (덤프·복원 모두 `--default-character-set=utf8mb4` 명시, 0단계 한글 깨짐 사례 참고) | 이관 중단 시간 실측, 데이터 일치, 한글 데이터 확인 |
| 1단계와 같은 k6 부하를 목표 구조에 적용 | 이전/이후 비교표 (처리량, 에러율, p95), 오토스케일링 동작 확인 |
| 쿠폰 오픈 시각 k6 스파이크 테스트 (예약 스케일링 없이 / 있게) | 초과 발급 0건, 남은 수량 거절 0건, 오픈 순간 p95 응답 시간 비교, 쿠폰 행의 처리량 상한 |

## 3.5단계: 운영 사건 대응 자동화 (장애 · 보안, [ADR-056](04-decisions.md#adr-056))

장애와 공격을 같은 흐름(경보 · 이벤트 → Lambda 판단 → 조치 → 사건 보고서)으로 처리하고, 감지 · 복구 · 차단 시간을 잽니다.

| 할 일 | 완료 기준 |
|---|---|
| 대응 흐름 | 아래 장애 3종 · 공격 2종이 같은 흐름으로 감지되고 기록됨 |
| 장애 실험 3종 (4단계에서 앞당김): ECS 태스크 강제 종료, RDS 강제 장애 조치(Multi-AZ), 일부러 깨진 버전 배포 | 감지까지 시간, 복구(대체 태스크 기동 · 쓰기 불가 구간 · 자동 롤백)까지 시간, 손님이 본 오류 수, 각 3회 |
| 공격 재현 2종: IP 하나로 로그인 대입, IP 여러 개로 여러 계정 대입(크리덴셜 스터핑) | 공격 시작부터 차단까지 시간(WAF 한도만일 때 약 41초와 비교), 여러 IP 공격 차단 여부, 정상 손님 오차단 0건, 각 3회. IP 차단은 1시간 뒤 자동 해제 |
| 임계값 | 정상 k6 시나리오의 평소 최댓값 × 배수로 정하고 근거 기록 |
| 사건 보고서 (AI) | 규칙이 판정 · 조치하고 AI는 고객 보고용 초안만 씀. AI가 실패해도 차단 동작 |
| 통합 대시보드 (CloudWatch, Terraform) | 경보 상태 · 서비스 · 보안 · 대응 기록이 한 화면. WAF 지표 · 경보는 us-east-1 |

**통합 대시보드 구성** (3.5단계를 시작할 때 확정)

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

일정이 밀리면 CD 보안 검사(2단계) → AI 보고서 → 깨진 버전 배포 실험 순으로 뺍니다. 3단계 이관 전 · 후 비교는 빼지 않습니다.

## 4단계: 장애 테스트

로컬 예행연습: [07 로컬 장애·부하 실험](07-experiments.md)

ECS 태스크 강제 종료 · RDS 강제 장애 조치 · 깨진 버전 배포는 3.5단계에서 먼저 합니다. 여기서는 나머지(AZ 하나 장애, 오토스케일링 상한)를 합니다.

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

**마무리**
- DORA 지표 정리: 배포 빈도, 변경 리드타임, 변경 실패율, 복구 시간
- 실제 청구 금액과 v1·v2 비용 비교
- v1/v2 비교 문서 완성

## 비용 운영

- 테스트할 때만 `apply`하고 끝나면 `destroy`합니다.
- RDS Multi-AZ와 도쿄 리소스는 해당 테스트를 할 때만 켭니다.
- AWS Budgets 알림(월 $50)은 1단계 시작 전에 먼저 설정하고, 2단계 bootstrap에서 코드로 옮깁니다([09 비용 추정](09-cost-estimate.md)).
- 단계별 실제 비용을 기록합니다.

## v2 이후 후보

v2 범위에는 넣지 않고, 끝난 뒤 이어서 할 수 있는 것만 적습니다.

| 후보 | 내용 | 적은 날 |
|---|---|---|
| 데모 결제 | 토스페이먼츠 테스트 키(승인은 가상, 실제로 차감되지 않음)로 예약할 때 결제. 카드 번호는 PG 결제창에 입력되고 서버는 승인 API만 부름. 봇이 예약만 잔뜩 해 객실을 묶어 두는 문제의 근본 대책([10 보안 점검](10-security.md)) | 2026-11-15 |
| 보안 확장 | [10 보안 점검](10-security.md) 6절의 앱 · WAF 후보(토큰 저장 방식, CSP, Bot Control 등). 로그인 실패 제한은 [ADR-054](04-decisions.md#adr-054)로, 로그인 공격 자동 대응은 3.5단계로 옮김 | 2026-11-15 |

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
| 1 부하 발생기 (과제 3-1) | 2026-11-11 | 부하 발생기 EC2와 전용 SG를 `is_load_test` 변수로 켤 때만 만듦(`count`). plan: 끈 날 17개 · 켠 날 19개 추가(예측과 같음). 발생기에서 `grafana/k6:1.0.0` 실행(로컬 실험과 같은 버전). 발생기 → 앱 공인 IP `/api/health/deep` 200 **4.4ms**, 같은 요청을 내 PC에서 14.4ms(각 1회). 서버 4대(NAT·앱·DB·발생기) 크레딧 방식 모두 unlimited(앱·DB·발생기는 코드에 명시, [ADR-023](04-decisions.md#adr-023)). 새 버전(`62702e2`)으로 예약 생성 → 내 예약에 보임: **1단계 "이전 환경에서 앱 동작" 완료** | 시간당 약 $0.067 (t3.micro 4대 + 공인 IPv4 3개), destroy 15:05 KST(19개), apply 시각 미기록 | 발생기에 처음엔 앱 SG를 붙였다가 리뷰에서 전용 SG로 바꿈: DB SG가 앱 SG를 출발지로 허용해서 발생기가 DB 3306·22번에 닿을 수 있었음(DB에 앱 SG가 붙었던 2-3과 같은 모양). 내 PC도 14ms라 국내에서는 인터넷 지연 자체는 작다. 서울 EC2를 쓰는 주된 이유는 지연보다 PC·집 회선 한계와 에러 원인 구분([ADR-019](04-decisions.md#adr-019)) |
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
| 2-2 앱 저장소 분리 ④ 신뢰 조건 정리 · legacy 정책 넘기기 (bootstrap) | 2026-11-14 | 이 저장소에서 `app/` · compose · 워크플로를 지운 뒤, 관리자 역할로 ④-a(`sub`에서 인프라 저장소 빼기)와 ④-b(bootstrap에서 legacy 정책 빼기)를 한 번에 apply. plan 0 추가 · 1 변경 · 1 삭제(사용자 예측 "2 변경" → 정책은 코드에서 빠지면 변경이 아니라 삭제. 그룹 연결은 count 0이라 지울 것이 없음). apply 00:46:43 시작 → state 저장 00:47:00(17초). 확인: 신뢰 조건 `sub`는 `hotel-booking-app` main 하나, 고객 관리형 정책은 `operator-v2`만 남음 | $0 (IAM 무료) | [ADR-043](04-decisions.md#adr-043). legacy 정책은 고객사 저장소 `legacy/iam`에서 같은 이름으로 다시 만든다 |
| 2-2 앱 저장소 분리 ④-b legacy 정책 다시 만들기 (고객사 `legacy/iam`) | 2026-11-14 | `legacy` · 0단계 `load` · `scripts`를 히스토리째 고객사 저장소로 옮긴 뒤(커밋 85개), 관리자 역할로 고객사 저장소 [legacy/iam](https://github.com/yubin05/hotel-booking-app/tree/main/legacy/iam)에서 init(S3 `legacy-iam/terraform.tfstate`) · plan · apply: 1개 추가(사용자 예측 1, "연결을 true로 바꾸면 2" → 맞음). apply 01:03:16 시작 → 정책 생성 01:03:26 · state 저장 01:03:27(11초). 16분 전 지운 것과 같은 이름으로 바로 만들어짐. 확인: `hotel-booking-aws-v2-operator-legacy` 연결 0(평소에는 떼어 둠), `operator-v2` 연결 1. 고객사 저장소 CI(`ci.yml` 변경으로 실행) 성공 | $0 (IAM 무료) | [ADR-043](04-decisions.md#adr-043). legacy 작업 날은 `attach_operator_legacy = true`로 관리자 apply. 앱 분리 완료 |
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
| 2-3 ECS 오토스케일링(예약 + 목표 추적) | 2026-11-16 | bootstrap 관리자 0 · 1 · 0(`operator-v2`에 오토스케일링 · CloudWatch 경보 권한, 5,753 / 6,144자) 16:28:16 → 16:28:30. 서울 평소 사용자 4 · 0 · 0(확장 대상 2 ~ 4개 · CPU 60% 목표 추적 · 예약 2개) 16:29:33 → 16:29:42, 둘 다 예측 없이. 목표 추적이 경보 2개를 만듦: 늘리기 CPU 60% 초과 1분 × 3번, 줄이기 54% 미만 1분 × 15번. 시험 이벤트 16:45 ~ 17:00 최소 4: 예약 실행 16:45:38(**+38초**) → 새 태스크 2개 시작 16:45:42 → ALB 등록 16:46:11 → 안정 16:46:29(**예약 시각부터 약 1분 반**, 실행부터 51초). 끝 예약 실행 17:00:23(+23초, 최소 2로) → 줄이기 경보(지난 몇 시간의 낮은 CPU로 16:31부터 ALARM)가 17:01:08 4 → 3, 17:02:08 3 → 2, 17:02:45 2개(17:00부터 약 2분 45초). 1분마다 하나씩 줄인 것은 대기 시간(쿨다운)이 0초로 들어가서(Terraform에서 안 적음, 문서상 ECS 기본 300초) → 줄이기 300초 · 늘리기 60초로 적음(가설값). 실행된 예약 작업은 지워지지 않고 남아 지난 이벤트는 코드에서 지움. 감시 명령은 `scripts/watch-scaling.sh` | 서울 켠 시간에 포함(태스크 2개 추가 약 17분) | [ADR-015](04-decisions.md#adr-015). 부하가 없어 늘리기 경보 · 실제 한계는 3단계 |
