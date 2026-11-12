# 04. 설계 결정 기록 (ADR)

무엇을 골랐는지보다 **왜 그랬고 무엇을 버렸는지**를 남깁니다. ADR-001~015는 2026-11-03 설계 검토에서, 016부터는 1단계(2026-11-09)에서 내렸으며, [01 시나리오](01-scenario.md)의 가정이 바뀌면 다시 검토합니다.

| ADR | 결정 |
|---|---|
| [001](#adr-001) | 멀티클라우드 DR을 쓰지 않는다 |
| [002](#adr-002) | SaaS·PaaS 조합 대신 AWS로 이관한다 |
| [003](#adr-003) | EKS·EC2 대신 ECS Fargate |
| [004](#adr-004) | 마이크로서비스 대신 모듈러 모놀리스 |
| [005](#adr-005) | Aurora 대신 RDS for MySQL |
| [006](#adr-006) | API Gateway 대신 CloudFront VPC Origin + Internal ALB |
| [007](#adr-007) | Cognito 대신 앱 자체 JWT |
| [008](#adr-008) | DMS CDC 대신 덤프로 이관 |
| [009](#adr-009) | DR 전략: Multi-AZ + 리전 간 Backup & Restore |
| [010](#adr-010) | CI/CD: GitHub Actions + ECS 롤링 + 자동 롤백 |
| [011](#adr-011) | Terraform: 작은 범용 모듈 없이, regional만 모듈 + 리전별 루트 |
| [012](#adr-012) | 리전 전환은 DNS가 아니라 CloudFront 원본 전환 |
| [013](#adr-013) | 정적 프론트를 앱 컨테이너에 포함 |
| [014](#adr-014) | 선착순 쿠폰은 DB 조건부 갱신으로 처리 |
| [015](#adr-015) | 예정된 급증은 예약 스케일링, 예상 못 한 급증은 목표 추적 |
| [016](#adr-016) | 이전 환경은 IDC처럼: 약점은 그대로, 관리형 서비스는 필요할 때만 |
| [017](#adr-017) | 이전 환경도 Terraform으로 |
| [018](#adr-018) | 루트는 잠그고, 평소엔 최소 권한 + 관리자는 역할 전환 |
| [019](#adr-019) | k6 부하는 서울 리전 EC2에서 |
| [020](#adr-020) | 이미지 저장소: Docker Hub 대신 ECR |
| [021](#adr-021) | 이전 환경 서버는 빠르고 싸게: DB도 Docker, 비밀값은 SSH로, HTTP |
| [022](#adr-022) | 이미지 태그는 커밋 SHA |
| [023](#adr-023) | 부하 기준선 조건: 발생기는 퍼블릭 서브넷에서 앱 공인 IP로, t3는 unlimited 명시 |
| [024](#adr-024) | 2단계 전에 DB 병목을 로컬에서 분석·개선한다 (1단계 기록은 그대로) |
| [025](#adr-025) | bootstrap은 관리자 역할로 1회 적용, state는 도쿄 버킷 하나에 계정 전용 이름으로 |
| [026](#adr-026) | GitHub OIDC 역할은 main 브랜치만, 권한 정책은 리소스 이름이 정해지는 2-2에서 |
| [027](#adr-027) | 예산 알림은 콘솔 예산을 import, 이메일은 커밋하지 않는 tfvars로 |
| [028](#adr-028) | 평소 사용자의 state 권한은 루트별 허용 목록, bootstrap은 제외 |
| [029](#adr-029) | ECS 실행 역할은 bootstrap에서 관리자가 만들고, 평소 사용자 · CD에는 PassRole만 |
| [030](#adr-030) | 리소스 이름은 `hotel-booking-aws-v2` 접두사, 서울 · 도쿄 같은 이름 |

---

<a name="adr-001"></a>
## ADR-001 멀티클라우드 DR을 쓰지 않는다

- **상황:** v1은 AWS–Azure Active-Passive DR이었다. 고객은 소규모 회사이고 벤더 종속 탈피나 규제 요구가 없다.
- **검토한 대안:**
  1. Azure 상시 대기 (v1 방식)
  2. GCP Cold DR: 암호화한 백업만 GCS에 보관하고 장애 때 환경을 생성
  3. AWS 멀티리전 Pilot Light 이상
  4. Multi-AZ + 리전 간 백업
- **결정:** 4번.
- **근거:** 장애 종류별로 맞는 대응이 다르다.

  | 장애 | 맞는 대응 |
  |---|---|
  | 서버·AZ 장애 | Multi-AZ |
  | 리전 장애 | 다른 리전 백업 또는 멀티리전 |
  | 계정 사고(탈취·정지) | 별도 계정 백업으로도 대응 가능 |
  | 벤더 리스크·규제 | 멀티클라우드 |

  AWS 전체가 동시에 멈춘 사례는 드물고, 이 고객에게는 마지막 줄의 요구가 없다.
- **결과:** 상시 대기 비용이 사라진다. 벤더 리스크는 다루지 않으며 한계로 명시한다. 2번 안을 검토하며 정리한 방법(공개키로 암호화한 백업을 HTTPS로 내보내기, 장애 중 AWS API에 의존하지 않는 전환)은 요구가 생기면 참고한다.

<a name="adr-002"></a>
## ADR-002 SaaS·PaaS 조합 대신 AWS로 이관한다

- **상황:** 운영 중인 서비스로 기존 사용자, MySQL 데이터, 백엔드 코드가 있다.
- **검토한 대안:**
  1. Vercel + Supabase: Postgres라서 DB 전환과 백엔드 재개발이 필요
  2. Vercel + 컨테이너 PaaS(Render·Railway 등) + MySQL 호환 DB 서비스(PlanetScale·TiDB Cloud 등): 기존 앱을 거의 그대로 올릴 수 있는 유력한 대안. 단, Render·Railway는 서울 리전이 없음 ([08 실제 사례 조사](08-real-cases.md#3-saaspaas-대안의-서울-리전-adr-002-근거))
  3. AWS
- **결정:** AWS.
- **근거:**
  - 기존 앱과 MySQL을 그대로 옮겨 재개발 위험을 피한다.
  - 백엔드·DB를 사설망에 두고 데이터 위치(국내 리전)를 직접 통제한다.
  - 업체 3~4곳의 계약·장애·보안을 따로 관리하지 않는다.
  - 트래픽 폭증 때 비용 상한을 설계로 통제한다([02 아키텍처 7절](02-architecture.md#7-관측과-비용-통제)).
- **결과:** 초기 구축이 느리고 인프라를 아는 사람이 필요하다. 처음 시작하는 스타트업이었다면 1·2번이 더 나은 선택이었다.

<a name="adr-003"></a>
## ADR-003 EKS·EC2 대신 ECS Fargate

- **검토한 대안:** EC2 리호스팅(실무 이관 1단계에서 흔함), ECS Fargate, EKS.
- **결정:** ECS Fargate.
- **근거:** 앱은 v1에서 이미 컨테이너로 돌아갔다. 서버를 직접 관리할 필요가 없다. 인프라 담당자 1명이라는 가정에서 EKS의 제어 플레인 비용과 운영 부담은 과하다.
- **결과:** 쿠버네티스 경험은 v2를 끝낸 뒤 같은 이미지로 별도 실습한다.

<a name="adr-004"></a>
## ADR-004 마이크로서비스 대신 모듈러 모놀리스

- **상황:** v1의 서비스 5개는 서로 동기 호출로 묶여 있었다(예약 → 인증·호텔, 리뷰 → 예약). 인증 미들웨어는 4개 서비스에 복사돼 있었다. 따로 배포하지만 따로 살 수는 없는 **분산 모놀리스**였다.
- **검토한 대안:** 마이크로서비스 유지, 단순 모놀리스, 모듈러 모놀리스.
- **결정:** 모듈러 모놀리스(인증·호텔·예약 모듈).
- **근거:** 마이크로서비스가 정당해지는 조건(서비스별 담당 팀, 서비스별 독립 확장, 다른 기술 스택)이 없다. v1 팀도 서비스가 아니라 역할(DR·CI/CD·보안·로그)로 나뉘어 있었다.
- **결과:** 배포 단위가 1개로 줄고 서비스 간 호출 실패가 사라진다. 모듈 경계는 유지하므로 필요해지면 분리할 수 있다. 구현은 v1의 인증·호텔·예약 서비스 코드를 합쳐 재사용하고, README에 v1 팀원의 기여를 표기한다.

<a name="adr-005"></a>
## ADR-005 Aurora 대신 RDS for MySQL

- **근거:** 이 규모에서 Aurora의 최소 비용과 리전 간 기능(Global Database)은 필요 이상이다. Multi-AZ와 리전 간 백업으로 요구를 충족한다. 커뮤니티 MySQL이라 덤프 이식성도 좋다.
- **결과:** 장애 조치 시간이 Aurora보다 길 수 있다. 4단계에서 실측한다.

<a name="adr-006"></a>
## ADR-006 API Gateway 대신 CloudFront VPC Origin + Internal ALB

- **상황:** 백엔드를 인터넷에 노출하지 않는다는 원칙은 유지해야 한다.
- **검토한 대안:** API Gateway + VPC Link + Internal ALB(v1), Public ALB, CloudFront VPC Origin + Internal ALB.
- **결정:** CloudFront VPC Origin.
- **근거:** 백엔드는 프라이빗으로 유지하면서 거치는 단계와 설정이 줄어든다. API Gateway의 역할은 CloudFront·ACM(TLS), WAF(요청 제한), 앱 JWT(인증)가 나눠 맡는다.
- **결과:** API 키별 사용량 계획 같은 API Gateway 고유 기능은 없다(현재 요구 없음). 비용 절감보다는 단순화 효과가 크다.

<a name="adr-007"></a>
## ADR-007 Cognito 대신 앱 자체 JWT

- **근거:** 회원가입·로그인 정도의 범위에 비해 외부 의존과 설정이 늘어난다. 사용자 정보가 DB 백업에 함께 들어가 리전 복원 경로가 하나가 된다. Cognito는 비밀번호 해시를 내보낼 수 없어 나중에 옮기기도 어렵다.
- **결과:** 소셜 로그인·MFA는 없다(범위 밖). 비밀번호 해시와 토큰 만료를 직접 관리한다.

<a name="adr-008"></a>
## ADR-008 DMS CDC 대신 덤프로 이관

- **상황:** v1은 VPN + DMS Full Load + CDC로 이관했다. IDC 역할 DB는 `t3.micro` 1대, 시드 데이터는 31KB였다.
- **결정:** 점검 시간 중 `mysqldump`로 이관.
- **근거:** 이관 방식은 데이터 크기와 허용 중단 시간으로 고른다. 작은 DB에 점검 시간이 허용되면 덤프가 가장 단순하고 검증이 쉽다. DMS CDC는 중단을 허용할 수 없을 때 쓴다.
- **결과:** 점검 시간 동안 쓰기가 멈춘다. 그 시간을 실측해 공개한다.

<a name="adr-009"></a>
## ADR-009 DR 전략: Multi-AZ + 리전 간 Backup & Restore

- **검토한 대안:**

  | 전략 | 평소 다른 리전 상태 | 대략적인 RTO |
  |---|---|---|
  | Backup & Restore | 백업만 있음 | 시간 단위 |
  | Pilot Light | DB만 켜서 복제 | 수십 분 |
  | Warm Standby | 전체를 작게 운영 | 분 단위 |
  | Active-Active | 양쪽이 모두 트래픽 처리 | 거의 0 |

- **결정:** AZ 장애는 Multi-AZ, 리전 장애는 Backup & Restore.
- **근거:** 소규모 회사이고 리전 장애 시 수 시간 내 복구를 받아들일 수 있다고 가정했다. 평소 비용이 가장 적다.
- **결과:** RTO가 Pilot Light보다 길다. 실측값으로 제시하고, 요구가 강해지면 도쿄 읽기 복제본(Pilot Light)으로 확장한다. 리전 간 백업은 국외 보관이므로 개인정보 국외 이전 고지가 필요하다는 가정을 둔다.

<a name="adr-010"></a>
## ADR-010 CI/CD: GitHub Actions + ECS 롤링 + 자동 롤백

- **검토한 대안:** CodePipeline + CodeBuild + CodeDeploy Blue/Green(v1), GitHub Actions.
- **결정:** GitHub Actions, ECS 롤링 배포, 배포 circuit breaker 자동 롤백.
- **근거:** 앱이 1개라 롤링으로 충분하다. 실패한 배포는 자동으로 되돌아간다. OIDC로 장기 액세스 키를 저장하지 않는다. 코드와 실행 기록이 한곳에 있다. v1에서 개발 초반에 파이프라인이 없어 배포가 어려웠던 경험을 반영해 처음부터 연결한다.
- **결과:** 트래픽 일부만 먼저 보내는 카나리나 Blue/Green은 없다.

<a name="adr-011"></a>
## ADR-011 Terraform: 작은 범용 모듈 없이, regional만 모듈 + 리전별 루트

- **상황:** 처음(2026-11-03)에는 `regional` 루트 하나를 region 변수로 서울과 도쿄에 적용하기로 했다. 1단계(2026-11-09)에서 명령어 옵션으로 환경을 바꾸는 방식의 혼동 위험을 다시 검토해 고쳤다.
- **검토한 대안:**
  1. `regional` 루트 하나에 `-var region`과 state 경로 옵션을 바꿔 가며 적용(처음 결정): 리전과 state를 옵션 두 개로 따로 고르므로, 짝이 어긋나면 서울 state가 도쿄 내용으로 덮이고 서울 리소스가 Terraform 관리 밖으로 빠진다(요금은 계속 나간다).
  2. 리소스 1~2개를 감싸는 작은 범용 모듈(vpc, ec2 등): 앱이 1개라 다시 쓸 곳이 없고 읽기만 어려워진다.
  3. 공통 값 모듈로 provider 설정 공유: provider 설정은 루트마다 두는 것이 Terraform 규칙이라(모듈은 불러 준 루트의 설정을 물려받는다) 모듈로 공유할 수 없다.
- **결정:** `bootstrap`·`global`·`legacy`·`seoul`·`tokyo` 루트로 나눈다. 서울과 도쿄에 똑같이 만드는 리소스는 `modules/regional` 하나에 두고, `seoul`·`tokyo` 루트는 리전·state 위치·provider를 파일에 고정한 채 이 모듈을 호출한다. 실행은 각 루트 폴더에서 `terraform apply`·`destroy`만 쓰고, `-var`·`-backend-config` 같은 옵션으로 환경을 바꾸지 않는다. 앱을 바꿀 때 필요한 값(이미지, 포트, 헬스체크 경로, CPU·메모리, 스키마 변경 명령)만 변수로 뺀다.
- **근거:** 환경이 폴더에 고정돼 섞일 수 없다. 리전 복원 드릴이 `cd tokyo && terraform apply`로 단순해진다. 서울과 도쿄의 state가 분리돼 있어 서울 장애 중에도 도쿄만 적용할 수 있다.
- **결과:** 루트마다 provider 설정이 짧게 반복되는 것은 받아들인다. 두 번째 앱이 생기면 그때 공통 부분을 더 모듈로 뽑는다. legacy는 환경이 하나라 모듈 없이 둔다.

<a name="adr-012"></a>
## ADR-012 리전 전환은 DNS가 아니라 CloudFront 원본 전환

- **상황:** 리전 장애 때 도쿄에 복원한 환경으로 사용자 트래픽을 보내야 한다.
- **검토한 대안:** 리전별 CloudFront를 두고 Route 53 레코드 전환, 하나의 CloudFront에서 원본만 전환.
- **결정:** 원본 전환(`active_region` 변수).
- **근거:** CloudFront는 글로벌 서비스라 서울 장애의 영향을 받지 않는다. DNS 캐시 지연이 없고, 같은 도메인을 CloudFront 배포 두 개에 동시에 붙일 수 없는 제약도 피한다.
- **결과:** CloudFront 설정 반영 시간에 의존하므로 실측한다. 다른 리전 VPC Origin으로 전환이 가능한지는 구현 전에 확인한다. 글로벌 서비스 자체의 장애는 범위 밖이다.

<a name="adr-013"></a>
## ADR-013 정적 프론트를 앱 컨테이너에 포함

- **상황:** 화면은 v1의 정적 파일에서 시작해 React(app/web)로 다시 만들었다. 빌드 결과는 정적 파일이다.
- **검토한 대안:** S3 + OAC로 따로 배포, 앱 컨테이너에 포함.
- **결정:** 앱 컨테이너에 포함하고 Express가 API와 함께 내보낸다.
- **근거:** 배포물이 1개라 프론트와 API 버전이 항상 맞는다. 리전 복원 때 S3 버킷·접근 설정·복제를 따로 챙기지 않아도 된다. CloudFront가 화면 파일을 캐시하므로 서버 부담은 작다.
- **결과:** 화면만 따로 배포할 수 없다. 프론트가 커지거나 담당 팀이 따로 생기면 S3 분리를 다시 검토한다. React 빌드 파일은 이름에 해시가 붙어 길게 캐시하고, `index.html`만 짧게 캐시한다.

<a name="adr-014"></a>
## ADR-014 선착순 쿠폰은 DB 조건부 갱신으로 처리

- **상황:** 쿠폰 오픈 시각에 요청이 몰려도 수량을 넘겨 발급하면 안 되고, 한 사람이 여러 장 받아서도 안 된다.
- **검토한 대안:** 앱에서 조회한 뒤 발급(동시 요청에서 초과 발급), Redis 원자적 카운터, 대기열(SQS 등), DB 조건부 갱신.
- **결정:** DB 조건부 갱신. `issued_count < quantity`일 때만 1을 올리고, (쿠폰, 사용자) 유니크로 1인 1매, CHECK 제약으로 한 번 더 막는다.
- **근거:** 구성 요소를 늘리지 않고 정합성을 DB가 보장한다. 예약의 이중 예약 방지와 같은 원리다. 이 규모의 부하는 단일 행 갱신으로 처리할 수 있다고 가정하고 실측한다.
- **결과:** 모든 발급 요청이 쿠폰 한 행을 두고 줄을 서므로 처리량에 상한이 있다. 이 상한을 부하 테스트로 재고, 부족하면 Redis 카운터나 대기열을 다음 단계로 검토한다. 구현 중 잠금 순서가 반대이면 교착이 나는 것을 동시성 테스트로 발견해 "쿠폰 행을 먼저 잠금"으로 고쳤다.

<a name="adr-015"></a>
## ADR-015 예정된 급증은 예약 스케일링, 예상 못 한 급증은 목표 추적

- **상황:** 쿠폰 이벤트는 오픈 시각을 미리 알지만 그 순간에 몰리고, 바이럴 급증은 예고가 없다.
- **결정:** 이벤트는 오픈 전에 최소 태스크 수를 올리는 예약 스케일링으로, 그 밖에는 CPU·요청 수 기반 목표 추적 오토스케일링으로 대응한다.
- **근거:** 목표 추적은 지표가 오른 뒤에 늘리기 시작하므로 반응에 시간이 걸린다. 오픈 순간의 급증에는 늦다.
- **결과:** 이벤트 일정이 바뀌면 예약도 함께 바꿔야 한다. 예약 스케일링 유무에 따른 오픈 순간 응답 시간을 3단계에서 비교한다.

<a name="adr-016"></a>
## ADR-016 이전 환경은 IDC처럼: 약점은 그대로, 관리형 서비스는 필요할 때만

- **상황:** 1단계는 이관 전 IDC(운영 중인 서비스)를 AWS 위에 재현해 부하 기준선을 잰다. 3단계 비교와 4단계 장애 테스트의 "개선 전"이 된다.
- **검토한 대안:**
  - 다중 AZ: 고가용성은 좋지만 재현할 약점("서버 하나가 죽으면 그 기능이 통째로 중단")이 사라져 R2 비교 대상이 없어진다.
  - NAT 게이트웨이: 이 환경에서 가장 비싸고, 패키지 설치용 출구는 NAT 인스턴스로 충분하다.
  - S3 게이트웨이 엔드포인트(무료, NAT 대신): Amazon Linux 기본 패키지 저장소는 S3에 있어 인터넷 없이 받을 수 있지만, DB 컨테이너 이미지(`mysql:8.4`)는 Docker Hub(인터넷)에서 받아야 해서 결국 NAT가 필요하다([ADR-021](#adr-021)).
  - Session Manager: EC2에는 추가 요금이 없지만 프라이빗 서브넷에서 쓰려면 인터페이스 엔드포인트(시간당·GB당 요금)나 NAT가 필요하다. SSH로 충분하다.
  - 배포 자동화(GitHub Actions → EC2): 22번을 GitHub Actions에 열어야 하는데, 실행 서버의 IP 범위가 넓고 자주 바뀌어 보안 그룹 허용 목록으로 쓰기 어렵다.
- **결정:** 관리형 서비스는 비용과 필요를 따져 꼭 필요할 때만 쓴다([ADR-006](#adr-006)에서 API Gateway를 뺀 것과 같은 기준). 이전 환경은 IDC 재현이 목적이므로 약점을 가리는 구성은 넣지 않는다. VPC·EC2·보안 그룹은 IDC의 네트워크·서버·방화벽을 대신하는 것이라 쓰고, IDC에 대응물이 없는 관리형 서비스(S3 등)는 쓰지 않는다.
  - 단일 AZ, 역할별 1대: 웹+앱 EC2(퍼블릭 서브넷, 로드밸런서 없이 사용자 요청을 직접 받음), MySQL EC2(프라이빗 서브넷, Docker로 실행, [ADR-021](#adr-021))
  - DB 서버 패키지·이미지 설치용 NAT 인스턴스 1대(v1 방식). IDC 라우터·방화벽의 NAT 역할이다.
  - 서버 접속은 SSH. DB 서버는 앱 서버를 거쳐 접속하고, 보안 그룹은 IP 대신 보안 그룹을 출발지로 지정한다.
  - 배포는 수동: PC에서 이미지를 빌드해 Docker Hub에 올리고, SSH로 앱 서버에 접속해 받아서 재시작한다. 배포 자동화는 이관 대상인 2단계([ADR-010](#adr-010))에서 한다.
- **근거:** 이전 환경의 약점이 그대로 있어야 이관 후 개선을 숫자로 보여 줄 수 있다. 다중 AZ처럼 약점을 가리는 구성을 넣으면 비교 기준이 흐려진다.
- **결과:** EC2가 계획한 2대에서 3대가 된다(t3.small 기준 작업 시간 월 약 $11 → $15였으나, 앱·DB도 t3.micro로 정해([ADR-021](#adr-021)) 약 $10, [09 비용 추정](09-cost-estimate.md)). NAT 인스턴스도 단일 장애점이지만 이전 환경에서는 의도한 것이다. DB 서버가 패키지·이미지를 받으려고 NAT로 인터넷에 나갈 수 있는 것도 그대로 둔다. 실제 IDC라면 DB 서버는 인터넷에 직접 나가지 않고 사내 미러·레지스트리를 쓰는 경우가 많지만, 비용·시간 때문에 단순화했다. 3단계 RDS는 AWS가 패치하므로 DB에 인터넷 출구가 필요 없다. SSH 22번은 작업 장소(학원·집) IP만 허용하고, 개인 키는 저장소에 올리지 않는다. NAT 보안 그룹은 다른 보안 그룹과 참조를 주고받지 않고 규칙이 인바운드·아웃바운드 1개씩이라 Terraform 인라인 규칙으로 쓴다(별도 규칙 리소스는 서로 참조하는 보안 그룹에만). 앱·DB 보안 그룹도 참조가 한 방향(DB 인바운드 3306·22의 출발지 = 앱 보안 그룹)이다. 두 그룹 모두 이미지·패키지를 받으려고 아웃바운드를 0.0.0.0/0으로 열어 앱 쪽이 DB 그룹을 가리킬 일이 없으므로 인라인으로 쓴다. 웹과 앱은 같은 컨테이너([ADR-013](#adr-013))라 그 사이에는 보안 그룹이 없다.

<a name="adr-017"></a>
## ADR-017 이전 환경도 Terraform으로

- **상황:** v1 원본(`3tier-seoul.yml`)은 CloudFormation이고, 2단계부터는 Terraform을 쓴다.
- **검토한 대안:** CloudFormation 유지(원본을 줄이기만 하면 되고 state 관리가 없다).
- **결정:** `infra/legacy/`도 Terraform으로 작성한다.
- **근거:** 프로젝트 안의 IaC 도구를 하나로 맞춘다. 작업 시간에만 켜고 끝나면 destroy하는 흐름을 1단계부터 2단계와 같은 명령으로 익힌다. 원본의 CloudFormation 리소스를 Terraform 리소스로 직접 옮기며 학습한다.
- **결과:** 1단계 state는 로컬 파일이고 커밋하지 않는다. 원격 state(S3)는 2단계 bootstrap에서 만든다.

<a name="adr-018"></a>
## ADR-018 루트는 잠그고, 평소엔 최소 권한 + 관리자는 역할 전환

- **상황:** 공용 PC(학원)와 집 PC에서 작업한다. PC에 AWS CLI가 없었다.
- **검토한 대안:**
  - 루트로 직접 작업: 권한을 줄일 수 없고 계정 해지·결제 변경까지 가능하다. AWS도 일상 작업에 쓰지 말라고 권고한다.
  - IAM 사용자를 관리자 그룹에 넣기: 평소에도 관리자라 실수나 세션 유출의 피해 범위가 계정 전체다.
  - 평소용·관리자용 IAM 사용자 2개: 관리자 자격 증명이 항상 살아 있고 비밀번호·MFA가 2벌이다.
  - IAM 액세스 키: 장기 키가 PC에 남아 공용 PC에서 지우지 않으면 계속 유효하다.
  - CloudShell: 키가 남지 않지만 Terraform이 설치돼 있지 않고, 20~30분 입력이 없으면 끊기며, 홈 1GB는 120일 쓰지 않으면 삭제된다.
  - IAM Identity Center: 과거 활성화 후 무료 크레딧이 끝난 경험이 있어 제외했다(원인 미확인).
- **결정:** 루트는 MFA를 걸고 결제·계정 설정과 처음 IAM 구성에만 쓴다. 일상 작업은 MFA를 건 IAM 사용자 1개로 하고, 권한은 그룹으로 최소한만 준다. 관리자 권한(AdministratorAccess)은 MFA로 로그인해야 전환할 수 있는 관리자 역할로 분리해 필요할 때만 쓴다. CLI는 `aws login`(AWS CLI 2.32.0 이상)으로 임시 자격 증명을 받는다.
- **근거:** 장기 액세스 키가 어디에도 없다. 공용 PC에 세션이 남아도 최대 12시간 뒤 만료되고 `aws logout`으로 바로 지울 수 있다. 관리자 권한은 필요할 때 역할 전환으로 받는 임시 자격 증명으로만 존재한다. 사고가 나면 루트로 IAM 사용자만 끄면 된다.
- **결과:** Terraform은 `aws login` 자격 증명을 `credential_process` 없이 바로 읽는다(2026-11-10 1단계 plan에서 확인, Terraform 1.17.0 · AWS provider 6.72.0). 그룹 권한은 그 단계 Terraform이 쓰는 서비스부터 시작해, 권한 거부가 나면 원인을 보고 넓힌다. 1단계는 AWS 관리형 AmazonEC2FullAccess(`ec2:*`에 로드밸런서·CloudWatch·Auto Scaling까지 포함) 대신 필요한 액션만 적은 정책을 직접 써서 평소 그룹에 인라인 정책으로 붙인다. AWS는 관리형 정책으로 시작해 사용 기록(예: 90일)을 보고 줄이라고 권하지만, 이 프로젝트는 최소 권한을 직접 설계해 보는 것이 목적이고 매일 만들고 지워서 그만큼 기록이 쌓이지 않는다. 정책은 읽기 `ec2:Describe*`·`ec2:GetConsoleOutput`, 쓰기는 그 단계 리소스의 만들기·바꾸기·지우기 액션만 서울 리전 조건으로 허용한다([legacy-operator-policy.json](../infra/iam/legacy-operator-policy.json), 2026-11-10 평소 사용자로 apply·destroy 통과). 2단계 루트의 state 권한은 [ADR-028](#adr-028). 콘솔에서 관리자 역할로 전환한 상태로 `aws login`을 하면 CLI 세션도 관리자 역할이 된다(2026-11-10 확인, `login_session`에 역할 ARN). 평소 권한으로 작업하려면 역할에서 돌아온 상태로 로그인하고 `aws sts get-caller-identity`가 `:user/`인지 확인한다. 2단계 GitHub Actions는 사용자 대신 OIDC 역할을 쓴다.

<a name="adr-019"></a>
## ADR-019 k6 부하는 서울 리전 EC2에서

- **상황:** 1단계 기준선과 3단계 비교에서 "서버가 어디서 무너지는지"를 잰다.
- **검토한 대안:** 내 PC(비용이 없지만 인터넷 왕복 지연과 회선·PC 한계가 측정값에 섞인다).
- **결정:** 대상과 같은 서울 리전의 EC2에서 보내고, 3단계도 같은 위치에서 보낸다. 측정할 때만 켠다.
- **근거:** 에러율이 기준을 넘었을 때 서버 한계인지 회선 한계인지 구분할 수 있어야 한다. 많은 사용자는 보내는 위치가 아니라 VU 수로 흉내 낸다.
- **결과:** 측정값에 실제 사용자의 인터넷 지연은 들어가지 않는다. 발생기 자체가 병목이 아닌지 부하 EC2의 CPU도 함께 기록한다. 부하 EC2 비용이 추가된다.

<a name="adr-020"></a>
## ADR-020 이미지 저장소: Docker Hub 대신 ECR

- **상황:** 2단계 CD는 GitHub Actions에서 이미지를 빌드해 올리고, 프라이빗 서브넷의 ECS Fargate 태스크가 받아서 뜬다. 1단계 이전 환경은 Docker Hub를 쓴다([ADR-016](#adr-016)).
- **검토한 대안:** Docker Hub(무료, 1단계와 같은 저장소), ECR.
- **결정:** ECR. 도쿄로 리전 간 복제하고, 올릴 때 기본 취약점 스캔을 켠다.
- **근거:**
  - 장기 키가 없다. 올릴 때는 GitHub OIDC 역할, 받을 때는 ECS 실행 역할을 쓴다. Docker Hub는 CI에 토큰(장기 비밀값)을 저장해야 한다.
  - 받기 횟수 제한을 걱정하지 않아도 된다. 태스크는 NAT 게이트웨이 1개(공인 IP 1개)로 나가는데, Docker Hub는 로그인하지 않으면 IP당 6시간에 100회(로그인한 무료 계정은 200회)로 제한된다. 오토스케일링·예약 스케일링·장애 테스트처럼 태스크가 한꺼번에 뜰 때 이미지를 못 받으면 확장이 실패한다.
  - 외부 의존이 줄어든다. 리전 간 복제와 취약점 스캔을 AWS 안에서 처리한다.
- **결과:** 저장 용량만큼 비용이 들지만 이미지 몇 개 수준이라 작다. Docker Hub도 AWS 밖에 있어 리전 장애 자체의 영향은 받지 않으므로, ECR을 고른 이유는 리전 장애 대비보다 키와 외부 의존을 줄이는 데 있다.

<a name="adr-021"></a>
## ADR-021 이전 환경 서버는 빠르고 싸게: DB도 Docker, 비밀값은 SSH로, HTTP

- **상황:** 앱·DB EC2를 올리기 전에 MySQL 설치 방식, 비밀값(DB 비밀번호, JWT 서명 키) 전달 방법, 웹 포트를 정해야 한다. 1단계는 개선 전 기준선을 만드는 단계이고, 이 프로젝트의 핵심은 2단계 이후다.
- **검토한 대안:**
  - MySQL 공식 저장소(dnf): IDC에서 흔한 설치 방식에 더 가깝지만, 스키마·시드 넣기와 계정·문자셋 설정을 로컬과 별도로 새로 짜야 한다. 3단계 RDS 이관은 어느 쪽이든 mysqldump라 차이가 없다.
  - 비밀값을 user_data로: EC2 읽기 권한(`ec2:DescribeInstanceAttribute`, 평소 정책의 `ec2:Describe*`에 포함)만 있어도 보이고, 서버 안의 모든 프로세스가 인스턴스 메타데이터로 읽을 수 있다. Terraform 변수로 넣으면 state에도 평문으로 남는다.
  - SSM Parameter Store + 인스턴스 역할: 관리형 서비스라 IDC 재현([ADR-016](#adr-016))과 맞지 않는다. 평소 사용자에게 역할 생성·`iam:PassRole` 권한을 줘야 해서 최소 권한([ADR-018](#adr-018))과도 부딪힌다. 역할을 만들어 정책을 붙이고 EC2에 넘길 수 있으면 관리자 권한도 얻을 수 있다.
  - HTTPS: 도메인은 있지만 apply할 때마다 공인 IP가 바뀌어 DNS 레코드와 인증서를 매번 다시 맞춰야 한다. 탄력적 IP로 고정하면 꺼 둔 시간에도 요금이 든다.
- **결정:**
  - DB는 EC2에 Docker로 `mysql:8.4`를 띄우고, 스키마·시드는 로컬 docker-compose와 같은 initdb로 넣는다. 부하 측정용 데이터(`scripts/seed-volume.sql`: 숙소 1,000 · 회원 2만 · 예약 10만 · 리뷰 5만)도 initdb 세 번째 파일로 매일 넣어, 1단계 기준선과 3단계 비교·덤프 이관이 같은 데이터 양에서 이뤄지게 한다.
  - user_data에는 설치처럼 비밀값이 없는 단계만 넣는다. 비밀값은 PC의 저장소 밖 파일에 두고 SSH로 서버에 보내(권한 600) `docker run --env-file`로 넘긴다. 매일 destroy하므로 서버에서 직접 입력하지 않는다. Terraform 변수·state에도 넣지 않는다.
  - 웹은 HTTP 80으로 받아 `docker run -p 80:3000`으로 앱에 넘긴다. 프론트가 앱 컨테이너 안에 있어([ADR-013](#adr-013)) 별도 웹 서버(nginx)는 두지 않는다.
  - 앱·DB EC2는 NAT와 같은 t3.micro(2 vCPU · 1GB)로 하고, 세 대가 타입 변수 하나를 같이 쓴다. 3단계 비교 대상(RDS db.t4g.micro 1GB, Fargate 태스크 1GB 가정)과 같은 메모리 급이고, v1의 IDC 역할 DB도 t3.micro였다([ADR-008](#adr-008)). 비용도 t3.small의 절반이다.
- **근거:** 1단계에는 시간과 비용을 적게 쓴다. 로컬에서 검증한 compose 설정을 그대로 쓰면 새로 짤 것이 줄어든다. 컨테이너로 띄워도 서버에서 직접 운영하는 DB라는 점은 같아서 3단계 RDS와의 비교는 그대로 남는다. 비밀값을 서버 파일로 두는 것은 IDC에서 운영자가 설정 파일을 두던 방식과 같다.
- **결과:**
  - 실제 운영 서비스라면 IDC에서도 HTTPS를 썼겠지만 1단계에서는 범위 밖으로 둔다. 로그인 정보가 평문으로 오가므로 시드 계정만 쓴다. HTTPS는 2단계 CloudFront + ACM에서 붙고 개선 항목이 된다. 3단계와 비교할 때는 HTTP·HTTPS 차이를 실험 조건에 적는다.
  - 비밀값이 필요한 단계(앱 env 파일, DB 컨테이너 시작)는 PC에서 SSH로 하는 수동 작업이다. 비밀값은 서버에서 평문으로 남는다: env 파일(600, DB는 컨테이너를 띄운 뒤 지움)과 컨테이너 설정(`docker inspect`, root만). 2단계는 Secrets Manager가 시작할 때 주입해 서버 파일이 없고 교체(rotation)도 된다. SQL 파일은 비밀값이 아니므로 DB user_data가 공개 저장소(GitHub)에서 받는다. 내용을 user_data에 넣지 않으니 16KB 한도와 상관없다.
  - 1GB라 MySQL 컨테이너와 Docker가 함께 돌기에 빠듯하다. 설치 단계에서 뜨지 않으면 t3.small로 올리고, 부하 중 메모리 부족은 기준선 결과로 기록한다. DB만 키워야 하면 그때 DB 전용 타입 변수로 나눈다.
  - DB 이미지도 인터넷(Docker Hub)에서 받으므로 NAT는 그대로 필요하다. 2단계 비밀값은 Secrets Manager에 둔다([02 아키텍처](02-architecture.md)).

## ADR-022 이미지 태그는 커밋 SHA

- **상황:** 1단계 수동 배포([ADR-016](#adr-016))는 PC에서 빌드한 이미지를 Docker Hub 공개 저장소에 올리고 앱 서버가 받는다. 태그 규칙이 필요하고, 2단계 CD([ADR-010](#adr-010))·ECR([ADR-020](#adr-020))도 같은 규칙을 이어 쓴다.
- **검토한 대안:** `latest`. 명령은 짧지만 태그가 올릴 때마다 다른 이미지로 옮겨 간다. 지금 서버에서 도는 코드가 어느 커밋인지 답할 수 없고, 이전 `latest`가 사라져 되돌릴 이름이 없으며, 서버에 같은 태그가 이미 있으면 `docker run`이 새 이미지를 받지 않는다.
- **결정:** 태그는 짧은 커밋 SHA(`git rev-parse --short HEAD`)로 한다. 빌드 범위인 `app` 폴더에 커밋하지 않은 변경이 없을 때만 빌드한다(`git status --short app`가 비어 있음). [start-app.sh](../infra/legacy/start-app.sh)는 태그를 인자로 받고 `run` 전에 `pull`한다.
- **근거:** 이미지와 커밋이 1:1로 이어져 롤백(이전 SHA로 다시 배포), 원인 추적(두 SHA 사이 `git diff`), 라이브러리 취약점 영향 판단(그 커밋의 `package-lock.json`)이 된다. 2026-11-11 예약 화면 버그를 고친 커밋 `62702e2`를 새 태그로 다시 배포했고, 브라우저가 받는 JS 파일명이 바뀐 것으로 새 이미지가 뜬 것을 확인했다.
- **결과:** 태그 이름은 변조를 막지 못한다. SHA 태그도 쓰기 권한이 있으면 같은 이름으로 덮어쓸 수 있고, 공개 저장소는 태그 목록이 보여 SHA를 숨길 수도 없다. 막는 것은 쓰기 토큰 관리, 태그 불변 설정, 다이제스트(`@sha256:`) 고정이다. Docker Hub 개인 액세스 토큰은 저장소 하나로 범위를 좁힐 수 없어 계정의 모든 저장소에 쓰기 권한을 준다. 2단계 ECR에서는 장기 토큰 없이(OIDC) 올리고, 태그 불변 설정은 그때 정한다.

<a name="adr-023"></a>
## ADR-023 부하 기준선 조건: 발생기는 퍼블릭 서브넷에서 앱 공인 IP로, t3는 unlimited 명시

- **상황:** 1단계 기준선([ADR-019](#adr-019))을 3단계 목표 구조와 비교한다. 서버는 모두 t3.micro이고, 프라이빗 서브넷의 인터넷 출구는 NAT 인스턴스(t3.micro) 1대다. 3단계 앱은 ECS 태스크 여러 개라 사설 IP가 뜰 때마다 바뀌고, 사용자는 CloudFront로만 들어온다.
- **검토한 대안:**
  - 발생기를 프라이빗 서브넷에: 부하 전부가 NAT t3.micro를 지나가 앱이 아니라 NAT의 한계를 잴 수 있다.
  - 앱 사설 IP로 보내기: 1단계만 내부 통로로 재면 3단계(CloudFront)와 들어가는 문이 달라진다.
  - t3 standard: 추가 요금은 없지만 크레딧이 바닥나면 CPU가 기준 사용률(t3.micro vCPU당 10%)로 내려가, 시험을 몇 분 돌렸느냐에 따라 한계가 달라진다(앱이 아니라 크레딧 잔고를 잰다).
  - 화면 사이 고민 시간을 줄여(예: 6초 → 0.6초) 적은 VU로 같은 초당 요청 만들기: 발생기는 t3.micro로 충분하지만, 서버가 쥐는 연결 수가 실제보다 적고(VU마다 연결 하나) 결과를 동시 접속자 수로 말할 수 없다.
- **결정:** 발생기는 퍼블릭 서브넷에 두고 앱의 공인 IP(사용자가 들어오는 문)로 보낸다. 앱·DB·발생기 3대 모두 Terraform에 `credit_specification`을 unlimited로 적는다. 손님 행동(화면 사이 5~20초)은 E-01 그대로 두고 발생기를 키운다. 발생기 타입은 최종 시나리오를 로컬에서 100명으로 돌려 잰 VU당 메모리 × 필요한 VU 수로 고른다(k6 권장 방법). 넉넉한 타입(xlarge)을 재지 않고 고르는 것보다 시간당 최대 $0.16 아낀다.
- **근거:** IDC 서버와 3단계 Fargate에는 크레딧 제한이 없어 기준선도 제한 없이 재야 비교가 맞다. T3는 기본이 unlimited지만 계정 기본값은 바꿀 수 있어 측정 조건을 코드에 남긴다.
- **결과:** 크레딧을 다 쓴 뒤의 초과분은 vCPU-시간당 $0.05(Linux)이고 정지·종료할 때 정산된다. t3.micro 한 대가 1시간 내내 CPU 100%여도 약 $0.09(쓰는 120 − 버는 12 = 108크레딧 = 1.8 vCPU-시간)다. T3는 시작 크레딧이 없다. 크레딧 지표(`CPUCreditBalance`, `CPUSurplusCreditsCharged`)는 평소 사용자에 CloudWatch 권한이 없어 보지 않고, 방식만 `describe-instance-credit-specifications`로 확인한다. 발생기 크기는 비교 조건이 아니다(병목이 아니었음만 기록). VU당 메모리(2026-11-11 로컬, `baseline.js`를 100명 1분 → 200명 1분): k6 컨테이너 평균 71MiB → 98MiB. 차이로는 1명당 0.27MiB지만 k6가 최대 인원만큼 VU를 미리 만들어 두고 로컬 숙소가 10개라 응답이 작아 적게 나온 값이므로, 200명에 98MiB → 1명당 약 0.5MiB로 잡아 3,000명 ≈ 1.5GiB + OS·Docker → **발생기 t3.medium(4GiB)**. t3.small(2GiB)은 k6 권장 상한(메모리 90%) 근처라 버림. 3단계는 같은 시나리오라 VU당 메모리를 그대로 쓰고 필요한 VU 수만 다시 곱한다. 서울 t3 단가(2026-11-11 Price List API): micro $0.013 · small $0.026 · medium $0.052 · large $0.104 · xlarge $0.208/시간. 출처: [크레딧 기본 개념](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html), [unlimited 모드](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode-concepts.html), [요금](https://aws.amazon.com/ec2/pricing/on-demand/)

<a name="adr-024"></a>
## ADR-024 2단계 전에 DB 병목을 로컬에서 분석·개선한다 (1단계 기록은 그대로)

- **상황:** [1단계 기준선](experiments/baseline.md)에서 옛날 구조는 동시 접속 500명에서 DB CPU 91~93%로 먼저 한계였고(앱 18~21%), 1,000명부터는 DB · 앱이 한가한데 실패가 97~99%였으며, 실패로 받았는데 저장된 예약이 1건 있었다. 3단계 목표 구조의 ECS 오토스케일링은 앱 수만 늘리고, RDS for MySQL은 인스턴스 크기와 읽기 전용 복제본 수를 자동으로 바꾸지 않는다([인스턴스 수정](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ModifyInstance.Settings.html), [자동 확장은 저장 공간만](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.Autoscaling.html)).
- **검토한 대안:**
  - 그대로 2단계로: 같은 앱이라 RDS에서도 같은 병목과 무너지는 방식이 옮겨 가고, 3단계 비교에서 원인을 설명할 수 없다.
  - 1단계 이전 환경을 고쳐 다시 재기: "IDC 그대로"인 기준선이 사라진다.
  - RDS를 크게 잡아 해결: 원인이 비싼 조회라면 비용으로 덮는 것이고, 무너지는 방식(시간 초과 처리)은 그대로다.
- **결정:** 2단계 전에 로컬에서(DB 컨테이너 CPU 제한 + seed-volume) 1단계의 모양을 재현해 원인을 찾고 앱을 고친다. 1단계 기록(옛 앱 + 옛 구조 = 500명)은 지우지 않는다. 고친 앱으로 같은 옛날 구조에서 한 번 더 재서 "앱 개선 효과"를 따로 남기고, 3단계는 고친 앱으로 비교해 "인프라 효과"만 남긴다.
- **근거:** 한 번에 하나씩 바꿔야 무엇 덕분에 좋아졌는지 나눠 설명할 수 있다. 로컬은 비용이 없다.
- **결과:** 03 진행 계획에 1.5단계가 생긴다. 로컬 PC는 t3.micro와 CPU가 달라 숫자가 아니라 모양(DB 포화, 무너지는 방식)을 재현한다. 옛날 구조 재측정에 AWS 1회(약 $0.3)가 든다.

<a name="adr-025"></a>
## ADR-025 bootstrap은 관리자 역할로 1회 적용, state는 도쿄 버킷 하나에 계정 전용 이름으로

- **상황:** 2단계 시작(2026-11-12). seoul·tokyo·global 루트는 원격 state가 필요하고, CD는 GitHub Actions용 IAM 역할이 필요하다. 이 둘과 Budgets 알림은 다른 루트보다 먼저 있어야 하고 매일 destroy하면 안 되므로 `bootstrap` 루트로 따로 둔다([ADR-011](#adr-011)). bootstrap은 IAM 역할을 만들고, 자기 state를 둘 버킷이 처음에는 없다. 저장소는 Public이고 backend 블록은 변수를 쓸 수 없어([backend](https://developer.hashicorp.com/terraform/language/backend)) 버킷 이름이 각 루트 파일에 그대로 들어간다.
- **검토한 대안:**
  - 평소 사용자 정책에 IAM 권한 추가: `iam:CreateRole`·`iam:AttachRolePolicy`가 있으면 자기를 신뢰하는 역할에 AdministratorAccess를 붙여 사실상 관리자가 된다(권한 상승). 막으려면 권한 경계를 `iam:PermissionsBoundary` 조건으로 강제해야 하는데([IAM 권한 경계](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html)), 가끔 적용하는 루트 하나에 비해 설계가 크다.
  - state 버킷을 서울에: 서울 장애 때 도쿄 루트의 state를 읽지 못해 리전 복원을 못 한다.
  - 리전별 버킷 2개 또는 리전 간 복제: 도쿄 장애 중에도 서울을 바꿀 수 있지만 버킷과 설정이 2벌이다.
  - 전역 이름 공간의 이름: 버킷 이름은 모든 계정에서 하나뿐이고 지운 이름의 재사용은 보장되지 않는다([이름 규칙](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)). 우리 버킷이 없는 사이 남이 같은 이름을 만들면 이름이 적힌 루트가 남의 버킷을 향한다.
  - DynamoDB 잠금: Terraform 1.11.0부터 deprecated([S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)).
  - 지난 버전 3일 보관: 주말 한 번이면 지나가고, 드릴 때만 여는 tokyo 루트는 몇 주 뒤에야 문제를 알아챈다.
- **결정:**
  - bootstrap은 관리자 역할로 전환해 적용한다(apply 전 `aws sts get-caller-identity`가 `:assumed-role/`인지 확인). 평소 사용자 정책에는 IAM 권한을 넣지 않는다.
  - state 버킷은 도쿄(ap-northeast-1)에 1개, 계정 전용 이름 공간(`bucket_namespace = "account-regional"`, `<이름>-<계정ID>-ap-northeast-1-an`)으로 만든다.
  - 버전 관리를 켜고, 지난 버전은 30일이 지났고 최근 지난 버전 5개 밖으로 밀려났을 때만 지운다(5는 남기는 개수). 지난 버전이 없는 삭제 마커는 정리한다.
  - 잠금은 S3 네이티브 `use_lockfile`.
  - 버킷에 `prevent_destroy`를 걸고 `force_destroy`는 기본값(false)으로 둔다.
  - 공개 차단은 기본값에 맡기지 않고 코드에 적는다. 암호화는 적지 않는다(새 업로드는 SSE-S3로 암호화되고 끌 수 없다, [FAQ](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-encryption-faq.html)).
  - bootstrap 자신의 state는 로컬로 apply → backend 블록 추가 → `terraform init -migrate-state` 순서로, 한 PC에서 한 번에 버킷으로 옮긴다.
- **근거:**
  - 관리자 권한은 가끔 쓰는 bootstrap에만, 역할 전환의 임시 자격 증명으로만 존재한다.
  - 서울 장애 중에도 tokyo·global을 적용할 수 있다. 도쿄 장애 때는 서비스가 서울에서 그대로 돌고 인프라 변경만 잠시 못 한다.
  - 계정 전용 이름 공간은 다른 계정의 같은 이름 생성 요청을 거절한다([이름 공간](https://docs.aws.amazon.com/AmazonS3/latest/userguide/gpbucketnamespaces.html)). 대가로 계정 ID가 공개되지만 AWS는 계정 ID를 비밀로 보지 않는다([계정 식별자](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-identifiers.html)).
  - Terraform은 apply 중에도 원격 state를 최소 20초마다 저장하므로([TF_STATE_PERSIST_INTERVAL](https://developer.hashicorp.com/terraform/cli/config/environment-variables)) 개수 조건만으로는 긴 apply 한 번에 멀쩡한 버전이 밀려난다. 두 조건을 모두 넘어야 지우므로([수명 주기 규칙](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html)) 30일 안의 버전은 개수와 상관없이 남는다. 개수는 파일마다 세므로 `.tflock` 버전이 state 버전을 밀어내지 않는다.
  - plan은 코드에 적은 설정만 실제와 비교해 되돌린다. 기본값은 만들 때 한 번 적용될 뿐이다.
- **결과:**
  - 요금: IAM 역할·OIDC 공급자는 무료([IAM FAQ](https://aws.amazon.com/iam/faqs/)), 알림만 보내는 Budgets도 무료([Budgets 요금](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)). state 버킷은 legacy state가 리소스 약 30개에 51.6KB였던 것으로 보아 월 1센트 안팎으로 예상한다(가설, 첫 청구서로 확인).
  - 프로젝트가 30일 안에 끝나면 삭제 규칙은 사실상 돌지 않는다(전부 남김). 프로젝트 중 복구 가능성을 최대로 두려는 의도와 같고, 버킷이 남을 때를 대비한 규칙이다.
  - 도쿄 장애 중에는 어떤 루트도 apply할 수 없다.
  - 2-2에서 ECS가 쓰는 IAM 역할을 어느 루트가 만들지 같은 질문이 다시 나온다. → [ADR-029](#adr-029)
  - 프로젝트를 끝낼 때는 bootstrap state를 먼저 로컬로 되돌린다(backend 블록 삭제 → `terraform init -migrate-state`). state가 지울 버킷 안에 있으면 destroy 도중 state를 저장할 곳이 사라진다. 그다음 `prevent_destroy`를 풀고 버킷을 버전까지 비운 뒤 destroy한다. 콘솔에서 버킷을 바로 지우면 OIDC 역할 · 예산의 state도 함께 사라져 그것들은 손으로 지워야 한다.

<a name="adr-026"></a>
## ADR-026 GitHub OIDC 역할: main 브랜치만, 권한 정책은 리소스 이름이 정해지는 2-2에서

- **상황:** 2단계 CD는 GitHub Actions가 ECR 푸시와 ECS 배포를 한다([ADR-010](#adr-010)). runner가 AWS에 로그인해야 하는데 장기 액세스 키는 저장하지 않는다. AWS도 CI/CD처럼 AWS 밖에서 도는 작업은 JWT로 `AssumeRoleWithWebIdentity`를 불러 임시 자격 증명을 쓰라고 권한다([IAM 모범 사례](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)). v1은 AWS 배포를 CodePipeline이 GitHub에서 가져가는 방식(CodeConnections)으로 했고, Azure 배포는 GitHub Secrets에 Azure 비밀값을 저장했다.
- **검토한 대안:**
  - 신뢰 조건을 저장소 전체(`repo:...:*`)로: 리뷰 전 PR과 다른 브랜치의 job도 배포 역할을 받는다.
  - GitHub environment(`repo:...:environment:<이름>`)로: 배포 전 승인 같은 단계를 넣을 수 있지만 혼자 작업하는 지금은 과하다.
  - 권한 정책까지 지금 작성: ECR 저장소·ECS 클러스터·서비스·태스크 역할 이름이 2-2에서 정해진다.
- **결정:**
  - OIDC 공급자(`https://token.actions.githubusercontent.com`, 받는 대상 `sts.amazonaws.com`)와 역할 `hotel-booking-aws-v2-github-deploy`를 bootstrap에 둔다([iam.tf](../infra/bootstrap/iam.tf)). 공급자는 계정 안에서 URL마다 하나뿐이라 리전 루트에 둘 수 없다.
  - 신뢰 조건은 `StringEquals`로 `aud`와 `sub`를 고정한다. `sub`는 main 브랜치 하나: `repo:yubin05@87186282/hotel-booking-aws-v2@1443891878:ref:refs/heads/main`.
  - `thumbprint_list`는 적지 않는다.
  - 권한 정책은 2-2에서 리소스 이름이 정해질 때 bootstrap에 추가하고 관리자 역할로 다시 적용한다. 그전까지 역할은 권한이 없다.
- **근거:**
  - 2026-07-15 이후 만든 저장소는 `sub` 기본 형식이 `repo:OWNER@OWNER-ID/REPO@REPO-ID:...`다([OIDC 참조](https://docs.github.com/en/actions/reference/security/oidc)의 Immutable subject claims). 이 저장소는 2026-11-03에 만들었으므로 문서 첫 예시(`repo:ORG/REPO:...`)를 그대로 쓰면 맞지 않는다.
  - job이 environment를 참조하면 `sub`가 브랜치 형식 대신 environment 형식이 된다(같은 문서). 배포 job에 `environment:`를 붙이면 신뢰 조건도 같이 바꿔야 한다.
  - IAM은 GitHub 공급자를 믿는 신뢰 정책에 `sub` 조건이 없거나 값이 `*`·`?`뿐이면 만들기·바꾸기를 거부한다([OIDC 역할 만들기](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html)).
  - AWS는 신뢰하는 루트 CA로 GitHub 인증서를 검증하고 thumbprint는 그게 안 될 때만 쓴다. API로 만들 때 thumbprint는 선택이고, 빼면 IAM이 채운다([OIDC 공급자 만들기](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)). AWS provider 6.73.0 스키마에서 `thumbprint_list`는 선택 인자다(`terraform providers schema -json`으로 확인).
  - 신뢰 조건은 어디서 왔는지만 본다. main에 push할 수 있으면 워크플로를 고쳐 역할 권한 안의 일은 무엇이든 시킬 수 있으므로, 권한 정책을 최소로 잡는 것이 다음 방어선이다.
- **결과:**
  - GitHub에는 AWS 비밀값을 저장하지 않는다. 워크플로에는 `permissions: id-token: write`와 역할 ARN만 적는다.
  - 권한 없는 역할로 신뢰 조건만 먼저 확인했다. 손으로 실행하는 [oidc-check.yml](../.github/workflows/oidc-check.yml)이 역할을 받고 `aws sts get-caller-identity`까지 성공했다(2026-11-12). 이 API는 권한이 필요 없다([GetCallerIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_GetCallerIdentity.html)). main이 아닌 브랜치에서 거부되는지는 확인하지 않았다.
  - 저장소 이름을 바꾸거나 옮기면 `sub`가 바뀌므로 신뢰 조건을 고쳐야 한다.

<a name="adr-027"></a>
## ADR-027 예산 알림: 콘솔 예산을 import, 이메일은 커밋하지 않는 tfvars로

- **상황:** 1단계에서 콘솔로 만든 월 $50 예산(실제 50·80·100%, 예측 100%에서 이메일 알림)이 있다. 2단계부터 bootstrap 코드로 관리한다([ADR-025](#adr-025)). 예산 이름은 계정 안에서 하나뿐이라 같은 이름으로 만들면 `DuplicateRecordException`이 난다([CreateBudget](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_budgets_CreateBudget.html)). 저장소는 Public이다.
- **검토한 대안:**
  - 다른 이름으로 새로 만들고 콘솔 예산 삭제: 지우는 순서에 따라 알림이 겹치거나 비는 때가 생긴다.
  - 이메일을 코드에 그대로: 공개 저장소에 개인 이메일이 남는다.
  - 변수에 `sensitive = true`: plan에서 알림 블록 내용 전체가 가려져 무엇이 바뀌는지 볼 수 없다.
- **결정:**
  - `import` 블록(`계정ID:예산이름`)으로 가져온다. `terraform plan -generate-config-out`이 만든 설정에서 콘솔에서 정한 값(이름, 종류, 한도, 주기, 알림 4개)만 남긴다([budgets.tf](../infra/bootstrap/budgets.tf)).
  - 이메일은 변수로 받는다. 값은 `terraform.tfvars`(.gitignore), 형식은 `terraform.tfvars.example`에 둔다.
  - `metrics`는 `ignore_changes`로 Terraform이 건드리지 않게 한다.
  - import 블록은 남긴다.
  - 프로젝트를 끝낼 때 예산은 다른 리소스를 다 지우고 마지막 청구서가 $0인 것을 확인한 뒤 지운다.
- **근거:**
  - 생성된 설정은 `metrics = ["UnblendedCost"]`만 있고 `filter_expression`이 없어 plan이 실패했다(`all of filter_expression,metrics must be specified`). `metrics`를 빼면 plan이 실제 값을 지우려 한다. AWS provider 6.73.0 스키마에서 `metrics`는 선택 인자이고 AWS가 채우는 값(computed)이 아니다. 지웠을 때 AWS 동작은 확인하지 않았다.
  - 생성 설정에서 지운 나머지 줄(`account_id`, 기간, 빈 태그 · SNS 목록)은 plan 차이가 없었다.
  - import 블록은 다시 적용해도 아무 일이 없고, 공식 문서는 출처 기록으로 남기길 권한다([import](https://developer.hashicorp.com/terraform/language/import/single-resource)). apply 뒤 블록을 빼고 plan해도 `No changes`였다.
  - 알림만 쓰는 예산은 무료다([Budgets 요금](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)). 다른 리소스를 지운 뒤 남은 요금을 알려 줄 마지막 안전장치다.
- **결과:**
  - 이메일은 state(공개가 차단된 버킷)에는 남는다.
  - 다른 PC에서 bootstrap을 적용하려면 `terraform.tfvars`를 다시 만들어야 한다(GitHub로 옮겨지지 않는다).
  - 콘솔 예산이 없는 새 계정에 처음 적용할 때는 import 블록을 빼야 할 것으로 본다(가설: 없는 리소스를 import하면 plan이 실패한다).

<a name="adr-028"></a>
## ADR-028 평소 사용자의 state 권한: 루트별 허용 목록, bootstrap은 제외

- **상황:** 2-2부터 seoul·global 루트는 평소 사용자로 apply하고, state는 bootstrap과 같은 버킷의 `<루트>/terraform.tfstate`에 둔다([ADR-025](#adr-025)). 평소 그룹 인라인 정책([legacy-operator-policy.json](../infra/iam/legacy-operator-policy.json))에는 S3 권한이 없었다. Terraform S3 backend는 버킷에 `s3:ListBucket`, state 파일에 `GetObject`·`PutObject`, 잠금 파일(`<key>.tflock`)에 `GetObject`·`PutObject`·`DeleteObject`가 필요하다. state 파일은 Terraform이 지우지 않으므로 `DeleteObject`가 필요 없다([S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3#s3-bucket-permissions)).
- **검토한 대안:**
  - `<버킷>/*/terraform.tfstate` 같은 와일드카드: `bootstrap/terraform.tfstate`도 걸려 평소 사용자가 OIDC 역할·예산의 state를 읽고 덮어쓸 수 있다(예산 이메일도 state에 평문으로 있다). IAM ARN 와일드카드에는 "이것만 빼고" 문법이 없다.
  - `<버킷>/*` 허용 + `bootstrap/*` 명시 Deny: 막히긴 하지만 앞으로 버킷에 넣는 파일이 모두 자동으로 열린다. 명시 Deny는 다른 정책이 넓게 허용할 때 쓰는 가드레일이다.
  - ListBucket에 `s3:prefix` 조건: 문서 예시 값은 버킷 이름까지 포함한 `mybucket/path/to/my/key`이고, Terraform이 실제로 보내는 prefix는 확인하지 못했다(가설: 작업 공간 목록용 `env:/`). 어긋나면 init이 실패한다. ListBucket은 객체 이름 목록만 보이고 내용은 못 읽는다.
  - 기존 statement의 `aws:RequestedRegion` 조건 복사: 값(ap-northeast-2)이 버킷 리전(ap-northeast-1)과 다르고, S3 요청에서 이 키에 어떤 값이 들어가는지 확인하지 못했다. Resource가 이미 버킷 하나를 가리켜 조건이 더하는 것이 없다.
  - tokyo는 복원 드릴 때 도쿄 리소스 권한과 함께 추가: 한 묶음으로 리뷰할 수 있다.
- **결정:**
  - ListBucket은 버킷 ARN에 조건 없이 허용한다.
  - state 파일(`GetObject`·`PutObject`)과 잠금 파일 `<루트>/*.tflock`(`GetObject`·`PutObject`·`DeleteObject`)은 seoul·global·tokyo 경로만 나열한다. bootstrap은 적지 않아 기본 거부로 막는다.
  - 리전 조건은 붙이지 않는다. tokyo도 지금 넣는다.
- **근거:**
  - IAM은 명시적으로 허용하지 않은 요청을 기본 거부한다([평가 로직](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic_policy-eval-denyallow.html)). bootstrap은 관리자 역할로만 apply하므로 평소 사용자에게 필요 없다.
  - tokyo는 state 권한만으로 도쿄 리소스를 만들 수 없어 미리 넣어도 위험이 거의 없다.
- **결과:**
  - 2026-11-12 평소 사용자로 확인: 목록은 보이고, bootstrap state HeadObject는 403, 아직 없는 seoul state는 404다. GetObject와 ListBucket이 모두 있으면 없는 객체에 404를 준다([HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)). bootstrap이 403이므로 평소 그룹의 다른 정책도 bootstrap state를 허용하지 않는다. 쓰기·잠금은 seoul의 첫 plan에서 확인한다.
  - 루트를 새로 만들면 이 목록에 줄을 추가해야 한다.
  - 정책은 그룹 인라인이라 관리자 역할로 `put-group-policy`로 반영하고, 덮어쓰면 이전 내용이 남지 않는다. 반영 전에 `get-group-policy`로 백업한다. 파일 이름은 `legacy-`로 시작하지만 2단계 루트도 이 정책을 쓴다.

<a name="adr-029"></a>
## ADR-029 ECS 실행 역할: bootstrap에서 관리자가 만들고, 평소 사용자·CD에는 PassRole만

- **상황:** 2-2의 ECS 태스크는 실행 역할이 필요하다. ECS가 이 역할로 ECR 이미지를 받고, CloudWatch Logs로 로그를 보내고, Secrets Manager 비밀값을 꺼낸다([실행 역할](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)). 태스크 역할은 앱 코드가 AWS API를 부를 때 쓰는데, 앱에는 AWS SDK 의존성이 없다([태스크 역할](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)). 역할을 만드는 루트에는 IAM 생성 권한이 있어야 하고, 평소 사용자에게 그 권한을 주면 권한 상승이다([ADR-025](#adr-025)). 태스크 정의를 등록하는 쪽은 그 역할에 대한 `iam:PassRole`이 필요하다.
- **검토한 대안:**
  - global 루트(평소 사용자): `iam:CreateRole`·`AttachRolePolicy`로 자기를 믿는 역할을 만들고 AdministratorAccess를 붙이면, MFA를 거는 관리자 역할을 우회한다.
  - regional 모듈(seoul·tokyo가 각자): 같은 권한 상승에 더해, IAM 이름은 계정 전체에서 하나뿐이라 리전마다 다른 이름이 필요하다.
  - 평소 사용자 + 권한 경계 강제: 경계 정책 수정·삭제, 역할에서 경계 떼기 같은 구멍을 따로 막아야 해서 설계가 크다.
  - 권한을 AWS 관리형 `AmazonECSTaskExecutionRolePolicy`로: ECR·로그 액션 6개가 Resource `*`라 계정의 모든 저장소 이미지를 받고 모든 로그 그룹에 쓸 수 있다. Secrets Manager 권한은 없어 따로 추가해야 한다([관리형 정책](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonECSTaskExecutionRolePolicy.html)). 실무에서 가장 흔하고 위험도 읽기·로그 쓰기로 작다.
- **결정:**
  - 실행 역할은 bootstrap에서 관리자 역할로 만들어 상시 둔다.
  - 평소 사용자(seoul·tokyo apply)와 GitHub 배포 역할(태스크 정의 새 버전 등록)에는 이 역할 ARN으로 한정한 `iam:PassRole`만 준다.
  - 태스크 역할은 지금 만들지 않는다. 앱이 AWS API를 부를 일이 생기면(예: ECS Exec) 같은 방식으로 추가한다.
  - 권한은 직접 쓴다([iam.tf](../infra/bootstrap/iam.tf)). `ecr:GetAuthorizationToken`은 리소스 타입이 없어 `*`, ECR 받기 3개(`BatchCheckLayerAvailability`·`GetDownloadUrlForLayer`·`BatchGetImage`)는 저장소 ARN, 로그 2개(`CreateLogStream`·`PutLogEvents`)는 리소스 타입이 log-stream이라 `log-group:/ecs/hotel-booking-aws-v2:log-stream:*`. 서울·도쿄 두 리전을 나열한다. 비밀값 권한은 DB 비밀번호 보관 방식을 정한 뒤 추가한다.
- **근거:**
  - 비유하면 AssumeRole은 출입증을 내가 빌려 목에 거는 것, PassRole은 보관함의 정해진 출입증을 업체(ECS)에 맡기는 것, CreateRole은 출입증 발급기를 갖는 것이다. PassRole은 이미 있는 역할을 서비스에 맡길 뿐이라, 역할 권한은 관리자가 정해 둔 범위를 넘지 못한다. 범위를 `*`로 주면 어떤 역할이든 맡길 수 있으므로 ARN으로 한정한다([PassRole](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html)).
  - IAM은 글로벌이라 역할 하나를 서울·도쿄가 같이 쓴다. 복원 드릴 때 관리자 없이 tokyo를 apply할 수 있다. 역할은 무료다([IAM FAQ](https://aws.amazon.com/iam/faqs/)).
  - 필요한 액션만 직접 쓰는 것은 [ADR-018](#adr-018)과 같은 방침이고, 이 역할은 거의 바뀌지 않아 관리 부담이 작다. 액션별 리소스 타입은 [Service Authorization Reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference.html)의 기계 판독용 JSON으로 확인했다.
- **결과:**
  - 2026-11-12 관리자 역할로 apply(2개 추가, [ADR-030](#adr-030)의 이름). 실제로 이미지를 받고 로그를 쓰는지는 seoul 첫 apply에서 태스크가 뜰 때 확인한다. 액션이 하나라도 빠지면 태스크가 시작에 실패한다.
  - 역할 권한을 바꿀 때마다 관리자 apply가 필요하다.
  - 평소 사용자는 bootstrap state를 못 읽으므로([ADR-028](#adr-028)) seoul·tokyo는 역할을 이름으로 참조한다.
  - 평소 사용자 정책에 PassRole statement를 추가해야 한다.

<a name="adr-030"></a>
## ADR-030 리소스 이름: `hotel-booking-aws-v2` 접두사, 서울·도쿄 같은 이름

- **상황:** 실행 역할과 GitHub 배포 역할의 정책에 리소스 ARN을 적으려면 이름이 먼저 정해져야 한다([ADR-026](#adr-026), [ADR-029](#adr-029)). 도쿄는 서울과 같은 모듈로 만든다([ADR-011](#adr-011)).
- **검토한 대안:**
  - 리전 표시(`-seoul`·`-tokyo`): 알림이나 대시보드에서 이름만 보고 리전을 알 수 있다. 하지만 ECR은 복제해도 이름이 같고 바꿀 수 없으며([ECR 복제](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html)), IAM 역할은 계정 전체에서 이름이 하나뿐이라([CreateRole](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateRole.html)) 리전을 표시할 수 없어 규칙이 섞인다. ALB 이름은 32자까지라 리전과 용도를 붙이면 빠듯하다.
- **결정:** 접두사는 기존 버킷·역할과 같은 `hotel-booking-aws-v2`로 한다. 리전 리소스는 서울과 도쿄에서 같은 이름을 쓰고, 리전은 ARN과 provider로 구분한다.

  | 리소스 | 이름 | 범위 |
  |---|---|---|
  | ECR 저장소 | `hotel-booking-aws-v2` | 리전(복제하면 도쿄도 같은 이름) |
  | ECS 클러스터 | `hotel-booking-aws-v2` | 리전 |
  | ECS 서비스 | `app` | 클러스터 안 |
  | 태스크 정의 패밀리 | `hotel-booking-aws-v2-app` | 리전(클러스터에 속하지 않음) |
  | 실행 역할 | `hotel-booking-aws-v2-ecs-execution` | 계정 전체 1개 |
  | 로그 그룹 | `/ecs/hotel-booking-aws-v2` | 리전 |
  | ALB · 대상 그룹 | `hotel-booking-aws-v2` · `hotel-booking-aws-v2-app` | 리전 |

- **근거:** ALB와 대상 그룹 이름은 리전·계정마다 하나면 된다([ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateLoadBalancer.html), [대상 그룹](https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateTargetGroup.html)). IAM 정책과 CD 워크플로에서 이름은 고정되고 리전만 바뀐다. 도쿄는 서울의 복사본이라 같은 이름표를 달고 주소(리전)로 구분한다.
- **결과:**
  - 콘솔·CLI에서 리전을 잘못 고르면 이름만으로는 알아채기 어렵다. 작업 전에 리전을 확인한다.
  - 알림에서 서울·도쿄를 구분하는 방법은 모니터링을 만들 때 정한다. 기본 알림 메시지에 리전이 들어가는지는 확인하지 못했다. 알람 이름은 리소스 이름과 따로 정할 수 있어, 필요하면 알람 이름이나 설명에 리전을 넣는다.
  - ECS 클러스터 이름이 리전마다 따로인지는 문서로 확인하지 못했다(가설: 리전마다 따로). 도쿄 첫 apply에서 확인한다.
  - DB 비밀값과 일회성 스키마 변경 태스크의 이름은 그 방식을 정할 때 추가한다.
