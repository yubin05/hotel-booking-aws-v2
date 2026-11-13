# 09. v1 · v2 월 비용 추정

켜 두는 시간만큼 나오는 **고정 비용**을 v1과 v2에서 같은 기준으로 비교합니다. 트래픽에 따라 달라지는 사용량 비용은 [제외한 것](#제외한-것)에 따로 적었습니다.

- 단가: AWS Price List API(서울 리전, 온디맨드)와 Azure Retail Prices API(Korea Central)에서 2026-11-09에 조회. 미국 달러, 부가세 제외.
- 시간 기준 두 가지
  - **작업 시간**: 평일 9~18시만 켜 둠(주말·야근 없음). 월 평균 평일 21.7일 × 9시간 = **195시간**. v1도 같은 방식으로 한 달 작업했다고 가정합니다.
  - **상시 운영**: 고객 서비스를 24시간 켜 둠. 월 **730시간**. 고객이 실제로 내는 비용입니다.

## 결과

| | 시간당 | 작업 시간 (195시간) | 상시 운영 (730시간) |
|---|---|---|---|
| v1 (AWS + Azure 멀티클라우드 DR) | $0.93 | **$182** | **$679** |
| v2 (Multi-AZ + 리전 간 백업) | $0.21 | **$42** | **$157** |
| 차이 | | −77% | −77% |

- 두 열 모두 같은 시간을 켜 둔 **월 단가** 비교입니다(차이는 시간당 요금). 프로젝트 **총비용**은 기간에 따라 달라서, v2 작업이 4.3개월을 넘으면 총액은 v1의 한 달($182)보다 커집니다. 실제로는 테스트할 때만 켜므로 월 195시간보다 적게 씁니다.

- v1에서 가장 큰 항목은 Azure VPN Gateway(상시 $157)와 Aurora 최소 용량(상시 $146)입니다. 둘 다 평소에는 일이 거의 없어도 켜 둬야 하는 대기 비용입니다([v1 회고](05-v1-retrospective.md) 8번 "상시 비용이 컸다").
- v2에서 가장 큰 항목은 NAT Gateway(상시 $47)입니다. 앱이 하는 일에 비해 크지만, 프라이빗 서브넷에서 외부(이미지 받기, 로그 전송)로 나가는 길이라 1개는 둡니다([02 아키텍처 2절](02-architecture.md#2-네트워크)).

## v1 고정 비용

v1 저장소 Terraform(`terraform/`, `terraform-azure/`)의 크기 그대로입니다.

| 항목 | 크기와 단가 | 시간당 | 작업 시간 | 상시 |
|---|---|---|---|---|
| ECS Fargate 태스크 10개 | 서비스 5개 × 2개: 0.25 vCPU · 0.5GB 8개 + 0.5 vCPU · 1GB 2개 | $0.1703 | $33.2 | $124.3 |
| Aurora Serverless v2 | 쓰기 + 읽기, 최소 0.5 ACU씩 × $0.20 | $0.2000 | $39.0 | $146.0 |
| DMS 복제 인스턴스 | dms.t3.small $0.056 + 저장 50GB | $0.0650 | $12.7 | $47.4 |
| OpenSearch | t3.small.search $0.056 + gp3 50GB | $0.0655 | $12.8 | $47.8 |
| NAT Gateway + 공인 IPv4 | $0.059 + IP $0.005 | $0.0640 | $12.5 | $46.7 |
| Internal ALB | $0.0225 (LCU 제외) | $0.0225 | $4.4 | $16.4 |
| Site-to-Site VPN (AWS ↔ Azure) | 연결 1개 $0.05 | $0.0500 | $9.8 | $36.5 |
| Route 53 호스팅 영역 | 월 $0.50 | - | $0.5 | $0.5 |
| Azure VPN Gateway + 공인 IP | VpnGw1AZ $0.21 + IP $0.005 | $0.2150 | $41.9 | $156.9 |
| Azure MySQL Flexible Server | B1ms $0.026 + 저장 20GB | $0.0296 | $5.8 | $21.6 |
| Azure Container Apps | 앱 5개 × 최소 1개(0.25 vCPU · 0.5GiB), 대기(idle) 단가 | $0.0405 | $7.9 | $29.6 |
| Azure Container Registry | Basic 하루 $0.1666 | $0.0069 | $1.4 | $5.1 |
| **합계** | | **$0.9294** | **$181.7** | **$678.9** |

## v2 고정 비용

[02 아키텍처](02-architecture.md) 기준입니다. 태스크 크기(0.5 vCPU · 1GB)는 가정이며, 1·3단계 부하 테스트 뒤 정합니다.

| 항목 | 크기와 단가 | 시간당 | 작업 시간 | 상시 |
|---|---|---|---|---|
| ECS Fargate 태스크 2개 | 최소 2개 × 0.5 vCPU · 1GB | $0.0568 | $11.1 | $41.4 |
| RDS for MySQL Multi-AZ | db.t4g.micro $0.051 + gp3 20GB | $0.0582 | $11.3 | $42.5 |
| NAT Gateway + 공인 IPv4 | $0.059 + IP $0.005 | $0.0640 | $12.5 | $46.7 |
| Internal ALB | $0.0225 (LCU 제외) | $0.0225 | $4.4 | $16.4 |
| WAF | 웹 ACL $5 + 규칙 3개 $3 (앱 · 사진 요청 수 한도 + 관리형 기본 규칙, 월 요금 시간 단위 일할, [ADR-035](04-decisions.md#adr-035)) | $0.0110 | $2.1 | $8.0 |
| Secrets Manager | 비밀 3개 × $0.40 (DB, JWT 서명 키, 카카오 키) | $0.0016 | $0.3 | $1.2 |
| Route 53 호스팅 영역 | 월 $0.50 | - | $0.5 | $0.5 |
| **합계** | | **$0.2140** | **$42.2** | **$156.8** |

- 포트폴리오에서는 RDS를 평소 Single-AZ로 두고 장애 조치 테스트 때만 Multi-AZ로 켭니다. 그러면 작업 시간 기준 약 $6 더 줄어듭니다. 도쿄 리전 리소스는 5단계 복원 드릴 때만 생깁니다.

## 단계별 예상과 Budgets 알림

| 단계 | 켜 두는 것 | 작업 시간 기준 월 |
|---|---|---|
| 1단계 이전 환경 | EC2 t3.micro 3대(NAT·앱·DB, $0.013씩, 2026-11-11 Price List API로 확인, [ADR-021](04-decisions.md#adr-021)) + 공인 IPv4 2개($0.005씩) | 약 $10 (EBS 제외) |
| 2~4단계 목표 인프라 | v2 고정 비용 + 부하 테스트 사용량 | 약 $42 + 사용량 |
| 5단계 리전 복원 드릴 | v2 + 드릴 동안 도쿄에 같은 구성 | 드릴 시간 × 약 $0.21 추가 |

- **AWS Budgets 알림은 1단계 시작 전에 먼저 켭니다.** 1단계부터 AWS 비용이 생기기 때문입니다.
- 제안 금액: 월 **$50** (v2 작업 시간 기준 $42 + 사용량 여유). 실제 금액 50% · 80% · 100%와 예측 100%에서 이메일 알림.
- 1단계는 월 약 $10이라 50% 알림이 울리면 그 자체로 이상 신호입니다. Budgets는 알림만 보내고 리소스를 멈추지 않으며, 데이터는 하루 최대 3번(8~12시간 간격) 갱신되어 알림이 늦을 수 있습니다.
- 알림이 울리면 서비스별 비용을 보고 원인에 따라 대응합니다.

  | 원인 | 대응 |
  |---|---|
  | 실수: destroy 누락, 남은 NAT · 공인 IP · RDS 스냅샷 · 도쿄 리소스 · EBS | 바로 지우고 예산은 그대로. 트러블슈팅에 기록 |
  | 계획된 증가: 3단계 부하 테스트, 5단계 복원 드릴 | 그 달만 예산 상향(예: $80), 이유를 03 결과 기록에 |
  | 추정 오류: 단가 · 가정이 틀림 | 이 문서를 고친 뒤 예산 재설정 |

  100%를 넘으면 그 달 남은 작업은 비싼 리소스 없이 할 수 있는 코드 · 문서 위주로 합니다. 자동 정지(budget action)는 대상이 EC2 · RDS뿐이라 NAT · ALB 비용은 계속 나가고 테스트가 중간에 끊길 수 있어 쓰지 않습니다.
- 단계가 끝날 때마다 실제 청구 금액을 [03 진행 계획](03-plan.md#결과-기록)에 적고 이 추정과 비교합니다.

## 제외한 것

- **사용량 비용**: CloudFront 전송 · 요청, WAF 요청($0.60/백만), SES 메일(Essentials $0.16/1,000통, 2026-11-13 요금 페이지), 사진 S3 저장과 도쿄 복제(사진 수십 장, 수십 MB 수준), NAT 처리량($0.059/GB), ALB LCU($0.008/LCU-시간), CloudWatch 로그 수집($0.76/GB), API Gateway 요청(v1, $1.23/백만), 백업 리전 간 전송. 작업 시간에는 내 테스트 트래픽뿐이라 작고, k6 부하 테스트 때 실제 청구 금액으로 따로 기록합니다.
- **v1**: 이관 때만 쓰는 것(IDC 역할 VPC의 EC2, IDC ↔ AWS VPN), Aurora가 부하로 최소 용량보다 커지는 부분, Lambda · SQS · Cognito · Amplify · Firehose · CodePipeline처럼 쓴 만큼 내는 것, Azure 무료 제공량(Container Apps 기준 월 $2 안팎).
- **공통**: 공휴일, EBS 같은 작은 저장 비용, 환율, 부가세, 프리 티어와 크레딧.

## 출처

- AWS Price List API: `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<서비스>/current/ap-northeast-2/index.json` (AmazonECS, AmazonRDS, AmazonVPC, AWSELB, AmazonES, AWSDatabaseMigrationSvc, awswaf, AWSSecretsManager, AmazonCloudWatch, AmazonApiGateway), EC2 · NAT Gateway는 같은 경로의 `AmazonEC2/.../index.csv`, Route 53은 `AmazonRoute53/current/index.json`
- Azure Retail Prices API: `https://prices.azure.com/api/retail/prices` (VPN Gateway, Azure Database for MySQL, Virtual Network IP Addresses, Container Registry, Azure Container Apps, `armRegionName eq 'koreacentral'`)
