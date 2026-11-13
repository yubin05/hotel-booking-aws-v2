# 02. 아키텍처

목표 구조와 그 이유를 정리합니다. 각 선택의 대안 비교는 [04 설계 결정 기록](04-decisions.md)에 있습니다. "확인 필요" 표시가 있는 내용은 구현 전에 공식 문서나 PoC로 확인합니다([03 진행 계획](03-plan.md#구현-전에-확인할-것)).

## 1. 요청 경로

```
사용자
 → Route 53 (hotel.vundle34.cloud, 가비아의 vundle34.cloud에서 NS 위임)
 → CloudFront + WAF (가까운 엣지, ACM 인증서는 us-east-1)
 → VPC Origin (CloudFront가 우리 서브넷에 만든 전용 통로)
 → Internal ALB (프라이빗 앱 서브넷, AZ 2개)
 → ECS Fargate 모놀리스 (프라이빗 앱 서브넷, AZ 2개)
 → RDS for MySQL (DB 서브넷, Multi-AZ)

사진: img.hotel.vundle34.cloud → CloudFront(사진용) → S3 (미리 여러 크기로 줄인 사진, 서울 → 도쿄 복제)
```

- CloudFront VPC Origin은 인터넷에 노출되지 않은 Internal ALB를 CloudFront의 원본으로 쓸 수 있게 해 줍니다. 그래서 백엔드를 공개하지 않고도 API Gateway 없이 경로를 구성할 수 있습니다([ADR-006](04-decisions.md#adr-006)). 실제 숙박 서비스 5곳도 앱 앞에 CDN을 두고 사진은 전용 도메인으로 냅니다([08 5절](08-real-cases.md), [ADR-035](04-decisions.md#adr-035)).
- 정적 프론트엔드(HTML·CSS·JS)는 앱 컨테이너에 포함해 Express가 API와 함께 내보냅니다. CloudFront가 캐시하므로 서버 부담은 작고, 배포물이 하나라 리전 복원도 이미지 하나로 끝납니다([ADR-013](04-decisions.md#adr-013)).

### API Gateway 없이 대신하는 것

| API Gateway의 역할 | v2에서 맡는 곳 |
|---|---|
| TLS 종료 | CloudFront + ACM |
| 요청 제한 | CloudFront에 붙인 WAF의 요청 수 기반 규칙(rate-based rule) |
| 인증·인가 | 앱의 JWT 검증 |
| 캐시 | CloudFront 캐시 정책 (`/api/*`는 캐시하지 않음), 사진은 전용 도메인에서 길게 캐시 |

## 2. 네트워크

```
VPC (서울 10.0.0.0/16, 도쿄 10.1.0.0/16, ADR-033)
├─ 퍼블릭 서브넷 ×2         NAT Gateway AZ마다 (포트폴리오 평소 1개)
├─ 프라이빗 앱 서브넷 ×2     Internal ALB, ECS 태스크, VPC Origin의 ENI (+ S3 게이트웨이 엔드포인트 경로)
└─ 프라이빗 DB 서브넷 ×2     RDS (Multi-AZ 대기 DB는 다른 AZ), 밖으로 나가는 경로 없음
AZ는 ID로 지정 (서울 apne2-az1 · apne2-az3), 서브넷은 /24
```

- 보안 그룹은 앞 단계에서 오는 트래픽만 허용하는 사슬로 구성합니다: CloudFront(VPC Origin) → ALB → ECS → RDS.
- ALB, ECS, RDS 모두 공인 IP가 없습니다. 공인 IP는 NAT만 씁니다.
- 출구는 AZ마다 NAT Gateway + S3 게이트웨이 엔드포인트입니다([ADR-034](04-decisions.md#adr-034)). 고객사 서비스에는 결제·알림톡 같은 외부 연동이 거의 확실히 있어 NAT를 두고, ECR 이미지 레이어는 무료 S3 게이트웨이로 받습니다. AZ마다 두어야 한 AZ가 장애 나도 다른 AZ의 대체 태스크가 이미지를 받아 뜹니다. 포트폴리오는 비용 때문에 평소 1개로 돌리고 AZ 장애 테스트 때 2개로 켭니다(RDS Multi-AZ와 같은 방식).
- VPC Origin을 쓰는 VPC에는 인터넷 게이트웨이가 있어야 합니다. 트래픽이 IGW를 지나지는 않고, VPC가 인터넷 트래픽을 받을 수 있다는 표시입니다([VPC Origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html), 2026-11-13 확인).

## 3. 컴퓨트와 앱

- ECS Fargate 서비스 1개, 최소 태스크 2개를 AZ 2개에 분산합니다.
- 오토스케일링은 목표 추적(CPU 또는 ALB 요청 수)으로 하고, **최대 태스크 수가 비용 상한**입니다. 값은 부하 테스트 결과로 정합니다.
- 쿠폰 이벤트처럼 시각을 아는 급증은 **예약 스케일링**으로 오픈 전에 최소 태스크 수를 미리 올리고, 끝나면 되돌립니다([ADR-015](04-decisions.md#adr-015)).
- 배포는 롤링 방식이고, 배포 circuit breaker가 실패를 감지하면 이전 버전으로 자동 롤백합니다.

### 헬스체크는 두 단계로 나눕니다

| 경로 | 확인하는 것 | 쓰는 곳 |
|---|---|---|
| `/api/health` | 앱 프로세스가 응답하는가 (DB 확인 안 함) | ALB 대상 헬스체크 |
| `/api/health/deep` | DB 연결까지 정상인가 | 외부 모니터링·알림 |

ALB 헬스체크에 DB 확인을 넣으면, DB가 잠깐만 끊겨도 모든 태스크가 비정상으로 빠져 서비스 전체가 멈추는 연쇄 장애가 생깁니다.

### 앱 구조

- 모듈러 모놀리스: 인증·호텔·예약 모듈을 한 앱에 두고, 모듈끼리는 함수로 호출합니다([ADR-004](04-decisions.md#adr-004)). v1의 같은 이름 서비스(Node.js + Express + TypeScript + mysql2) 코드를 합쳐 재사용하고, SQS 알림·이미지·번역·추천·위시리스트 코드는 뺍니다.
- 인증: 앱이 직접 JWT를 발급합니다. 비밀번호는 해시로 저장하고, 사용자 정보가 DB 백업에 함께 들어가므로 복구 경로가 하나입니다([ADR-007](04-decisions.md#adr-007)). 리전 전환 후에는 다시 로그인해야 합니다.
- 스키마 변경은 배포 전에 한 번만 실행합니다(ECS 일회성 태스크). 태스크 여러 개가 동시에 실행하면 충돌하기 때문입니다.

### 앱과 인프라의 약속

앱이 아래 약속을 지키면 Terraform 변수만 바꿔 다른 컨테이너 앱도 올릴 수 있습니다(12-Factor 원칙). 범용 플랫폼은 만들지 않습니다([ADR-011](04-decisions.md#adr-011)).

| 약속 | Terraform 변수 |
|---|---|
| 컨테이너 이미지로 빌드된다 | `image` |
| 정해진 포트에서 응답한다 | `container_port` |
| 헬스체크 경로가 있다 | `health_check_path` |
| DB 접속 정보를 환경 변수로 받는다 | 자동 주입 |
| 스키마 변경 명령이 있다 | `migrate_command` |

## 4. 데이터

- RDS for MySQL, 작은 인스턴스(예: `db.t4g.micro`). 버전은 8.4 계열 예정(8.0 지원 일정 확인 필요)입니다([ADR-005](04-decisions.md#adr-005)).
- Multi-AZ는 설계상 상시입니다. 포트폴리오에서는 비용 때문에 장애 조치 테스트 때만 켭니다.
- 자동 백업으로 시점 복구(PITR)를 하고, 백업을 도쿄 리전에 복제합니다. RDS 자동 백업 리전 간 복제가 이 조합에서 지원되는지 확인 필요하며, 안 되면 AWS Backup 리전 간 복사로 대체합니다(이 경우 RPO는 복사 주기만큼 길어짐).

### 데이터 모델 원칙

| 원칙 | 이유 |
|---|---|
| 객실·날짜 단위 재고 행에 유니크 제약 | 앱 버그가 있어도 DB가 이중 예약을 막음 |
| 예약 생성은 `Idempotency-Key` 헤더 + 유니크 제약 | 같은 요청이 두 번 와도 1건만 생성 |
| 예약 PK는 시간 순 UUID(UUIDv7) | 리전 복원 후 되돌아올 때 두 DB의 데이터를 합쳐도 ID가 겹치지 않음 |
| 모든 테이블에 `updated_at`, 취소는 삭제 대신 상태 변경 | 특정 시각 이후 변경분을 뽑아 대조할 수 있음 |
| 저장 프로시저·트리거·뷰를 쓰지 않음 | 덤프·복원 시 만든 계정(DEFINER) 문제를 피하고 로직은 앱에 둠 |
| 쿠폰 발급은 `issued_count < quantity` 조건부 UPDATE + (쿠폰, 사용자) 유니크 + CHECK 제약 | 동시에 몰려도 초과 발급 0건, 1인 1매 ([ADR-014](04-decisions.md#adr-014)) |
| 쿠폰 사용은 `used_booking_id IS NULL` 조건부 UPDATE | 같은 쿠폰을 두 예약에 동시에 쓸 수 없음 |
| 부모 행(쿠폰·숙소)을 먼저 잠근 뒤 자식 행을 넣음 | 외래 키 검사가 부모 행에 공유 잠금을 걸어, 순서가 반대면 동시 요청끼리 교착이 난다 (0단계 테스트에서 발견) |
| 숙소 평점·리뷰 수는 리뷰를 저장할 때 리뷰 테이블에서 다시 계산 | 저장된 값이 실제 리뷰와 항상 일치 |

## 5. CI/CD

```
PR 생성
  → 테스트, 이미지 빌드, terraform fmt·validate·plan (결과를 PR에 표시)

main 병합
  → 테스트 → 이미지 빌드 → ECR 푸시 (GitHub OIDC, 장기 액세스 키 없음)
  → 스키마 변경 실행 → ECS 롤링 배포 → 실패하면 자동 롤백

terraform apply는 사람이 실행 (인프라 변경은 자동 적용하지 않음)
```

- ECR 이미지는 도쿄로 리전 간 복제합니다. 서울 장애 때 도쿄에서 이미지를 받기 위해서입니다.
- ECR에 이미지를 올릴 때 기본 취약점 스캔을 켭니다.

## 6. 보안

- 비밀값(DB 비밀번호, JWT 서명 키)은 Secrets Manager에 둡니다. 저장소에는 예시 파일만 둡니다.
- IAM: ECS 태스크 실행 역할과 태스크 역할을 나누고, GitHub OIDC 역할은 이 저장소와 브랜치로 제한합니다.
- WAF(CloudFront에 연결): 요청 수 제한 규칙과 AWS 관리형 기본 규칙 세트.
- CloudFront와 ALB 사이 구간을 HTTP로 둘지 HTTPS로 둘지는 PoC 후 정합니다.

## 7. 관측과 비용 통제

- CloudWatch Logs(보존 기간 짧게), 지표와 알람(5xx 비율, 응답 시간, RDS CPU·연결 수).
- 비용 통제 장치 네 가지:

| 장치 | 역할 |
|---|---|
| 오토스케일링 최대 태스크 수 | 아무리 몰려도 이 이상 늘지 않음 |
| CloudFront 캐시 | 조회 트래픽과 사진이 서버까지 오지 않음 |
| WAF 요청 제한 | 비정상 폭주와 봇 차단 |
| AWS Budgets 알림 | 예산의 일정 비율을 넘으면 알림 |

- 주요 비용 요소: NAT Gateway, ALB, RDS(Multi-AZ 시 약 2배), Fargate, WAF, 공인 IPv4, 백업 저장. 금액은 0단계에서 AWS 요금 계산기로 산출하고, 실제 청구 금액을 단계별로 기록합니다.

## 8. 리전 장애 복구 흐름 (Backup & Restore)

서울 리전 장애를 가정합니다. CloudFront·Route 53 같은 글로벌 서비스 자체의 장애는 범위 밖입니다.

```
평시   서울에서 운영
       RDS 백업과 ECR 이미지가 도쿄로 복제됨 (도쿄에 켜진 서버는 없음)

장애   1. 서울 장애 확인 (모니터링 알림 + 사람의 판단)
       2. infra/tokyo 를 apply (modules/regional 호출: VPC, ALB, ECS)
       3. 복제된 백업으로 도쿄에 RDS 시점 복원
       4. 기능 검증 (로그인, 예약 생성·변경·취소)
       5. infra/global 의 원본 값을 도쿄로 고쳐 apply
          → CloudFront 앱 원본을 도쿄 VPC Origin으로 전환 (DNS는 그대로)
          사진은 CloudFront 원본 장애 조치로 이미 도쿄 S3에서 나가는 중

복귀   1. 서울 복구 확인 → 서울 ECS 태스크를 0으로 (옛 DB에 쓰기 방지)
       2. 도쿄를 점검 모드로 (쓰기 중지) → 덤프 → 서울 RDS 스냅샷을 남긴 뒤 로드 → 검증
       3. CloudFront 원본을 서울로 전환 → 도쿄 리소스 destroy
       4. 대조: 서울 옛 DB에서 마지막 복제 시각 이후 변경분을 뽑아 현재 데이터와 비교
```

- DNS 대신 **CloudFront 원본을 바꾸는** 이유: CloudFront는 글로벌 서비스라 서울 장애의 영향을 받지 않고, Route 53은 늘 CloudFront를 가리켜 DNS 캐시 지연이 없습니다([ADR-012](04-decisions.md#adr-012)). 다른 리전 VPC Origin으로의 전환은 global 루트를 만들 때 PoC로 먼저 확인하고, 안 되면 Public ALB + 비밀 헤더로 바꿉니다([ADR-035](04-decisions.md#adr-035)).
- Terraform state 버킷은 도쿄에 둡니다. 서울 장애 중에도 Terraform을 실행해야 하기 때문입니다([ADR-025](04-decisions.md#adr-025)).

## 9. RTO·RPO 측정 방법

잠정 목표(AZ 장애 10분, 리전 장애 RTO 1시간, [ADR-036](04-decisions.md#adr-036))를 두고 드릴 3회 실측 후 확정합니다. 리전 RTO가 1시간을 넘으면 가장 느린 단계를 Pilot Light(도쿄 DB 복제본)로 바꿉니다.

- **RTO** = 장애 선언부터 검증을 통과하고 전환이 끝날 때까지. 단계마다 시각을 기록합니다.

```
RTO ≈ 판단 + 인프라 생성(apply) + DB 복원 + 앱 기동 + 기능 검증 + CloudFront 반영
```

- **RPO** = 장애 시각 − 복원된 데이터의 마지막 커밋 시각. 드릴 중에 순번을 붙인 예약을 일정 간격으로 계속 만들고, 복원 후 남아 있는 가장 큰 순번으로 계산합니다. 같은 요청의 재시도로 멱등성도 함께 확인합니다.

## 10. 미결정 사항

| 항목 | 선택지 | 정하는 시점 |
|---|---|---|
| ~~사용할 도메인·서브도메인~~ | 앱 `hotel.vundle34.cloud`, 사진 `img.hotel.vundle34.cloud` (가비아에서 산 `vundle34.cloud`의 하위 도메인, 2026-11-13 결정) | 완료 |
| 오토스케일링 지표와 상한값 | CPU / 요청 수 | 3단계 부하 테스트 후 |
| 백업 보존 기간 | 7일 등 | 2단계 |
