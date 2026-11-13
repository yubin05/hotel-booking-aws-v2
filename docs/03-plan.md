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
| CD 워크플로 (ECR 푸시, 스키마 변경, ECS 배포) | main 병합 → 자동 배포 성공, 커밋부터 반영까지 시간 기록 |
| 재현성 확인 | `destroy` 후 다시 `apply`해서 같은 상태로 복구 |
| ECS 예약 스케일링 (이벤트 전 최소 태스크 수 상향) | 지정 시각에 태스크 수가 바뀌는지 확인 |

## 3단계: 덤프 이관과 비교

| 할 일 | 완료 기준 |
|---|---|
| 점검 모드 → `mysqldump` → RDS 복원 → 건수·체크섬 검증 → 트래픽 전환 (덤프·복원 모두 `--default-character-set=utf8mb4` 명시, 0단계 한글 깨짐 사례 참고) | 이관 중단 시간 실측, 데이터 일치, 한글 데이터 확인 |
| 1단계와 같은 k6 부하를 목표 구조에 적용 | 이전/이후 비교표 (처리량, 에러율, p95), 오토스케일링 동작 확인 |
| 쿠폰 오픈 시각 k6 스파이크 테스트 (예약 스케일링 없이 / 있게) | 초과 발급 0건, 남은 수량 거절 0건, 오픈 순간 p95 응답 시간 비교, 쿠폰 행의 처리량 상한 |

## 4단계: 장애 테스트

로컬 예행연습: [07 로컬 장애·부하 실험](07-experiments.md)

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

## 구현 전에 확인할 것

공식 문서나 작은 PoC로 확인합니다. 결과에 따라 설계를 고칩니다.

| 항목 | 이유 | 안 될 때 대안 |
|---|---|---|
| ~~RDS 자동 백업 리전 간 복제: MySQL 8.4·작은 인스턴스·서울→도쿄 지원 여부, 비용, 복제 지연~~ → 2026-11-13 확인: RDS for MySQL 모든 현재 버전 지원, Multi-AZ DB 인스턴스 지원(클러스터는 미지원), 서울 → 도쿄 지원 짝, 비용은 복사 전송 + 도쿄 저장([문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReplicateBackups.html)). 복제 지연은 5단계 드릴에서 RPO로 잰다 | 리전 장애 대비의 핵심 | AWS Backup 리전 간 복사 (RPO 증가) |
| CloudFront VPC Origin: 전제 조건(인터넷 게이트웨이 필요 → 2026-11-13 문서로 확인, 필요), 다른 리전 원본으로 전환(global 루트 PoC, [ADR-035](04-decisions.md#adr-035)), 반영 시간 | 진입점과 리전 전환 방식의 핵심 | Public ALB + 비밀 헤더 |
| RDS for MySQL 버전 지원 일정 (8.0, 8.4) | 버전 선택 | - |
| 서울 리전 가격 (NAT, ALB, Fargate, RDS, WAF, 공인 IPv4) | 비용 추정 | - |
| ECR 리전 간 복제와 기본 스캔 비용 | 도쿄에서 기동, 이미지 보안 | 도쿄 ECR에 직접 푸시 |
| Terraform S3 네이티브 잠금(`use_lockfile`) 지원 버전 | state 잠금 | DynamoDB 잠금 |
| GitHub Actions OIDC 신뢰 조건 | 권한을 저장소·브랜치로 제한 | - |
| ECS 예약 스케일링(Application Auto Scaling 예약 작업) 설정과 반영 시각 | 쿠폰 이벤트 대응 | 이벤트 전에 최소 태스크 수를 수동으로 변경 |
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
| 1 legacy 네트워크·NAT | 2026-11-10 | plan 12개 추가(예측 8: 라우팅 테이블 연결 2·경로 2를 빠뜨림. plan 수는 콘솔에 보이는 물건이 아니라 `resource` 블록 수). apply 후 NAT 시스템 로그에서 user_data가 끝까지 실행됨(iptables 규칙 저장 OK), 프라이빗 라우팅 `0.0.0.0/0` → NAT ENI 확인, destroy 12개 후 state 비어 있음 | $0.02 미만 (NAT t3.micro $0.013 + 공인 IPv4 $0.005 /시간, 켜 둔 시간 미기록) | 첫 실행은 `aws login` 세션이 관리자 역할로 잡혀 관리자 권한으로 돌았다. 같은 날 평소 사용자 + 직접 쓴 정책([legacy-operator-policy.json](../infra/iam/legacy-operator-policy.json))으로 다시 apply·destroy → 권한 거부 없음, NAT 로그 동일. NAT의 실제 전달은 과제 2의 DB EC2 설치로 확인 |
| 1 앱 EC2·키 페어 | 2026-11-10 | plan 16개 추가(과제 1의 12 + SG 2 + 키 페어 1 + 앱 EC2 1. 인라인 SG 규칙은 리소스로 세지 않음). 첫 apply는 `ImportKeyPair` 400(`Character sets beyond ASCII are not supported`)으로 14개만 만들고 멈춤: 공개 키 코멘트에 한글(`학원`). Terraform은 롤백하지 않고, 앱 EC2는 `key_name`이 키 페어 리소스를 참조해 생성을 시작하지도 않음. 코멘트를 ASCII로 고친 키로 다시 apply → 2개 추가. SSH 접속 후 Docker `enabled` · `active (running)` 확인. destroy 후 state 비어 있고 서울 리전 인스턴스 0대 | 시간당 약 $0.036 (NAT·앱 t3.micro $0.013씩 + 공인 IPv4 2개 $0.005씩), 켜 둔 시간 미기록 | 평소 사용자로 실행. 400(입력값 오류)이므로 `ImportKeyPair` 권한은 통과(권한이 없으면 403 `UnauthorizedOperation`). 리뷰에서 앱 SG 22번의 `protocol = -1`을 발견: 모든 프로토콜·포트가 열리는데 validate·plan은 통과함 |
| 1 DB EC2·NAT 검증 | 2026-11-10 | plan 17개(16 + DB 1). 첫 ProxyJump가 앱 → DB 22번에서 멈춤(`connect failed: Connection timed out`): 앱 EC2 코드를 복사하며 DB에 앱 SG가 붙음. SG는 거절하지 않고 패킷을 버려 시간 초과로 보임. DB SG로 고쳐 `apply -replace`로 DB만 다시 만듦(실행 중 SG 변경은 정책에 없는 네트워크 인터페이스 수정 권한이 필요할 수 있어서). [check-db.sh](../infra/legacy/check-db.sh)로 cloud-init `done`, SQL 2개(7,055·22,080바이트), `mysql:8.4` 이미지 확인 → NAT가 실제로 전달함(과제 1에서 남긴 검증). MySQL 컨테이너는 initdb로 DB·`app` 계정·스키마·시드를 만들고 호텔 10개, 한글 저장 정상(`그` = `EAB7B8`) | 시간당 약 $0.049 (t3.micro 3대 + 공인 IPv4 2개), 켜 둔 시간 미기록 | 컨테이너 안 `mysql` 클라이언트로 조회하면 한글이 `???`: 저장은 정상이고 클라이언트 기본 문자셋이 latin1이라 읽을 때 바뀜(`--default-character-set=utf8mb4`로 확인, 앱은 `db.ts`에서 utf8mb4 지정). NAT 대기 1회는 NAT가 이미 떠 있던 상태라 경합은 아직 시험하지 않음 |
| 1 DB 데이터 양·처음부터 apply | 2026-11-10 | 처음부터 apply(17개) 후 [start-db.sh](../infra/legacy/start-db.sh) 하나로 user_data 완료 대기 → 비밀값 전송 → initdb(스키마 → 시드 → [seed-volume](../scripts/seed-volume.sql)) → 호텔 1,010개, 한글 정상. seed-volume은 t3.micro에서 12초(로컬 약 10초). NAT 경합 실제 발생: DB의 첫 `curl`이 NAT 준비 전이라 실패하고 10초 뒤 두 번째에 성공(대기 루프가 없었다면 `dnf`에서 user_data가 멈춤) | 시간당 약 $0.049 (t3.micro 3대 + 공인 IPv4 2개) | `check-db.sh`·`start-db.sh`는 매번 예전 서버 키 기록을 지워서, 같은 날 두 스크립트를 이어 실행하면 지문을 다시 물음(새 서버 키로 인한 접속 거부를 막는 대가) |
| 1 앱 배포 (과제 2-4) | 2026-11-11 | 커밋 SHA 태그로 이미지 빌드([ADR-022](04-decisions.md#adr-022)) → push 전에 이미지 안 확인(`/app`에 빌드 결과물만 있고 환경 변수에 비밀값 없음) → Docker Hub 공개 저장소에 push. [start-app.sh](../infra/legacy/start-app.sh): 비밀값 전송(600) → pull → `docker run -p 80:3000` → `/api/health/deep` 200. 브라우저에서 숙소 조회는 정상이고 예약 화면이 하얗게 멈춤(아래 트러블슈팅) → 수정 커밋 `62702e2`로 다시 배포. 브라우저가 받는 JS 파일명이 바뀐 것으로 새 이미지를 확인했고 예약 화면·내 예약 화면 정상. 새 버전으로 예약 생성은 다음 apply에서 확인(아래 3-1 행) | 약 $0.03 (11:37~12:14 KST 37분, 시간당 약 $0.049) | DB 비밀번호는 보낼 때 db.env에서 꺼내 써서 두 파일에 복사하지 않음. `.dockerignore`에 env 파일 패턴(`**/*.env`, `**/.env.*`) 추가: Vite는 web의 env 파일 값(`VITE_`)을 화면 JS에 써 넣어 공개 이미지와 브라우저로 샐 수 있음(지금은 env 파일 없음, 예방) |
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
| 2-2 평소 사용자 state 권한 | 2026-11-12 | 평소 그룹 인라인 정책([legacy-operator-policy.json](../infra/iam/legacy-operator-policy.json))에 state 버킷 권한 추가: ListBucket(버킷, 조건 없음), state Get · Put과 잠금 파일 Get · Put · Delete는 seoul · global · tokyo 경로만. 리뷰에서 `*/terraform.tfstate`(bootstrap도 걸림)와 잠금 경로 `terraform.tfstate/*.tflock`(실제 이름은 `terraform.tfstate.tflock`)을 반영 전에 고침. 관리자 역할로 `get-group-policy` 백업 → `put-group-policy` 반영. 평소 사용자로 14:34 확인: `:user/`, 목록 `["bootstrap/terraform.tfstate"]`, bootstrap state HeadObject 403, 아직 없는 seoul state 404(예측 4개 모두 같음) | $0 | [ADR-028](04-decisions.md#adr-028). 쓰기 · 잠금은 seoul 첫 plan에서 확인 |
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
