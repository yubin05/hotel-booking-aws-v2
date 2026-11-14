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
| [031](#adr-031) | 스키마 변경은 CD가 일회성 ECS 태스크로 먼저 적용, 앱과 DB 계정 분리 |
| [032](#adr-032) | 서비스 연결 역할은 필요한 것 전부를 bootstrap에서 관리한다 |
| [033](#adr-033) | VPC 주소 대역은 리전마다 겹치지 않게 /16으로 (서울 10.0, 도쿄 10.1) |
| [034](#adr-034) | 출구는 AZ마다 NAT Gateway(포트폴리오 평소 1개) + S3 게이트웨이 엔드포인트 |
| [035](#adr-035) | CloudFront는 유지하고 숙소 사진은 전용 도메인 CDN으로 (진입점 재검토) |
| [036](#adr-036) | 장애 종류별 복구 목표 (잠정: AZ 10분, 리전 1시간) |
| [037](#adr-037) | 예약 알림은 이메일(SES) + 카카오톡("나에게 보내기") 두 채널 |
| [038](#adr-038) | 평소 사용자 권한은 고객 관리형 정책 2개(v2 · legacy)로, bootstrap이 관리 |
| [039](#adr-039) | 태스크 정의 설정은 Terraform 모듈, 이미지는 CD (ECS의 최신 리비전을 읽어 교체) |
| [040](#adr-040) | ECR 저장소는 bootstrap(상시), 서울에 push하면 도쿄로 자동 복제 |
| [041](#adr-041) | 비밀값은 쓰기 전용으로 넣어 state에 남기지 않고(금고는 bootstrap · 도쿄 복제), DB 관리자 비밀번호는 RDS가 관리 |
| [042](#adr-042) | RDS는 apply마다 새로 만들고 시드를 다시 넣음, 백업 7일은 켜되 destroy 때 같이 삭제 |
| [043](#adr-043) | 앱 · 이전 환경은 고객사 저장소(hotel-booking-app, Public)로 분리, 이 저장소는 To-Be 인프라와 이관 전후 부하 시험 |
| [044](#adr-044) | 스키마 태스크는 RDS 관리자로 적용하고 앱 계정은 읽기 · 쓰기만, 배포마다 실행해도 같은 결과(IF NOT EXISTS), 시드 · 운영 규모 데이터는 빈 DB에만 |
| [045](#adr-045) | DB 접속은 TLS로 하고 앱이 RDS 인증서 · 주소까지 확인, RDS는 암호화하지 않은 접속을 거부 |

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
- **결과:** 상시 대기 비용이 사라진다. 벤더 리스크는 다루지 않으며 한계로 명시한다. 2번 안을 검토하며 정리한 방법(공개키로 암호화한 백업을 HTTPS로 내보내기, 장애 중 AWS API에 의존하지 않는 전환)은 요구가 생기면 참고한다. 장애 종류별 목표 수치는 [ADR-036](#adr-036).

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
- **검토한 대안 (2026-11-13 보강):**

  | | RDS for MySQL Multi-AZ (선택) | Aurora MySQL |
  |---|---|---|
  | 저장소 | DB마다 자기 디스크, 다른 AZ의 대기 DB로 동기 복제 | 클러스터가 공유 저장소 하나를 쓰고, 데이터가 AZ 3곳에 복사된다 |
  | 대기 DB | 읽기에 못 쓴다. 장애 때만 넘어간다 | 복제본이 읽기도 처리하고 장애 때 승격된다 |
  | 장애 조치 | 보통 60~120초 | 공유 저장소라 더 빠르다고 알려져 있다(확인 못 함) |
  | 비용 | 대기 DB만큼 약 2배 | 최소 비용이 더 크다 |

- **결과:**
  - 장애 조치 시간이 Aurora보다 길 수 있다. 4단계에서 실측해 AZ 장애 목표 10분([ADR-036](#adr-036)) 안인지 본다.
  - Multi-AZ는 설계상 상시다. DB가 멈추면 예약 전체가 멈추고, AZ 장애는 리전 장애보다 흔하며, 넘어가는 것이 자동이다. 포트폴리오에서는 비용(db.t4g.micro 기준 상시 월 약 $21 → $42)을 아끼려고 장애 테스트 때만 켠다([09 비용](09-cost-estimate.md)).

<details>
<summary>확인한 근거와 메모</summary>

- Multi-AZ는 다른 AZ에 동기 대기 복제본을 두고, 장애 조치는 보통 60~120초다([장애 조치](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html)). 대기 DB는 읽기 트래픽에 쓸 수 없다(*"You can't use a standby replica to serve read traffic"*, [Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)).
- Aurora 클러스터 볼륨은 한 리전의 AZ 3곳에 데이터 복사본을 둔다([Aurora 저장소](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.StorageReliability.html)).

</details>

<a name="adr-006"></a>
## ADR-006 API Gateway 대신 CloudFront VPC Origin + Internal ALB

- **상황:** 백엔드를 인터넷에 노출하지 않는다는 원칙은 유지해야 한다.
- **검토한 대안:**
  - API Gateway + VPC Link + Internal ALB(v1): 거치는 단계와 설정이 가장 많다.
  - CloudFront + Public ALB(ECS는 프라이빗): 흔한 구성이고 ECS는 노출되지 않는다. 그러나 ALB가 인터넷에 열려 있어 CloudFront(WAF · 캐시)를 거치지 않고 ALB로 바로 들어오는 길이 남는다. 막으려면 CloudFront가 비밀 헤더를 붙이고 ALB가 그 헤더가 있는 요청만 넘기도록 따로 설정해야 한다([ALB 접근 제한](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html)). CloudFront는 화면 캐시([ADR-013](#adr-013)), WAF, 리전 전환([ADR-012](#adr-012)) 때문에 어차피 앞에 둔다.
  - CloudFront VPC Origin + Internal ALB.
- **결정:** CloudFront VPC Origin.
- **근거:** 백엔드는 프라이빗으로 유지하면서 거치는 단계와 설정이 줄어든다. ALB까지 프라이빗 서브넷에 두고 CloudFront를 유일한 입구로 만들어(*"making CloudFront the single point of entry"*, [VPC Origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)) 우회 경로가 구조적으로 없다(2026-11-13 근거 보강). API Gateway의 역할은 CloudFront·ACM(TLS), WAF(요청 제한), 앱 JWT(인증)가 나눠 맡는다.
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
- **결과:** RTO가 Pilot Light보다 길다. 실측값으로 제시하고, 요구가 강해지면 도쿄 읽기 복제본(Pilot Light)으로 확장한다. 목표 수치(리전 RTO 1시간)와 확장 조건은 [ADR-036](#adr-036). 리전 간 백업은 국외 보관이므로 개인정보 국외 이전 고지가 필요하다는 가정을 둔다.

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
- **결과:** CloudFront 설정 반영 시간에 의존하므로 실측한다. 다른 리전 VPC Origin으로 전환이 가능한지는 global 루트를 만들 때 PoC로 확인한다([ADR-035](#adr-035)). 글로벌 서비스 자체의 장애는 범위 밖이다.
- **자동이 아니라 사람이 전환하는 이유 (2026-11-13 보강):**
  1. 도쿄는 평소 비어 있어(Backup & Restore) 복원이 끝나기 전에는 넘어갈 곳이 없다.
  2. 복원된 예약 데이터를 검증한 뒤에 손님을 보내야 한다.
  3. 잠깐 흔들린 것을 장애로 오인해 자동으로 넘어가면 서울과 도쿄가 동시에 예약을 받는 데이터 분기가 생겨 같은 객실이 두 번 팔릴 수 있다.
  4. 짧은 장애는 기다리는 편이 빠르다. 서울 리전의 공개된 대형 장애는 84분이었다([08 6절](08-real-cases.md)). 그래서 "몇 분 지나도 회복되지 않으면 도쿄 복원을 시작한다"는 장애 선언 기준을 5단계에서 정한다.

  사진은 읽기만 해서 2·3번 문제가 없으므로 CloudFront 원본 장애 조치로 자동 전환한다([ADR-035](#adr-035)).

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
- **결과:** Terraform은 `aws login` 자격 증명을 `credential_process` 없이 바로 읽는다(2026-11-10 1단계 plan에서 확인, Terraform 1.17.0 · AWS provider 6.72.0). 그룹 권한은 그 단계 Terraform이 쓰는 서비스부터 시작해, 권한 거부가 나면 원인을 보고 넓힌다. 1단계는 AWS 관리형 AmazonEC2FullAccess(`ec2:*`에 로드밸런서·CloudWatch·Auto Scaling까지 포함) 대신 필요한 액션만 적은 정책을 직접 써서 평소 그룹에 인라인 정책으로 붙인다. AWS는 관리형 정책으로 시작해 사용 기록(예: 90일)을 보고 줄이라고 권하지만, 이 프로젝트는 최소 권한을 직접 설계해 보는 것이 목적이고 매일 만들고 지워서 그만큼 기록이 쌓이지 않는다. 정책은 읽기 `ec2:Describe*`·`ec2:GetConsoleOutput`, 쓰기는 그 단계 리소스의 만들기·바꾸기·지우기 액션만 서울 리전 조건으로 허용한다([legacy-operator-policy.json](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/iam/legacy-operator-policy.json), 2026-11-10 평소 사용자로 apply·destroy 통과). 2단계 루트의 state 권한은 [ADR-028](#adr-028). 콘솔에서 관리자 역할로 전환한 상태로 `aws login`을 하면 CLI 세션도 관리자 역할이 된다(2026-11-10 확인, `login_session`에 역할 ARN). 평소 권한으로 작업하려면 역할에서 돌아온 상태로 로그인하고 `aws sts get-caller-identity`가 `:user/`인지 확인한다. 2단계 GitHub Actions는 사용자 대신 OIDC 역할을 쓴다.
  - 관리자 전환 설정(2026-11-13 관리자 역할로 `get-role` 확인): 평소 그룹 인라인 `AssumeAdminRolePolicy`는 `Administrator-Role` ARN 하나에만 `sts:AssumeRole`을 `aws:MultiFactorAuthPresent: true` 조건으로 허용한다. 역할의 신뢰 정책은 `Principal`이 이 계정(`:root`)이고 같은 MFA 조건이 있으며, 최대 세션은 3600초다. 신뢰 정책에 계정을 적으면 계정 안 누구나 후보가 되고, 실제 전환은 관리자가 `sts:AssumeRole`을 준 그룹·사용자만 할 수 있다([역할 전환 권한](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_permissions-to-switch.html)). 그래서 계정 ID와 역할 이름은 비밀이 아니고(*"not considered secret"*, [계정 식별자](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-identifiers.html)), 관리자를 주지 않을 사용자에게는 이 정책을 붙이지 않고 IAM 쓰기 권한도 주지 않는다. MFA가 양쪽에 있어 비밀번호만 훔쳐서는 전환할 수 없다. 남은 위험은 MFA를 이미 통과한 세션을 가져가는 경우라, 공용 PC에서는 작업 뒤 로그아웃한다.
  - 평소 사용자 권한에 있는 AWS 관리형 정책 2개:
    - `IAMUserChangePassword`: 본인 비밀번호만 바꾸기(`iam:ChangePassword`, 리소스 `user/${aws:username}`)와 비밀번호 규칙 읽기다([정책](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/IAMUserChangePassword.html)). 콘솔에서 사용자를 만들 때 "다음 로그인 때 새 비밀번호"를 고르면 필요한 권한이 생긴다고 문서에 나와 있어([사용자 만들기](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html)), 이 정책도 그때 붙은 것으로 추정한다(문서에 정책 이름은 없다).
    - `SignInLocalDevelopmentAccess`: `aws login`용(`signin:AuthorizeOAuth2Access`·`signin:CreateOAuth2Token`). CLI 문서가 이 정책을 붙이라고 안내한다(*"Attach the SignInLocalDevelopmentAccess managed policy to your IAM user, role, or group"*, [aws login](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html)).
    - 둘 다 다른 사용자나 정책을 바꿀 수 없어 권한 상승 경로가 아니다.

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
  - DB는 EC2에 Docker로 `mysql:8.4`를 띄우고, 스키마·시드는 로컬 docker-compose와 같은 initdb로 넣는다. 부하 측정용 데이터(고객사 저장소 `db/seed-volume.sql`: 숙소 1,000 · 회원 2만 · 예약 10만 · 리뷰 5만)도 initdb 세 번째 파일로 매일 넣어, 1단계 기준선과 3단계 비교·덤프 이관이 같은 데이터 양에서 이뤄지게 한다.
  - user_data에는 설치처럼 비밀값이 없는 단계만 넣는다. 비밀값은 PC의 저장소 밖 파일에 두고 SSH로 서버에 보내(권한 600) `docker run --env-file`로 넘긴다. 매일 destroy하므로 서버에서 직접 입력하지 않는다. Terraform 변수·state에도 넣지 않는다.
  - 웹은 HTTP 80으로 받아 `docker run -p 80:3000`으로 앱에 넘긴다. 프론트가 앱 컨테이너 안에 있어([ADR-013](#adr-013)) 별도 웹 서버(nginx)는 두지 않는다.
  - 앱·DB EC2는 NAT와 같은 t3.micro(2 vCPU · 1GB)로 하고, 세 대가 타입 변수 하나를 같이 쓴다. 3단계 비교 대상(RDS db.t4g.micro 1GB, Fargate 태스크 1GB 가정)과 같은 메모리 급이고, v1의 IDC 역할 DB도 t3.micro였다([ADR-008](#adr-008)). 비용도 t3.small의 절반이다.
- **근거:** 1단계에는 시간과 비용을 적게 쓴다. 로컬에서 검증한 compose 설정을 그대로 쓰면 새로 짤 것이 줄어든다. 컨테이너로 띄워도 서버에서 직접 운영하는 DB라는 점은 같아서 3단계 RDS와의 비교는 그대로 남는다. 비밀값을 서버 파일로 두는 것은 IDC에서 운영자가 설정 파일을 두던 방식과 같다.
- **결과:**
  - 실제 운영 서비스라면 IDC에서도 HTTPS를 썼겠지만 1단계에서는 범위 밖으로 둔다. 로그인 정보가 평문으로 오가므로 시드 계정만 쓴다. HTTPS는 2단계 CloudFront + ACM에서 붙고 개선 항목이 된다. 3단계와 비교할 때는 HTTP·HTTPS 차이를 실험 조건에 적는다.
  - 비밀값이 필요한 단계(앱 env 파일, DB 컨테이너 시작)는 PC에서 SSH로 하는 수동 작업이다. 비밀값은 서버에서 평문으로 남는다: env 파일(600, DB는 컨테이너를 띄운 뒤 지움)과 컨테이너 설정(`docker inspect`, root만). 2단계는 Secrets Manager가 시작할 때 주입해 서버 파일이 없고 교체(rotation)도 된다. SQL 파일은 비밀값이 아니므로 DB user_data가 공개 저장소(GitHub)에서 받는다. 내용을 user_data에 넣지 않으니 16KB 한도와 상관없다.
  - 1GB라 MySQL 컨테이너와 Docker가 함께 돌기에 빠듯하다. 설치 단계에서 뜨지 않으면 t3.small로 올리고, 부하 중 메모리 부족은 기준선 결과로 기록한다. DB만 키워야 하면 그때 DB 전용 타입 변수로 나눈다.
  - DB 이미지도 인터넷(Docker Hub)에서 받으므로 NAT는 그대로 필요하다. 2단계 비밀값은 Secrets Manager에 둔다([02 아키텍처](02-architecture.md)).

<a name="adr-022"></a>
## ADR-022 이미지 태그는 커밋 SHA

- **상황:** 1단계 수동 배포([ADR-016](#adr-016))는 PC에서 빌드한 이미지를 Docker Hub 공개 저장소에 올리고 앱 서버가 받는다. 태그 규칙이 필요하고, 2단계 CD([ADR-010](#adr-010))·ECR([ADR-020](#adr-020))도 같은 규칙을 이어 쓴다.
- **검토한 대안:** `latest`. 명령은 짧지만 태그가 올릴 때마다 다른 이미지로 옮겨 간다. 지금 서버에서 도는 코드가 어느 커밋인지 답할 수 없고, 이전 `latest`가 사라져 되돌릴 이름이 없으며, 서버에 같은 태그가 이미 있으면 `docker run`이 새 이미지를 받지 않는다.
- **결정:** 태그는 짧은 커밋 SHA(`git rev-parse --short HEAD`)로 한다. 빌드 범위인 `app` 폴더에 커밋하지 않은 변경이 없을 때만 빌드한다(`git status --short app`가 비어 있음). [start-app.sh](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/legacy/start-app.sh)는 태그를 인자로 받고 `run` 전에 `pull`한다.
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
  - 신뢰 조건은 `StringEquals`로 `aud`와 `sub`를 고정한다. `sub`는 main 브랜치 하나: `repo:yubin05@87186282/hotel-booking-aws-v2@1443891878:ref:refs/heads/main`. (2026-11-14 [ADR-043](#adr-043)에서 고객사 앱 저장소 `hotel-booking-app`의 main으로 바꿈)
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
  - 권한 없는 역할로 신뢰 조건만 먼저 확인했다. 손으로 실행하는 [oidc-check.yml](https://github.com/yubin05/hotel-booking-aws-v2/blob/d04aad9257eb038e2eb3446131102b9de7aadf5e/.github/workflows/oidc-check.yml)이 역할을 받고 `aws sts get-caller-identity`까지 성공했다(2026-11-12). 이 API는 권한이 필요 없다([GetCallerIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_GetCallerIdentity.html)). main이 아닌 브랜치에서 거부되는지는 확인하지 않았다.
  - 저장소 이름을 바꾸거나 옮기면 `sub`가 바뀌므로 신뢰 조건을 고쳐야 한다.
  - 2026-11-12 권한 정책을 추가했다([iam.tf](../infra/bootstrap/iam.tf), statement 7개). ECR 로그인(`*`)·이미지 넣기(저장소), 태스크 정의 등록(앱·스키마 패밀리 `:*`), 스키마 태스크 `RunTask`(스키마 패밀리만, `ecs:cluster` 조건 `ArnEquals`), `DescribeTasks`(`task/<클러스터>/*`), `UpdateService`·`DescribeServices`(서비스 `app`), `iam:PassRole`(실행 역할만, `iam:PassedToService` = `ecs-tasks.amazonaws.com`). 리소스 타입과 조건 키 타입은 [Service Authorization Reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference.html) 기계 판독용 JSON으로 확인했다([ADR-029](#adr-029)·[ADR-031](#adr-031)).
  - 도쿄 ARN도 지금 넣는다. 장애 중 새 배포는 드물지만, 서울에 같은 권한이 이미 있어 도쿄를 더해도 이 역할이 뚫렸을 때의 피해 범위가 거의 늘지 않고, 장애 중에 IAM을 고치는 절차(관리자 전환 → 코드 수정 → apply)를 피할 수 있다. 서울만 두고 필요할 때 여는 break-glass 안은 버렸다. 실제로 도쿄로 배포하려면 CD 워크플로가 리전을 입력으로 받아야 한다.
  - `RegisterTaskDefinition`을 패밀리로 좁힌 것(ECS 배포 액션 README 예시는 `*`)이 동작하는지는 첫 CD 실행에서 확인한다.

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

- **상황:** 2-2부터 seoul·global 루트는 평소 사용자로 apply하고, state는 bootstrap과 같은 버킷의 `<루트>/terraform.tfstate`에 둔다([ADR-025](#adr-025)). 평소 그룹 인라인 정책([legacy-operator-policy.json](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/iam/legacy-operator-policy.json))에는 S3 권한이 없었다. Terraform S3 backend는 버킷에 `s3:ListBucket`, state 파일에 `GetObject`·`PutObject`, 잠금 파일(`<key>.tflock`)에 `GetObject`·`PutObject`·`DeleteObject`가 필요하다. state 파일은 Terraform이 지우지 않으므로 `DeleteObject`가 필요 없다([S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3#s3-bucket-permissions)).
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
  - (2026-11-13 [ADR-038](#adr-038)에서 고객 관리형 2개로 바꿈) 정책은 그룹 인라인이라 관리자 역할로 `put-group-policy`로 반영하고, 덮어쓰면 이전 내용이 남지 않는다. 반영 전에 `get-group-policy`로 백업한다. 파일 이름은 `legacy-`로 시작하지만 2단계 루트도 이 정책을 쓴다.

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
  | 스키마 적용 태스크 정의 패밀리 | `hotel-booking-aws-v2-migrate` | 리전([ADR-031](#adr-031)) |
  | 실행 역할 | `hotel-booking-aws-v2-ecs-execution` | 계정 전체 1개 |
  | 로그 그룹 | `/ecs/hotel-booking-aws-v2` | 리전 |
  | ALB · 대상 그룹 | `hotel-booking-aws-v2` · `hotel-booking-aws-v2-app` | 리전 |

- **근거:** ALB와 대상 그룹 이름은 리전·계정마다 하나면 된다([ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateLoadBalancer.html), [대상 그룹](https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateTargetGroup.html)). IAM 정책과 CD 워크플로에서 이름은 고정되고 리전만 바뀐다. 도쿄는 서울의 복사본이라 같은 이름표를 달고 주소(리전)로 구분한다.
- **결과:**
  - 콘솔·CLI에서 리전을 잘못 고르면 이름만으로는 알아채기 어렵다. 작업 전에 리전을 확인한다.
  - 알림에서 서울·도쿄를 구분하는 방법은 모니터링을 만들 때 정한다. 기본 알림 메시지에 리전이 들어가는지는 확인하지 못했다. 알람 이름은 리소스 이름과 따로 정할 수 있어, 필요하면 알람 이름이나 설명에 리전을 넣는다.
  - ECS 클러스터 이름이 리전마다 따로인지는 문서로 확인하지 못했다(가설: 리전마다 따로). 도쿄 첫 apply에서 확인한다.
  - DB 비밀값의 이름은 보관 방식을 정할 때 추가한다.

<a name="adr-031"></a>
## ADR-031 스키마 변경: CD가 일회성 ECS 태스크로 먼저 적용, 앱과 DB 계정 분리

- **상황:** RDS는 프라이빗 서브넷에 있고 GitHub Actions runner는 인터넷에 있어 직접 붙지 못한다. 앱에는 마이그레이션 도구 없이 `app/db/schema.sql`·`seed.sql`만 있다. 롤링 배포라 배포 중 옛 버전과 새 버전이 함께 돌므로, 스키마는 새 앱보다 먼저 바뀌어야 하고 옛 버전과 호환돼야 한다(expand-contract).
- **검토한 대안:**
  - 앱이 시작할 때 적용: CD 단계가 하나 줄어 간단하다. 하지만 새 태스크 수만큼 동시에 실행돼 충돌을 막는 잠금이 따로 필요하고, 앱 DB 계정이 테이블 변경·삭제 권한을 늘 가져 앱이 뚫리면(SQL 인젝션 등) `DROP TABLE`까지 가능하다.
  - 사람이 수동으로: "스키마 먼저, 배포 나중" 순서를 사람이 지켜야 하고, 리전·DB를 잘못 고르는 실수가 생길 수 있으며, 접속 경로 자체가 공격 표면이 된다. 한 번뿐인 작업에만 맞다.
- **결정:**
  - CD가 이미지를 ECR에 넣은 뒤, 같은 이미지로 스키마만 적용하고 끝나는 태스크를 `RunTask`로 1번 실행한다. 종료 코드가 0인 것을 확인한 뒤에 `UpdateService`로 앱을 롤링 교체한다.
  - 스키마 태스크와 앱은 DB 계정을 나눈다. 스키마 계정만 테이블 변경 권한을 갖고, 앱 계정은 데이터 읽기·쓰기만 한다.
  - RunTask의 컨테이너 덮어쓰기로는 비밀값을 바꿀 수 없으므로(`command`·`environment` 등만 가능, [ContainerOverride](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerOverride.html)) 스키마 태스크는 태스크 정의 패밀리를 따로 둔다(`hotel-booking-aws-v2-migrate`, [ADR-030](#adr-030)).
  - RunTask에 필요한 네트워크 설정(서브넷·보안 그룹)은 `describe-services`가 돌려주는 서비스 설정에서 가져온다. CD는 Terraform state를 읽지 않는다.
- **근거:**
  - 스키마 변경이 딱 1번, 새 앱보다 먼저 실행되는 순서를 CD가 강제한다. 실패하면 앱 교체 전에 멈춘다.
  - 테이블을 뜯는 권한은 스키마 태스크만 갖는다. 비유하면 공사 기사 한 명이 공사를 끝내고 나간 뒤에 직원이 교대한다.
  - `awsvpc` 네트워크 모드 태스크는 RunTask에 `networkConfiguration`이 필요하고([RunTask](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RunTask.html)), 서비스 객체가 그 설정을 갖고 있다([Service](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Service.html)). 서브넷·보안 그룹 ID는 매일 apply·destroy로 바뀌지만 이름(ADR-030)만 알면 찾을 수 있다.
- **결과:**
  - GitHub 배포 역할에 `ecs:RunTask`(리소스 타입 task-definition, `ecs:cluster` 조건 가능)와 `ecs:DescribeTasks`(리소스 타입 task)가 추가된다.
  - 배포마다 태스크 정의 두 개(앱, 스키마)의 새 버전을 등록한다.
  - 앱에 스키마 적용 스크립트가 필요하다. DB 계정 2개와 비밀값 2개가 생기고, 실행 역할에는 두 비밀값을 읽는 권한이 필요하다.
  - v1 덤프 이관([ADR-008](#adr-008))은 한 번뿐인 작업이라 따로 정한다.
  - 2026-11-14 변경 메모: 스키마 계정은 따로 만들지 않고 RDS 관리자로 정했다. 비밀값은 RDS 관리 금고와 `db-app-password` 2개다([ADR-044](#adr-044)).

<a name="adr-032"></a>
## ADR-032 서비스 연결 역할은 필요한 것 전부를 bootstrap에서 관리한다

- **상황:** ALB·ECS·RDS·App Auto Scaling·ECR 복제·CloudFront VPC Origin은 우리 계정 안에서 일할 때(서브넷에 네트워크 카드 꽂기 등) AWS가 정해 둔 서비스 연결 역할(SLR)을 쓴다. 계정에서 처음 쓸 때 서비스가 SLR을 자동으로 만드는데, 그 순간 호출한 사람에게 `iam:CreateServiceLinkedRole`이 필요하다([ELB](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/elb-service-linked-roles.html) · [ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using-service-linked-roles-for-clusters.html) · [RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAM.ServiceLinkedRoles.html) · [App Auto Scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-service-linked-roles.html) · [ECR 복제](https://docs.aws.amazon.com/AmazonECR/latest/userguide/slr-replication.html) · [CloudFront VPC Origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-service-linked-roles.html)). 평소 사용자 정책에는 IAM 권한이 없다([ADR-025](#adr-025)). SLR도 IAM 역할이라 계정에 하나이고, 서울·도쿄가 같이 쓰며, 루트를 destroy해도 남는다. 2026-11-12 관리자 역할로 확인하니 ECS·ELB·RDS·App Auto Scaling(ECS) 4개는 이 프로젝트 전부터 있었고, ECR 복제·CloudFront VPC Origin 2개는 없었다.
- **검토한 대안:**
  - 관리자가 CLI(`aws iam create-service-linked-role`)로 직접 만들기: 가장 빠르지만 코드에 남지 않아, 다른 계정에서 재현할 때 기억에 의존한다.
  - 평소 정책에 `iam:CreateServiceLinkedRole`(`iam:AWSServiceName` 조건으로 서비스 한정): SLR은 권한을 AWS가 정하고 그 서비스만 쓸 수 있어 뚫려도 권한 상승은 없다. 하지만 "평소 정책엔 IAM 없음" 규칙에 예외가 생기고, 서비스가 늘 때마다 정책을 고쳐야 한다.
  - 해당 루트의 첫 apply만 관리자로: 관리자는 뭐든 되므로 평소 정책에 빠진 권한을 첫 apply에서 찾지 못한다.
  - 계정에 없는 2개만 코드로: 지금 계정에서는 충분하다. 하지만 다른 계정에서 재현하면 나머지 4개가 없어 평소 사용자의 apply가 중간에 막히고, 코드만 보고는 어떤 SLR이 필요한지 알 수 없다.
- **결정:**
  - 필요한 SLR 6개를 bootstrap에 `aws_iam_service_linked_role`로 두고 관리자 역할로 적용한다.
  - 이미 있는 역할은 만들지 않고 `import` 블록으로 state에 가져온다. import는 있는 것만 가져올 수 있어, 없는 역할을 넣으면 plan이 `Cannot import non-existent remote object`로 멈춘다([Terraform 소스](https://github.com/hashicorp/terraform/blob/main/internal/terraform/node_resource_plan_instance.go)). 그래서 6개 모두 import 블록을 적되, 그 계정에 있는 역할만 주석을 풀어 apply하고 가져온 뒤 다시 주석 처리한다. 이 계정은 4개를 풀고 시작한다. 이 provider의 만들기 코드에는 "이미 있으면 넘어가기" 처리가 없다([소스](https://github.com/hashicorp/terraform-provider-aws/blob/main/internal/service/iam/service_linked_role.go)). 지우지 않고 주석으로 두어 다른 계정에서 다시 쓸 수 있게 한다(HashiCorp도 import 블록을 기록으로 남기기를 권한다, [Import a single resource](https://developer.hashicorp.com/terraform/language/import/single-resource)).
  - 설명(`description`)은 코드에 적지 않고 변경을 무시한다. 이 인자는 Optional이라, 적지 않으면 가져온 역할에 AWS가 붙여 둔 설명을 다음 apply가 지우려 한다.
- **근거:** IAM은 bootstrap에서 관리자가 적용한다는 원칙([ADR-025](#adr-025) · [ADR-029](#adr-029))을 예외 없이 지키고, 평소 정책은 그대로 둔다. 필요한 SLR 목록이 코드에 남아, 어느 계정에서든 bootstrap 한 번이면 seoul·global 첫 apply가 권한 문제로 멈추지 않는다.
- **결과:**
  - 요금 없음(IAM 무료).
  - 프로젝트를 끝낼 때 bootstrap destroy가 이 프로젝트 전부터 있던 4개도 지운다. 그 서비스를 다시 쓰면 SLR이 자동으로 다시 생긴다(ELB·RDS 문서 기준). SLR은 그 서비스 리소스(로드밸런서, 복제 설정, VPC Origin 등)를 먼저 지운 뒤에야 지울 수 있다(각 문서의 삭제 절차).
  - ECR 복제를 쓰지 않기로 하면([03 구현 전 확인](03-plan.md#구현-전에-확인할-것)) 그 SLR은 쓰이지 않은 채 남는다.
  - CloudFront VPC Origin SLR 지원 표에서 도쿄는 AZ `apne1-az3`이 빠져 있다. 도쿄 서브넷을 만들 때 AZ ID로 확인한다.

<a name="adr-033"></a>
## ADR-033 VPC 주소 대역은 리전마다 겹치지 않게 /16으로 (서울 10.0, 도쿄 10.1)

- **상황:** 서울·도쿄가 같은 `modules/regional`을 쓴다. VPC CIDR을 모듈에 하나로 고정할지, 루트마다 다르게 줄지 정해야 한다(2-2, 2026-11-12).
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 서울·도쿄 같은 CIDR | 나중에 두 VPC를 이으려면 VPC를 다시 만들어야 한다 |
  | /16보다 작게 | VPC는 무료라 아낄 이유가 없고, 모자라면 넓힐 수 없다 |

- **결정:** CIDR은 모듈 입력 변수, 값은 루트에 고정. seoul `10.0.0.0/16`, tokyo `10.1.0.0/16`.
- **근거:** 비용은 변수 1개. 대역이 안 겹치면 피어링이 필요해져도 VPC를 다시 만들지 않는다.
- **결과:** 사설 대역(10.0.0.0/8)을 빨리 쓰지만 VPC 2개라 문제없다. 대역이 넓다고 더 열리지는 않는다.

<details>
<summary>확인한 근거와 메모</summary>

- 겹치는 CIDR끼리는 VPC 피어링을 만들 수 없다([피어링 기본](https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html)).
- 처음 만든 CIDR(primary)은 떼어 내거나 넓힐 수 없다([VPC CIDR 블록](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html)).
- VPC 자체는 요금이 없다([VPC 요금](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html#pricing)).
- ALB는 서브넷마다 /27 이상과 빈 IP 8개가 필요하다([ALB 서브넷](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)).
- 같은 CIDR도 지금 설계에서는 동작한다. 도쿄는 백업에서 새로 복원할 뿐 서울과 연결하지 않는다.
- 값은 옵션으로 바꾸지 않고 루트에 적는다([ADR-011](#adr-011)). 크기는 VPC 최대치인 /16.
- 10.0.0.0/8은 /16 256개. 실무에서도 리전·계정마다 겹치지 않는 대역을 미리 나눠 둔다.
- 무엇이 통하는지는 라우트 테이블과 보안 그룹이 정한다. 보안 그룹은 CIDR이 아니라 앞 단계 보안 그룹을 참조해 연다([02 네트워크](02-architecture.md)).
- 실제로 쓰는 양은 서브넷 크기가 정한다(2-2 네트워크에서 결정).

</details>

<a name="adr-034"></a>
## ADR-034 출구는 AZ마다 NAT Gateway(포트폴리오 평소 1개) + S3 게이트웨이 엔드포인트

- **상황:** 앱 서브넷의 ECS 태스크는 ECR 이미지 받기, CloudWatch 로그 전송, (RDS·비밀값 덩어리부터) Secrets Manager 조회로 밖에 나가야 한다. 02 설계는 NAT Gateway 1개였지만 비교 기록이 없어 2-2 네트워크에서 다시 검토했다(2026-11-13).
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | NAT 인스턴스 (1단계 방식) | 가장 싸지만 패치·장애 대응을 직접 한다. v1과 같은 방식이라 목표 구조를 보여 주지 못한다 |
  | VPC 엔드포인트만 (NAT 없음) | 출구를 지정한 AWS 서비스로만 제한하고 AZ 장애에도 출구가 남는다. 그러나 고객사 서비스에는 결제·알림톡·소셜 로그인 같은 외부 연동이 거의 확실히 있고, 업체가 고정 출발 IP 등록을 요구하면 대응할 수 없다 |
  | NAT 앞 Network Firewall (도메인 허용 목록) | 출구 통제가 규제 요구일 때의 방식. 요금이 크고 지금 요구가 없다 |
  | 설계도 NAT 1개 | 비용은 절반이지만 NAT의 AZ가 장애 나면 다른 AZ의 대체 태스크가 ECR 매니페스트를 못 받아 뜨지 못한다. AZ 장애 목표([ADR-036](#adr-036))를 못 지킬 수 있고, "설계는 실운영 기준"(RDS Multi-AZ 상시) 원칙과도 어긋난다(2026-11-13 재검토) |

- **결정:** 설계는 AZ마다 NAT Gateway + EIP를 두고, 앱 라우트 테이블도 AZ마다 두어 자기 AZ의 NAT로 나간다. 포트폴리오는 seoul 루트 파일의 `nat_count`로 평소 1개(두 AZ가 첫 NAT 공유), AZ 장애 테스트 때 2개로 켠다(RDS Multi-AZ와 같은 방식). S3 게이트웨이 엔드포인트를 앱 라우트 테이블들에 연결한다.
- **근거:** 외부 연동을 받아들일 수 있는 출구를 두면서, S3에 저장된 ECR 이미지 레이어는 무료 게이트웨이로 받아 NAT 처리 요금을 줄인다.
- **결과:** 상시 추정 비용에 NAT 2개가 들어가 v2가 월 약 $157에서 $204로 오른다([09 비용](09-cost-estimate.md)). 평소 1개로 돌 때는 그 NAT의 AZ가 장애 나면 다른 AZ의 출구도 끊긴다는 점을 알고 쓴다. 장악된 컨테이너가 인터넷 어디로든 나갈 수 있다는 점은 받아들이는 한계이고, 외부 연동이 없고 보안 규제가 강한 고객이면 엔드포인트만 쓰는 안을 다시 본다.

<details>
<summary>확인한 근거와 메모</summary>

- NAT의 AZ가 내려가면 다른 AZ 리소스도 인터넷을 잃는다(*"resources in the other Availability Zones lose internet access"*, [NAT gateway](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html)).
- 컨테이너는 ECR에서 매니페스트를, S3에서 레이어를 받는다([ECR 엔드포인트](https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html)). 게이트웨이 엔드포인트는 요금이 없다([게이트웨이 엔드포인트](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)).
- 엔드포인트만 쓰려면 Fargate 기준 ECR api·dkr, 로그, 비밀값 인터페이스 엔드포인트 4개가 AZ마다 필요하다([ECS 엔드포인트](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/vpc-endpoints.html)). 서울 단가 $0.013/엔드포인트·AZ·시간, $0.01/GB(Price List API, 2026-11-13) → 시간당 $0.104. NAT 1개는 $0.064, 2개는 $0.128([09 비용](09-cost-estimate.md)).
- NAT를 거쳐도 AWS 서비스로 가는 트래픽은 AWS 네트워크 안에 머문다([VPC FAQ](https://aws.amazon.com/vpc/faqs/)). 보안상 차이는 경로가 아니라 "어디로 나갈 수 있나"(출구 통제)다. 엔드포인트만 쓸 때도 S3 게이트웨이 정책을 ECR 레이어 버킷(`prod-<리전>-starport-layer-bucket`)으로 좁혀야 남의 버킷으로 빼내는 길이 막힌다.
- 2026-11-13 앱 코드의 외부 호출은 ECS 태스크 메타데이터(`served-by.ts`)뿐이다. 외부 연동은 고객사 서비스 기준의 판단이다.
- 도메인 허용 목록: [Network Firewall](https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-domain-names.html).

</details>

<a name="adr-035"></a>
## ADR-035 CloudFront는 유지하고 숙소 사진은 전용 도메인 CDN으로 (진입점 재검토)

- **상황:** 2-2 네트워크를 만들며(2026-11-13) 국내 서비스에 CloudFront가 필요한지 다시 검토했다. 리전 RTO 목표가 1시간([ADR-036](#adr-036))이면 DNS 캐시 지연은 작아서, 한때 CloudFront를 빼고 Public ALB + Route 53 전환으로 바꾸려 했다. 그 뒤 실제 숙박 서비스 구조와 숙소 사진을 근거로 되돌렸다.
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | CloudFront 제거, Public ALB + ALB의 WAF + Route 53 전환 | 단순하고 VPC Origin 불확실성이 없다. 그러나 국내 플랫폼도 해외 숙소와 외국인 손님을 받고, 숙소 사진이 전송량 대부분이다. 실제 숙박 서비스 5곳 모두 앱 앞에 CDN을 두고 사진은 전용 도메인으로 낸다([08 5절](08-real-cases.md)) |
  | 사진만 CDN, 앱은 Public ALB로 직접 | 해외 손님의 앱 요청이 엣지를 거치지 않고, 실서비스 구조와 다르다 |
  | 한 배포에 경로 규칙(`/images/*` → S3) | 가능하지만 업로드 파일을 앱과 다른 호스트로 격리하기 어렵고(OWASP), 사진 CDN만 따로 바꾸거나 장애 전환을 따로 하기 어렵다 |
  | ALB 잠금을 Public ALB + CloudFront 접두사 목록 + 비밀 헤더로 | VPC Origin 이전(2024-11)의 표준이다. 남이 만든 CloudFront로도 들어올 수 있어 비밀 헤더를 계속 관리해야 하고, AWS가 VPC Origin으로 옮기는 방법을 안내한다 |

- **결정:**
  - 앱: `hotel.vundle34.cloud` → CloudFront(+WAF) → VPC Origin → Internal ALB. [ADR-006](#adr-006)을 유지한다.
  - 사진: `img.hotel.vundle34.cloud` → 별도 CloudFront → S3(미리 여러 크기로 줄인 사진, OAC). 서울 S3를 도쿄 S3로 복제하고 원본 그룹 장애 조치를 건다.
  - 리전 전환은 CloudFront 앱 원본을 도쿄 VPC Origin으로 바꾼다([ADR-012](#adr-012) 유지). global 루트를 만들 때 다른 리전 VPC Origin 전환을 작은 PoC로 먼저 확인하고, 안 되면 Public ALB + 비밀 헤더로 바꾼다.
- **근거:** 실제 서비스 구조와 같고 ALB가 인터넷에 없다. 사진은 GET만 쓰므로 CloudFront가 도쿄 S3로 자동 전환하고, 쓰기가 있는 앱은 검증 뒤 사람이 전환한다(데이터 성격에 따라 전환 방식을 나눔). 사진 주소가 우리 도메인이라 CDN 업체를 DNS 레코드 하나로 바꿀 수 있다.
- **결과:**
  - CloudFront 인증서는 us-east-1에서 받는다(global 루트). Route 53은 늘 CloudFront를 가리켜 리전 전환 때 DNS를 바꾸지 않는다.
  - 사진 준비(리사이징) 스크립트와 앱의 사진 주소 설정이 필요하다. 사진 업로드와 자동 리사이징은 범위 밖이다([01 범위](01-scenario.md)). 지금 시드의 Unsplash 사진을 복사해 쓸 수 있는지는 구현할 때 원문으로 확인한다.
  - VPC Origin 자체는 추가 요금이 없다. 도쿄 리소스는 켜 둔 시간만큼 요금이 나간다.
  - 사진 CloudFront에도 WAF를 붙인다. 사진 요청 폭주는 요청·전송량 요금으로 이어진다. 웹 ACL 하나를 두 배포에 함께 붙일 수 있어 월 요금은 한 번이고([WAF 연결](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-associating-aws-resource.html)), 한 페이지에 사진이 수십 장이라 요청 수 한도는 앱과 따로 둔다. 쿼리 문자열은 캐시 키에서 빼 캐시를 우회해 S3로 몰리는 요청을 막는다. 네트워크 계층 DDoS는 Shield Standard가 추가 요금 없이 막는다.
  - 해외 손님 체감: 사진은 CloudFront가 손님 가까운 엣지에 복사본을 두어 그 엣지의 첫 요청만 서울 S3까지 간다. 예약(쓰기)은 서울 DB까지 가야 해서 CDN은 엣지의 HTTPS 처리와 AWS 백본 전송까지만 돕고 거리는 못 줄인다. 숙소가 한국에 있고 예약은 몇백 ms 늦어도 체감이 작아 받아들인다. 해외 비중이 커지면 쓰기를 여러 리전에서 받는 리전 확장이 필요하지만, 같은 객실 중복 예약을 막기가 매우 어려워지는 별도의 큰 결정이다.

<details>
<summary>확인한 근거와 메모</summary>

- 실제 서비스 관찰(응답 헤더): NOL · 여기어때는 앱 앞 Cloudflare, 사진 CloudFront + S3. Booking.com은 둘 다 CloudFront. Airbnb · Agoda는 Akamai([08 5절](08-real-cases.md)).
- 국내 플랫폼의 해외 손님: 놀유니버스 외국인 전용 '놀 월드' 국내 숙소 약 1만5천 곳([머니투데이](https://www.mt.co.kr/culture/2026/08/04/2026080409140062519)), 여기어때 해외 숙소 거래액 증가([바이라인네트워크](https://byline.network/2025/04/15-438/)). 회사 발표 수치다.
- 이미지 CDN: [web.dev](https://web.dev/learn/images/cdn). 업로드 파일은 다른 호스트에: [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
- 원본 장애 조치는 GET · HEAD · OPTIONS에서만 동작한다([origin failover](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/high_availability_origin_failover.html)). CloudFront용 ACM 인증서는 us-east-1([요구 사항](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)).
- VPC Origin: 2024-11 출시, 추가 요금 없음([발표](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-cloudfront-vpc-origins/)). CloudFront가 서브넷에 서비스 관리형 ENI를 만들어 들어온다([VPC Origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)). 공개 원본에서 옮기는 방법: [AWS 블로그](https://aws.amazon.com/blogs/networking-and-content-delivery/migrate-amazon-cloudfront-public-origins-to-private-vpc-origins/).
- 비밀 헤더 방식: [ALB 접근 제한](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html). 접두사 목록은 CloudFront 전체의 원본 접속 IP다([접두사 목록](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html)).

</details>

<a name="adr-036"></a>
## ADR-036 장애 종류별 복구 목표 (잠정: AZ 10분, 리전 1시간)

- **상황:** 02 9절은 목표 없이 드릴 3회 뒤 확정하기로 했다. 리전 RTO를 10분으로 하자는 의견이 나와 장애 종류별로 나눠 검토했다(2026-11-13).
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 리전 RTO 10분 (Warm Standby) | 도쿄에 ALB·ECS·RDS 복제본·출구를 상시로 켜야 한다. v1의 Azure 상시 대기와 비용 구조가 같고, [ADR-001](#adr-001) · [ADR-009](#adr-009)가 같은 이유로 Pilot Light 이상을 버렸다 |
  | 목표 없이 드릴 뒤 확정 | 드릴 결과가 충분한지 판단할 기준이 없다 |

- **결정:**

  | 장애 | 잠정 RTO | 방식 |
  |---|---|---|
  | 태스크·서버 | 1분 안팎 | ECS 자동 교체 |
  | AZ 하나 | 10분 이내 | AZ 2개 분산, RDS Multi-AZ |
  | 리전 전체 | 1시간 | Backup & Restore ([ADR-009](#adr-009) 유지) |

  RPO는 드릴로 잰 뒤 정한다. 리전 RTO가 1시간을 넘으면 가장 느린 단계를 Pilot Light(도쿄 DB 복제본)로 바꾼다.
- **근거:** 실제 사고(4시간 중단)의 원인은 과부하라 R1(오토스케일링)이 막는다. 사용자가 자주 겪을 장애는 서버·AZ 쪽이고 추가 비용 없이 분 단위로 복구된다. 리전 장애는 드물어 상시 대기 비용이 맞지 않는다. 재 보고 필요한 단계만 올리는 것이 실무 방식이다.
- **결과:** 4·5단계 실측을 이 표와 비교해 확정하고 "목표 → 실측 → 판단"으로 보여 준다. 복제본은 실수도 복제하므로 Pilot Light로 올려도 R3용 백업은 유지한다. 리전 장애는 짧게 끝날 수도 있어(서울 84분, [08 6절](08-real-cases.md)) 도쿄 복원을 시작하는 장애 선언 기준을 5단계에서 정하고, RTO의 "판단" 구간에 넣는다.

<details>
<summary>확인한 근거와 메모</summary>

- RTO는 서비스 중단부터 복구까지 허용하는 최대 지연, RPO는 마지막 복구 지점부터 허용하는 최대 시간([AWS DR 백서](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/business-continuity-plan-bcp.html)).
- 백서 그림의 방식별 RPO/RTO: Backup & Restore = Hours, Pilot Light = 10s of minutes, Warm Standby = Minutes, Multi-site active/active = Real-time([DR 방식](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html)). Pilot Light는 요청을 받기 전에 추가 조치가 필요하고, Warm Standby는 줄인 용량으로 바로 받는다.
- RDS MySQL은 다른 리전 읽기 복제본을 지원하고([문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.XRgn.html)), 리전 전환 때 승격한다(같은 백서).
- 1단계 측정: 같은 단일 서버 구조가 1,000명에서 실패율 59~69%([03 결과](03-plan.md#결과-기록)). 사건은 가정이지만 과부하로 장시간 중단될 수 있음을 측정으로 뒷받침한다.

</details>

<a name="adr-037"></a>
## ADR-037 예약 알림은 이메일(SES) + 카카오톡("나에게 보내기") 두 채널

- **상황:** 실제 서비스는 예약 확정을 여러 채널로 알린다(대한항공은 앱 푸시·알림톡·문자·이메일). v1은 알림을 SQS로 만들었고 v2는 범위에서 뺐다. 2026-11-13 해외 손님까지 고려해 예약 알림과 외부 로그인(SSO)을 v2에 넣기로 했다.
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 알림톡 (국내 실서비스 방식) | 카카오 비즈니스 채널과 사업자 서류, 공식 딜러사 계약, 템플릿 검수가 필요하다고 안내된다(딜러사 자료, 카카오 공식 문서는 못 찾음). 개인 포트폴리오로는 준비가 어렵다 |
  | 카카오 친구에게 보내기 | 별도 권한 심사가 있고 자동 발송은 반려될 수 있다 |
  | 한 채널만 | 이메일만이면 국내 손님의 즉시성이 떨어지고, 카톡만이면 카카오가 없는 해외 손님이 못 받는다 |
  | 문자·앱 푸시 추가 | 채널이 늘 뿐 검증할 인프라가 새로 생기지 않는다 |

- **결정:**
  - **이메일(Amazon SES):** 모든 손님에게 보낸다. 전 세계 공통이고 예약 증빙으로 남는다. 보내는 도메인은 `hotel.vundle34.cloud`로 인증한다.
  - **카카오톡 "나에게 보내기":** 카카오 로그인하고 메시지에 동의한 손님에게 추가로 보낸다. 손님 본인의 "나와의 채팅방"에 온다.
  - 발송은 알림 모듈 한 곳에 모으고 채널을 갈아 끼우는 구조로 만든다.
- **근거:** 이메일은 해외 손님까지 받는 기본 채널이고 AWS 서비스(SES · Route 53 도메인 인증)로 이어진다. 카톡은 국내 즉시성과 SSO(카카오 로그인)를 함께 보여 주고, 외부 연동이라 NAT([ADR-034](#adr-034))를 실제로 쓴다.
- **결과:**
  - 발송이 실패하거나 느려도 예약은 성공해야 한다. 예약을 저장할 때 보낼 알림을 같은 트랜잭션에 기록하고 따로 보내며, 실패하면 다시 시도한다(아웃박스).
  - SES는 처음에 샌드박스라 인증한 주소로만, 하루 200통, 초당 1통 보낸다. 데모는 내 주소를 인증해 쓰고, 실서비스면 해제를 신청한다.
  - 실서비스라면 카톡은 알림톡으로 바꾼다. 카카오 로그인 뒤에도 앱은 자체 JWT를 발급하고([ADR-007](#adr-007)), 카카오 키와 손님의 카카오 토큰은 안전하게 보관한다(키는 Secrets Manager).
  - 앱 기능이라 2단계 인프라 뒤에 구현한다. 구현과 확인이 끝나면 README · 포트폴리오 대문에 "v2에서 추가한 기능"으로 올린다.

<details>
<summary>확인한 근거와 메모</summary>

- 대한항공 안내 채널: [notification services](https://www.koreanair.com/contents/footer/others/notification-services). Airbnb · Booking.com은 업체 자료만 찾음(문자·앱 알림·이메일, 확인 이메일). 야놀자 · 여기어때 채널은 확인 못 함.
- SES 샌드박스: [production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html). 요금은 Essentials 기준 1,000통에 $0.16([SES 요금](https://aws.amazon.com/ses/pricing/), 2026-11-13). 앱 라이브러리로 손님 메일 서버에 직접 보내는 방식은 EC2 기반에서 25번 포트가 공인 주소로 막히고([EC2 제한](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-resource-limits.html)) 스팸으로 분류되기 쉬워 발송 서비스에 넘긴다. SES SMTP 자격 증명은 IAM 사용자로 만들어지는 장기 자격 증명이라, 구현할 때 API + 태스크 역할을 우선 검토한다.
- "나에게 보내기"와 나와의 채팅방: [메시지 튜토리얼](https://developers.kakao.com/docs/ko/tutorial/message), [메시지 공통](https://developers.kakao.com/docs/latest/ko/kakaotalk-message/common). 친구에게 보내기 심사: [devtalk](https://devtalk.kakao.com/t/api-api/116052).
- 알림톡 조건(비즈니스 채널, 사업자 서류, 딜러사, 템플릿 검수 1~3 영업일): [비즈고 가이드](https://blog.bizgo.io/howto/alim-talk-basic). 딜러사 자료다.

</details>

<a name="adr-038"></a>
## ADR-038 평소 사용자 권한은 고객 관리형 정책 2개(v2 · legacy)로, bootstrap이 관리

- **상황:** 평소 그룹(`normal-user-group`)의 권한은 인라인 정책 `legacy-operator-policy` 하나였는데 2단계 루트도 같이 써서 이름과 실제가 맞지 않았다. 그룹 인라인 정책은 합계 5,120자까지인데 이미 2,113자였고, 2-2에서 ALB · ECS · RDS · CloudFront 등의 액션이 더 붙는다. 반영은 CLI `put-group-policy`(덮어쓰기)라 매번 손으로 백업을 떴다(2026-11-13).
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 파일 이름만 바꾸기 | 5,120자 한도가 그대로이고, 1단계가 끝나도 EC2 생성 같은 legacy 권한이 남는다 |
  | 인라인 정책 2개로 나누기 | 한도가 그룹 인라인 합계라 여유가 늘지 않는다 |
  | AWS 관리형 정책(예: AmazonEC2FullAccess) | 리소스가 `*`인 범용 정책이라 최소 권한에 맞지 않는다([ADR-018](#adr-018), [ADR-029](#adr-029)에서 같은 이유로 버림) |
  | 두 정책을 늘 함께 붙이기 | 지금 하지 않는 단계의 권한(1단계의 EC2 생성 등)이 계속 살아 있다 |

- **결정:**
  - 우리가 쓴 **고객 관리형** 정책 2개를 bootstrap Terraform(관리자 역할)이 만들어 평소 그룹에 연결한다([iam.tf](../infra/bootstrap/iam.tf)).
    - `hotel-booking-aws-v2-operator-v2`: 2단계 루트용. `ec2:Describe*`, 서울 조건의 네트워크 액션, seoul · global · tokyo state([v2-operator-policy.json](../infra/iam/v2-operator-policy.json))
    - `hotel-booking-aws-v2-operator-legacy`: 1단계 legacy 루트용. 1단계 때 쓰던 권한 그대로(읽기, 네트워크, EC2 · 키 페어, state는 로컬이라 없음, [legacy-operator-policy.json](https://github.com/yubin05/hotel-booking-aws-v2/blob/39d08196c7ef0c4bc7ff2370bba035cc3c5e7acd/infra/iam/legacy-operator-policy.json)). (2026-11-14 [ADR-043](#adr-043)에서 고객사 저장소의 `legacy/iam`으로 옮김)
    - 두 정책은 각자 완결이고, **작업하는 단계의 정책만 붙인다.** bootstrap의 `attach_operator_v2` · `attach_operator_legacy` 값을 바꿔 관리자 역할로 apply한다. 3단계 덤프 이관처럼 둘 다 쓸 때는 둘 다 붙인다
  - 기존 인라인은 백업한 뒤 지웠다. 관리자 전환 권한(인라인 `AssumeAdminRolePolicy`)은 그대로 둔다.
- **근거:** AWS는 대부분 관리형을 권하고, 최소 권한을 주는 가장 안전한 방법으로 팀에 필요한 권한만 담은 고객 관리형을 든다. 정책마다 6,144자, 그룹에 10개까지라 여유가 크고, 버전(최대 5개)으로 되돌릴 수 있으며, 바꾸기 전에 plan으로 차이를 본다. 인라인의 장점은 1:1 관계(다른 사람에게 실수로 붙지 않음)인데, 평소 사용자는 IAM 권한이 없어 정책을 남에게 붙일 수 없으므로 이 장점이 작다. IAM은 bootstrap에서 관리자가 다룬다는 원칙([ADR-025](#adr-025) · [ADR-029](#adr-029) · [ADR-032](#adr-032))과 같다.
- **결과:**
  - 2026-11-13 관리자 역할로 apply: 4개 추가(정책 2 + 연결 2, 예측과 같음). 정책 생성 13:10:19 KST, state 저장 13:10:21. 기존 인라인 백업은 13:05 · 13:11, 그 뒤 삭제했다.
  - 처음에는 공통 네트워크 액션을 v2에만 두고 둘을 늘 함께 붙였다가(합은 기존 인라인과 같음, 스크립트로 비교), 같은 날 "단계별로 붙였다 떼기"로 바꿨다. legacy 정책을 1단계 때 그대로 완결되게 되돌리고, 평소에는 v2만 붙인다. 두 번째 apply: legacy 정책 교체 + legacy 연결 떼기(1 추가 · 2 삭제, 예측과 같음), legacy 정책 재생성 13:20:31 KST, state 저장 13:20:32. 그 뒤 그룹에는 v2만 붙어 있음을 확인했다.
  - 앞으로 평소 권한은 JSON을 고친 뒤 bootstrap plan · apply(관리자)로 반영한다. 단계를 바꿀 때마다 관리자 apply가 한 번 필요한 것은 받아들인다(떼는 걸 잊지 않게 기본값을 코드에 둠). v2 정책이 커지면 `-edge`(CloudFront · WAF · Route 53)처럼 더 나눈다.
  - 정책 설명(description)은 만든 뒤 바꿀 수 없어(바꾸면 정책 교체) 짧은 영어로 썼다.

<details>
<summary>확인한 근거와 메모</summary>

- 관리형과 인라인 고르기: *"In most cases, we recommend that you use managed policies instead of inline policies"*, 인라인은 *"strict one-to-one relationship"*이 필요할 때([AWS 문서](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies-choosing-managed-or-inline.html)).
- 크기 한도: 그룹 인라인 합계 5,120자, 관리형 정책 하나 6,144자, 그룹당 관리형 10개(공백 제외, [IAM 한도](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html)).
- 정책 설명은 바꿀 수 없다(*"The policy description is immutable"*, [CreatePolicy](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreatePolicy.html)).
- 처음에 그룹 인라인 목록에 `AssumeAdminRolePolicy`만 보여 평소 권한의 위치를 확인했다. 그것은 관리자 전환 권한이었고, 평소 권한 인라인은 이미 지운 뒤였다.

</details>

<a name="adr-039"></a>
## ADR-039 태스크 정의 설정은 Terraform 모듈, 이미지는 CD (ECS의 최신 리비전을 읽어 교체)

- **상황:** 2-2 ALB · ECS 덩어리 전(2026-11-13). CD는 새 이미지로 태스크 정의 리비전을 등록하고 서비스를 교체한다([ADR-026](#adr-026), [ADR-031](#adr-031)). Terraform도 서비스와 태스크 정의를 갖고 있으면, 다음 apply가 서비스를 Terraform의 리비전으로 되돌려 배포가 조용히 롤백된다.
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | Terraform이 전부 (CD가 `terraform apply`로 이미지 값만 바꿈) | 배포 역할에 인프라 전체 권한과 state 접근이 필요해 뚫리면 피해 범위가 인프라 전체다. 배포마다 인프라 apply라 느리고 위험하다 |
  | CD가 저장소의 태스크 정의 JSON 파일을 원본으로 씀 | 설정이 Terraform 코드와 JSON 파일 두 곳에 생겨, 한쪽만 고치면 다음 배포가 설정을 되돌린다. v1이 이 방식이라 배포 때마다 JSON을 손봐야 했다 |

- **결정:** `modules/regional`(서울 · 도쿄 공용)이 태스크 정의(CPU · 메모리 · 비밀값 · 로그 설정)와 서비스를 만들고, 서비스의 `task_definition`은 `lifecycle { ignore_changes }`로 CD 몫이라고 선언한다. 이후 리비전 등록과 서비스 교체는 CD가 AWS 공식 액션(render → deploy)으로 한다. CD는 원본을 저장소 파일이 아니라 **ECS에 등록된 최신 리비전**에서 패밀리 이름으로 읽어(`task-definition-family`) 이미지만 바꾼다. 스키마 태스크(`-migrate` 패밀리)도 같다.
- **근거:** 배포 역할은 "새 리비전 등록 + 서비스 교체"만 할 수 있고 인프라를 못 건드린다(ADR-026에서 이미 그렇게 좁힘). 설정은 Terraform 한 곳, 이미지는 CD만 바꿔서 원본이 한 벌이다. Terraform에서 설정을 바꾸면 새 리비전이 생기고, 다음 배포가 그 최신 리비전을 읽어 이미지만 바꾸므로 설정이 이어진다. `ignore_changes`는 밖에서 바뀌는 값을 Terraform이 되돌리지 않게 하는 공식 방법이다.
- **결과:**
  - destroy 뒤 다시 apply하면 서비스는 Terraform의 첫 리비전으로 뜬다. 최신 이미지는 CD를 한 번 돌려 맞춘다(재현성 확인 때 절차로 정리).
  - 배포 역할에 읽기 권한 `ecs:DescribeTaskDefinition`을 더해야 한다(CD 덩어리 때 bootstrap에 반영).
  - 리전마다 다른 값(이미지 주소의 ECR, 로그 리전, 비밀값 ARN)은 모듈이 리전을 읽어 채운다. 도쿄 복원 때 tokyo 루트가 같은 모듈로 도쿄에 태스크 정의를 등록하고, CD는 그것을 읽는다.
  - 2026-11-14 변경 메모: 처음 apply할 이미지를 루트 변수(`image_tag`)로 적지 않고, 모듈이 그 리전 ECR에서 가장 최근에 push된 이미지(`aws_ecr_image`, `most_recent = true`)의 태그를 읽는다. 매일 destroy · apply하는 동안 번호를 손으로 바꾸지 않아도 되고, 옛 번호가 ECR 보관 한도(최근 10개)에서 밀려나 apply가 실패할 일도 없다. 버린 대안: 번호를 손으로 교체(이번 ③-b에서 스키마 태스크 때문에 바로 필요해졌고, 잊으면 옛 이미지로 뜬다). 데이터 소스는 `DescribeImages` · `DescribeRepositories`를 불러 평소 정책에 이 저장소 조회 권한을 더했다. `image_uri`는 지문(digest) 형식이라 쓰지 않고 태그로 주소를 만든다. 태그 없는 이미지가 가장 최근이면 plan이 멈춘다([provider 소스 v6.73.0](https://github.com/hashicorp/terraform-provider-aws/blob/v6.73.0/internal/service/ecr/image_data_source.go)).

<details>
<summary>확인한 근거와 메모</summary>

- `ignore_changes`로 밖에서 바뀌는 값을 무시하는 예: [aws_ecs_service](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service)(서비스 개수 예시).
- AWS 공식 액션: [render-task-definition](https://github.com/aws-actions/amazon-ecs-render-task-definition)(*"Inserts a container image URI into an Amazon ECS task definition JSON file"*, 파일 대신 `task-definition-family` 등으로 등록된 정의를 읽어 올 수도 있음), [deploy-task-definition](https://github.com/aws-actions/amazon-ecs-deploy-task-definition).

</details>

<a name="adr-040"></a>
## ADR-040 ECR 저장소는 bootstrap(상시), 서울에 push하면 도쿄로 자동 복제

- **상황:** 2-2 ALB · ECS 전(2026-11-13). ECS 서비스는 만들어지자마자 태스크를 띄우며 이미지를 받으려 하고, 리전 장애 때 도쿄에도 이미지가 있어야 복원할 수 있다(02 5절). 저장소를 어느 루트에 둘지 정해야 한다.
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | seoul 모듈 (매일 destroy) | destroy 때 이미지도 지워지거나(이미지가 있으면 destroy가 막혀 강제 삭제 설정이 필요) apply할 때마다 이미지를 다시 빌드 · push해야 ECS가 뜬다. 도쿄 복제본이 늘 있다는 DR 전제가 흔들린다 |

- **결정:** bootstrap에 서울 · 도쿄 저장소(`hotel-booking-aws-v2`, [ADR-030](#adr-030))와 서울 레지스트리의 도쿄 복제 설정을 둔다([ecr.tf](../infra/bootstrap/ecr.tf)). CD는 서울에만 push하고 복제가 도쿄로 복사한다. 태그는 불변(커밋 SHA, [ADR-022](#adr-022)), 올릴 때 기본 스캔, 최근 N개만 남긴다.
- **근거:** state 버킷처럼 매일 지우면 안 되는 것이라 bootstrap 원칙과 같다. apply 직후 남아 있는 이미지로 바로 뜬다. ECS 실행 역할 · 배포 역할의 ECR 권한이 이미 이 이름으로 서울 · 도쿄에 걸려 있고([ADR-029](#adr-029), [ADR-026](#adr-026)), 복제용 서비스 연결 역할도 있다([ADR-032](#adr-032)).
- **결과:**
  - 복제는 도쿄 저장소를 자동으로 만들지만 저장소 설정은 기본으로 복사하지 않아, 도쿄 저장소도 같은 설정으로 직접 만든다.
  - 저장 요금은 서울 GB당 월 $0.10(Price List API, 2026-11-13)이고 도쿄 복제본도 따로 든다. 최근 N개만 남겨 작게 유지한다.
  - ECS를 처음 띄우기 전에 이미지가 하나 있어야 해서, CD의 빌드 · push 부분을 ECS보다 먼저 만든다.
  - 서울 장애 중 새로 배포할 때는 CD가 도쿄 저장소에 바로 push한다(CD 덩어리에서 배포 리전 선택).

<details>
<summary>확인한 근거와 메모</summary>

- 복제는 대상 레지스트리에 저장소가 없으면 만들고, 저장소 설정(태그 불변 · 암호화 · 권한 · 수명 주기)은 생성 템플릿 없이는 복제되지 않는다([ECR 복제](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html)).
- 수명 주기 규칙 형식(`imageCountMoreThan`): [예시](https://docs.aws.amazon.com/AmazonECR/latest/userguide/lifecycle_policy_examples.html).

</details>

<a name="adr-041"></a>
## ADR-041 비밀값은 쓰기 전용으로 넣어 state에 남기지 않고(금고는 bootstrap · 도쿄 복제), DB 관리자 비밀번호는 RDS가 관리

- **상황:** 앱은 시작할 때 `DB_PASSWORD`와 `JWT_SECRET` 환경 변수가 없으면 종료한다(`app/src/config.ts`). ECS는 태스크를 띄울 때 Secrets Manager에서 값을 꺼내 환경 변수로 넣고, 태스크 정의에는 값이 아니라 비밀의 주소(ARN)만 적는다. 값을 누가 만들고 Terraform state에 남는지를 정해야 한다(2026-11-13).
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | Terraform `random_password` 리소스 + `secret_string` | state와 plan 파일에 비밀값이 평문으로 남는다. 평소 사용자는 seoul state를 읽을 수 있어([ADR-028](#adr-028)) 그 세션만 털려도 DB 비밀번호가 나간다 |
  | 금고(비밀)만 Terraform, 값은 사람이 CLI로 넣기 | state에는 안 남지만 destroy 뒤 다시 만들 때와 리전 드릴 때 사람 손이 필요해 재현성과 RTO가 나빠진다 |

- **결정:**
  - 앱 DB 계정 비밀번호와 JWT 서명 키는 임시(ephemeral) `random_password`로 만들어 쓰기 전용 인자 `secret_string_wo`로 금고에 넣는다. 값을 바꿀 때는 `secret_string_wo_version`을 올린다.
  - DB 관리자 비밀번호는 `manage_master_user_password = true`로 RDS가 직접 만들어 Secrets Manager에 넣고 관리한다. 앱은 관리자가 아니라 앱 전용 계정으로 접속한다([ADR-031](#adr-031)).
- **근거:** 쓰기 전용 인자는 값을 plan과 state에 남기지 않는다(Terraform 1.11+, 이 프로젝트는 `>= 1.11.0`). 전부 자동이라 destroy 뒤 다시 만들어도 손이 들지 않는다. state를 보는 사람이 비밀값을 볼 수 없다.
- **결과:**
  - Terraform은 값을 비교하지 않으므로 금고의 값이 바깥에서 바뀌어도 모른다. 바꿀 때는 버전 숫자로만 알린다.
  - ECS 실행 역할에 해당 비밀들의 `secretsmanager:GetSecretValue`를 더해야 한다([ADR-029](#adr-029)에서 미뤄 둔 것).
  - 금고(비밀)는 **bootstrap(상시)**에 두고 도쿄로 복제한다. 비밀값은 데이터와 짝이라(DB를 복원해도 앱 계정 비밀번호는 그대로여야 함) 매일 지우면 안 되고, seoul에 두면 지울 때마다 복구 대기 기간(기본 30일) 때문에 같은 이름으로 바로 다시 만들 수도 없다. 서울 리전 장애 때 도쿄 ECS가 열 금고가 도쿄에 있어야 해서 복제본을 둔다. 복제본 주소는 리전만 달라 모듈이 리전을 바꿔 만든다.
  - 복제본도 별도 비밀로 과금된다(개당 월 $0.40). 비밀 3개(JWT, 앱 DB 계정, 카카오 키) + 복제본 3개.
  - 앱 DB 계정 비밀번호를 교체할 때는 금고와 DB 안의 계정 비밀번호를 함께 바꾸는 절차가 필요하다(RDS 덩어리에서 정함). JWT 서명 키를 교체하면 그 순간 로그인 세션이 모두 풀린다.

<details>
<summary>확인한 근거와 메모</summary>

- 쓰기 전용 인자: *"discards that value without storing it in the plan or state file"*([write-only](https://developer.hashicorp.com/terraform/language/manage-sensitive-data/write-only)). `sensitive`는 화면에서만 가리고 state와 plan에는 평문으로 남는다([민감 데이터](https://developer.hashicorp.com/terraform/language/manage-sensitive-data)).
- `secret_string_wo` · `secret_string_wo_version`: [aws_secretsmanager_secret_version](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret_version). 임시 `random_password`: [random provider](https://registry.terraform.io/providers/hashicorp/random/latest/docs/ephemeral-resources/password).
- `manage_master_user_password`: [aws_db_instance](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance).
- 복제본 ARN은 리전만 다르고, 기본 비밀의 값 변경이 복제본으로 퍼진다([복제](https://docs.aws.amazon.com/secretsmanager/latest/userguide/replicate-secrets.html)). 복제본은 별도 비밀로 과금([요금](https://aws.amazon.com/secrets-manager/pricing/)). 삭제 복구 대기는 0(즉시) 또는 7~30일, 기본 30일([aws_secretsmanager_secret](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret)).

</details>

<a name="adr-042"></a>
## ADR-042 RDS는 apply마다 새로 만들고 시드를 다시 넣음, 백업 7일은 켜되 destroy 때 같이 삭제

- **상황:** 2-2 RDS 덩어리(2026-11-13). 서울을 매일 destroy하면 RDS도 지워진다. 데이터는 시드(합성)이고, 실험은 그날 안에 처음부터 끝까지 하도록 설계돼 있다.
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | destroy 때 최종 스냅샷 → 다음 apply에서 복원 | 스냅샷 보관 요금, 복원 시간, 스냅샷 이름 관리로 코드가 복잡해진다. 시드 데이터라 이어 갈 가치가 없다 |
  | 데이터를 버리니 자동 백업도 끔(보존 0일) | 시점 복구(R3), 도쿄로 백업 복제(5단계 드릴의 전제), 읽기 복제본(Pilot Light로 올릴 때)이 같이 꺼진다. 백업은 DB 용량만큼 무료이고 destroy 때 같이 지워져 아낄 비용이 없다 |

- **결정:**
  - 매 apply마다 새 DB를 만들고 스키마 · 시드는 스키마 태스크([ADR-031](#adr-031))가 다시 넣는다. `skip_final_snapshot = true`, `deletion_protection = false`.
  - 자동 백업은 7일 보존, `delete_automated_backups = true`로 destroy 때 같이 지운다.
  - MySQL 8.4(0단계 로컬과 같음), db.t4g.micro · gp3 20GB. 1단계 DB 서버(t3.micro, [ADR-021](#adr-021))와 같은 급이라 3단계에서 크기가 아니라 구조 효과를 비교하고, 크기는 3단계 뒤 확정한다.
  - Multi-AZ는 설계상 켜고 포트폴리오는 `db_multi_az = false`로 평소 끄며 AZ 장애 테스트 때 켠다(NAT와 같은 방식, [ADR-034](#adr-034)).
  - 도쿄로 백업 복제는 5단계 드릴 때만 켠다(복사 전송 · 도쿄 저장 요금).
- **근거:** 매번 깨끗한 상태에서 시작해 재현성(2단계 완료 기준)도 함께 확인된다. 백업 기능은 켜 두되 남는 것이 없어 비용이 생기지 않는다.
- **결과:**
  - 실운영이라면 최종 스냅샷과 삭제 방지를 켠다(콘솔로 만들면 삭제 방지가 기본으로 켜짐).
  - t 계열은 CPU 크레딧 방식이라 3단계 긴 부하에서 크레딧 소진이나 추가 요금을 함께 본다.
  - 관리자 비밀번호를 RDS가 만들 때 호출자에게 `secretsmanager:CreateSecret` · `TagResource` · `kms:DescribeKey`가 필요해 평소 권한에 넣었다(RDS가 만드는 비밀 이름 `rds!*`으로 좁힘).

<details>
<summary>확인한 근거와 메모</summary>

- 백업 저장은 리전의 DB 저장 용량만큼 무료([RDS 요금](https://aws.amazon.com/rds/mysql/pricing/)). `delete_automated_backups` 기본값 true, `backup_retention_period`는 읽기 복제본의 원본이면 0보다 커야 함([aws_db_instance](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance)).
- 트랜잭션 로그는 5분마다 S3에 올라가 시점 복구에 쓰인다([시점 복구](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html)). MySQL 자동 백업은 서울 → 도쿄로 복제할 수 있다([백업 복제](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReplicateBackups.html)).
- 관리 비밀번호에 필요한 호출자 권한: [RDS + Secrets Manager](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html). 삭제 방지 기본값: [DB 삭제](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_DeleteInstance.html).

</details>

<a name="adr-043"></a>
## ADR-043 앱 · 이전 환경은 고객사 저장소(hotel-booking-app, Public)로 분리, 이 저장소는 To-Be 인프라와 이관 전후 부하 시험

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
- **근거:** 실제 이관 프로젝트에서 앱 저장소는 고객사에 이미 있고, 인프라팀은 인프라 저장소를 새로 만든다. [ADR-039](#adr-039)에서 "태스크 정의 설정은 Terraform, 이미지는 CD"로 나눠 두어 경계가 이미 있었다. 코드를 공개해도 RDS는 `publicly_accessible = false`이고 프라이빗 서브넷에 있으며 비밀번호는 Secrets Manager가 관리해 보안이 약해지지 않는다. 공개 저장소는 Actions 표준 러너가 무료이고 비밀 스캔이 자동으로 돈다([Actions 요금](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [비밀 스캔](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning)).
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

<a name="adr-044"></a>
## ADR-044 스키마 태스크는 RDS 관리자로 적용하고 앱 계정은 읽기 · 쓰기만, 배포마다 실행해도 같은 결과, 시드 · 운영 규모 데이터는 빈 DB에만

- **상황:** 2-2 ③-b(2026-11-14). [ADR-031](#adr-031)은 스키마 계정과 앱 계정을 나누기로 했지만, 스키마 계정을 무엇으로 할지와 배포마다 실행해도 안전한 방식은 정하지 않았다. `schema.sql`은 `CREATE TABLE`만 있어 두 번째 실행에서 멈추고, 운영 규모 데이터(`db/seed-volume.sql`: 고객사 운영 DB에 쌓여 있다고 가정한 숙소 1,000 · 회원 2만 · 예약 10만 · 리뷰 5만)는 두 번 넣으면 중복 키로 멈춘다. RDS는 apply마다 빈 DB로 새로 생기고([ADR-042](#adr-042)), 스키마는 고객사 개발팀 영역이다([ADR-043](#adr-043)).
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 스키마 전용 계정(`migrator`)을 따로 | DB가 매번 새로 생겨 `migrator`를 만드는 관리자 단계가 매번 남는다. 같은 태스크에 관리자 비밀번호가 들어가 권한을 나눈 효과가 거의 없고, 금고(+ 도쿄 복제본)만 는다 |
  | 버전 파일 + 적용 기록 테이블을 직접 | 잠금 · 중간 실패 처리를 직접 짜야 한다. 지금은 기존 테이블을 바꿀 계획이 없다 |
  | 마이그레이션 도구(dbmate · Flyway 등) | 의존성과 이미지가 늘고, 도구 선택은 개발팀 몫이다 |
  | 운영 규모 데이터는 부하 시험 날만 손으로 | 시나리오상 고객사 운영 DB의 데이터라 평소 트래픽 · 비용 · 크기 판단도 이 양이 기준이다. 빠뜨리면 숙소 10개짜리 DB로 판단하게 된다. 1단계 legacy도 매일 넣었다([ADR-021](#adr-021)) |
  | 스키마 태스크는 apply 직후 1번만(CD에서 빼기) | 개발팀이 테이블을 추가한 배포에서 사람이 실행을 빠뜨리면 새 앱이 실패한다. 알림 아웃박스([ADR-037](#adr-037))처럼 테이블 추가가 예정돼 있다 |

- **결정:**
  - 스키마 태스크(`hotel-booking-aws-v2-migrate`)는 RDS 관리자 계정(`admin`, 비밀번호는 RDS 관리 금고)으로 접속해 스키마 → 시드 → 운영 규모 데이터 → 앱 계정 순서로 맞추고 끝난다. 앱 계정 `app`에는 `SELECT · INSERT · UPDATE · DELETE`만 준다.
  - 몇 번 실행해도 결과가 같게 한다. 테이블은 `CREATE TABLE IF NOT EXISTS`, 시드와 운영 규모 데이터는 숙소가 0개인 빈 DB일 때만 트랜잭션 하나로 넣는다(중간에 실패하면 통째로 취소돼 다음 실행이 다시 넣는다). 시드 파일은 두 번 넣을 수 있게 짜여 있지 않다(아래 결과). 앱 계정은 `CREATE USER IF NOT EXISTS` 뒤 `ALTER USER`로 비밀번호를 금고 값에 맞춘다.
  - CD는 배포마다 스키마 태스크를 실행한다([ADR-031](#adr-031) 유지).
  - 인프라와 개발팀 사이의 약속은 "이미지 안의 `node dist/src/migrate.js`가 스키마를 맞추고 성공 0 · 실패 1로 끝난다" 하나다. 안의 방식(SQL 파일, 도구)은 개발팀이 바꿀 수 있고 태스크 정의 · CD는 그대로다.
  - 운영 규모 데이터는 운영 환경(legacy · v2)에 항상 넣고 트래픽 · 성능 · 비용 판단의 기준으로 쓴다. 개발 PC · CI 테스트는 시드만 쓴다(속도, 운영 데이터를 개발 환경에 두지 않는 관례). 두 파일을 나눈 기준은 "운영 환경이냐 개발 환경이냐"다.
  - `seed-volume.sql`은 고객사 저장소 `scripts/`에서 `db/`로 옮겨 스키마 · 시드와 한곳에 두고, 이미지에는 `db/*.sql`을 복사한다.
- **근거:**
  - 앱이 뚫려도(SQL 인젝션 등) 테이블 변경 · 삭제 · 계정 생성은 못 한다. AWS도 마스터 계정을 애플리케이션에서 직접 쓰지 말라고 권한다.
  - "이번 배포에 스키마 변경이 있나"를 사람이 고르지 않는다. 변경이 없으면 확인만 하고 끝난다.
  - 1단계와 같은 데이터 양이 apply마다 자동으로 들어가 3단계 비교 · 비용 판단 기준이 같다.
- **결과:**
  - 실행 역할에 `rds!db-*` 금고 읽기(서울 · 도쿄)를 추가했다. 이름 뒷부분을 RDS가 무작위로 붙여 더 좁힐 수 없으므로, 이 계정의 다른 RDS 관리 금고도 읽을 수 있다. 실행 역할은 태스크 정의에 적힌 비밀값만 넣고, 앱 태스크 정의에는 이 금고가 없다.
  - 서울 apply 리소스가 37개에서 38개가 된다(태스크 정의 1).
  - 고객사 CI가 빈 DB에 스키마 태스크를 두 번 돌리고, 앱 계정의 `DROP TABLE`이 거부되는지 확인한다.
  - 로컬 확인 2026-11-14(빈 MySQL 8.4 컨테이너, 실제 이미지): 1회차 시드 · 운영 규모 데이터 6.0초(숙소 1,010 · 객실 5,030 · 회원 20,003 · 예약 100,013 · 리뷰 50,013), 2회차는 건너뛰고 행 수 같음, 둘 다 종료 코드 0. 앱 계정은 `DROP TABLE`이 `ERROR 1142`로 거부되고 `FOR UPDATE`는 된다. 같은 이미지의 앱이 앱 계정으로 `/api/health/deep` = ok. 관리자 비밀번호가 틀리면 메시지 한 줄과 종료 코드 1.
  - 처음에는 시드를 "`INSERT IGNORE`라 두 번 넣어도 된다"고 보고 매번 넣었는데, 2회차가 중복 키(시드 회원)로 멈췄고 그 전에 객실이 30개 늘었다(5,030 → 5,060). 시드 객실 id가 `UUID()`라 `INSERT IGNORE`가 거르지 못한다. 그래서 시드도 빈 DB에만 넣게 바꿨다. 또 실패할 때 에러 객체 전체를 찍으면 실행한 SQL이 로그에 남아, 앱 계정 문장에서 실패하면 비밀번호가 CloudWatch에 평문으로 남을 수 있어 메시지만 찍게 했다.
  - 재검토 조건: 기존 테이블의 구조 변경(컬럼 추가 · 이름 변경)이 처음 필요해지면 개발팀이 버전 기록 방식이나 도구로 바꾼다. 롤링 교체 중에는 옛 앱과 새 앱이 같은 DB를 쓰므로 변경은 두 번에 나눈다(expand-contract, [ADR-031](#adr-031)).
  - RDS 확인 2026-11-14(db.t4g.micro, 이미지 `33146c2`): 첫 실행 종료 코드 0, 시드 · 운영 규모 데이터 14.9초, 행 수는 로컬과 같다. 같은 날 앱 태스크 정의로 띄운 확인 태스크가 앱 계정으로 `/api/health/deep` = ok, `/api/hotels` 조회에 성공했다([03-plan](03-plan.md)).
  - 3단계 덤프 이관 날에는 이미 들어간 시드 · 운영 규모 데이터가 덤프와 키가 겹칠 수 있다. 그날 "스키마만" 실행할지는 3단계에서 정한다.
  - 옮기면서 고객사 legacy DB 서버의 user_data가 저장소 분리 전 경로(이 저장소의 `app/db` · `scripts`)에서 SQL을 받던 것을 함께 고쳤다. 그대로였다면 다음 legacy apply에서 404로 DB 준비가 실패했다.

<details>
<summary>확인한 근거와 메모</summary>

- RDS 관리 금고는 *"rotates the secret every seven days by default"*([RDS 비밀번호 관리](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html)). ECS는 비밀값을 *"when the container is initially started"* 한 번 넣고 이후 교체는 반영하지 않는다([ECS 비밀값](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html)). 스키마 태스크는 매번 새로 떠서 교체 영향이 없다.
- JSON 키 하나 꺼내기: `arn:aws:secretsmanager:<리전>:<계정>:secret:<이름>:<json-key>:<version-stage>:<version-id>`(같은 문서). `kms:Decrypt`는 고객 관리 키일 때만 필요하다(*"Required only if your secret uses a customer managed key"*, [실행 역할](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)). 실행 역할은 ECS · Fargate 에이전트가 쓰고, 컨테이너가 AWS를 부를 때 쓰는 건 태스크 역할이다([태스크 역할](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)). 이 서비스에는 태스크 역할이 없다.
- MySQL 8.4: `CREATE TABLE IF NOT EXISTS`는 *"no verification that the existing table has a structure identical"*([CREATE TABLE](https://dev.mysql.com/doc/refman/8.4/en/create-table.html)). `CREATE USER IF NOT EXISTS`는 있으면 오류 대신 경고([CREATE USER](https://dev.mysql.com/doc/refman/8.4/en/create-user.html)). `SELECT ... FOR UPDATE`는 *"the SELECT privilege and at least one of the DELETE, LOCK TABLES, or UPDATE privileges"*([잠금 읽기](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)).
- RDS for MySQL 8.0.36 이상의 마스터는 `CREATE USER` 권한을 가진다. *"We strongly recommend that you do not use the master user directly in your applications."*([마스터 계정](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.MasterAccounts.html))
- 문서로 확인하지 못해 첫 실행으로 확인한 것(2026-11-14 모두 확인): RDS 관리 금고의 JSON 키 이름 `password`(문서에 키 목록 없음, 틀렸다면 컨테이너 시작 전에 비밀값 오류), 마스터가 다른 계정에 `GRANT`할 수 있는지(문서에 GRANT OPTION 언급 없음). `require_secure_transport` 기본값은 [ADR-045](#adr-045)에서 조회했다.

</details>

<a name="adr-045"></a>
## ADR-045 DB 접속은 TLS로 하고 앱이 RDS 인증서 · 주소까지 확인, RDS는 암호화하지 않은 접속을 거부

- **상황:** 2-2 ③-b(2026-11-14). 앱과 스키마 태스크는 지금 암호화 없이 DB에 붙는다. DB로 오가는 데이터에는 회원 이메일 · 전화번호 · 예약 같은 개인정보가 있다. RDS MySQL 8.4의 AWS 기본 설정표(`default.mysql8.4`)를 조회하니 `require_secure_transport` 값이 비어 있어(`None`) MySQL 기본값 OFF가 적용된다. 즉 지금 그대로 두면 평문 접속이 된다.
- **검토한 대안:**

  | 대안 | 버린 이유 |
  |---|---|
  | 기본값 그대로(평문) | "같은 VPC 안이라 안전하다"에 기댄다. VPC 안의 다른 자원 하나가 뚫리면 평문을 엿볼 수 있고, 보안 점검에서 자주 지적받는다 |
  | 앱만 TLS(서버 강제 없음) | 설정을 빠뜨린 클라이언트가 조용히 평문으로 붙어도 막지 못한다 |
  | 서버만 강제(앱은 인증서 확인 없이 TLS) | 암호화는 되지만 가짜 서버(중간자)를 걸러 내지 못한다 |
  | 계정마다 `REQUIRE SSL` | 계정을 만들 때마다 챙겨야 한다. 서버 설정 하나가 모든 계정에 적용돼 빠뜨릴 일이 없다 |

- **결정:**
  - 서버: 모듈에 우리 설정표(`aws_db_parameter_group`, `hotel-booking-aws-v2`)를 두고 `require_secure_transport = 1`. 동적 파라미터라 재부팅 없이 적용된다.
  - 클라이언트: 앱과 스키마 태스크는 `DB_TLS=rds`일 때 RDS 인증서 묶음(`aws-ssl-profiles`)으로 서버 인증서를 확인하고, `verifyIdentity: true`로 인증서의 주소가 접속한 RDS 주소와 같은지도 확인한다. 태스크 정의 두 개에 `DB_TLS=rds`를 넣는다.
  - 로컬 · CI MySQL은 RDS 인증서가 없어 `DB_TLS`를 넣지 않는다(평문).
- **근거:**
  - 서버 강제와 클라이언트 확인을 둘 다 해야 "암호화"와 "상대가 진짜 우리 DB"를 함께 보장한다.
  - mysql2는 `verifyIdentity`를 주지 않으면 호스트 이름을 확인하지 않는다(아래 소스). 인증서 묶음만 주면 "어느 RDS든 RDS 인증서면 통과"가 된다.
- **결과:**
  - 평소 사용자 정책에 파라미터 그룹 권한 5개(`Create` · `Modify` · `Delete` · `DescribeDBParameterGroups` · `DescribeDBParameters`)를 더했다. 서울 apply 리소스가 1개 늘어난다(파라미터 그룹).
  - 앱 저장소에 `aws-ssl-profiles`(mysql2가 이미 쓰던 1.1.2)를 직접 의존성으로 올렸다.
  - 로컬 확인 2026-11-14(MySQL 8.4 컨테이너, `--require-secure-transport=ON`): 평문 접속은 서버가 `Connections using insecure transport are prohibited while --require_secure_transport=ON.`로 거부, RDS가 아닌 서버에 `DB_TLS=rds`로 붙으면 앱이 `self-signed certificate in certificate chain`으로 거부했다. RDS에서는 2026-11-14 스키마 태스크(관리자)와 앱 확인 태스크(앱 계정)가 모두 TLS로 붙었다. RDS가 평문을 거부하는 상태에서 접속에 성공했으므로 인증서 · 주소 확인을 통과한 것이다.
  - 인증서 묶음에는 서울 루트 인증서 RSA2048 G1(2061년까지) · RSA4096 G1 · ECC384 G1이 들어 있다. RDS가 인증서(CA)를 바꾸면 묶음 패키지를 올려야 한다.

<details>
<summary>확인한 근거와 메모</summary>

- RDS 문서: *"By default, the `require_secure_transport` parameter is set to `OFF`."*([SSL/TLS 필수](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-ssl-connections.require-ssl.html)). 버전이 적혀 있지 않아 `aws rds describe-engine-default-parameters --db-parameter-group-family mysql8.4`로 직접 조회했다: `require_secure_transport  None  dynamic  True  0,1`(값 없음, 동적, 수정 가능).
- mysql2 3.x 소스 `lib/base/connection.js`: `checkServerIdentity: verifyIdentity ? Tls.checkServerIdentity : function () { return undefined; }`. `rejectUnauthorized`는 `false`로 주지 않으면 켜진다(`lib/connection_config.js`). 문자열 프로필 `'Amazon RDS'`는 deprecated이고 `aws-ssl-profiles`를 쓰라고 한다(`lib/constants/ssl_profiles.js`).

</details>
