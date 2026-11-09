# 05. v1 회고

v1([Project_TEAM_AWS](https://github.com/yubin05/Project_TEAM_AWS))은 4인 팀 프로젝트였고, 저는 팀장으로 멀티클라우드 인프라 설계와 Terraform 구현, DR을 맡았습니다. 이 회고는 제 설계 판단을 돌아보는 글입니다.

## v1 요약

- **구성:** AWS Primary(Amplify, API Gateway, VPC Link, Internal ALB, ECS 마이크로서비스 5개, Aurora) + Azure Passive(Static Web Apps, API Management, Container Apps, Azure MySQL, VPN Gateway)
- **데이터:** DMS Full Load + CDC로 Aurora에서 Azure MySQL로 비동기 복제
- **전환:** Route 53 헬스체크 기반 DNS Failover
- **그 밖:** CodePipeline·CodeDeploy Blue/Green, WAF·GuardDuty 등 보안 서비스, Firehose·OpenSearch 로그 파이프라인, IDC를 재현한 VPC에서 VPN + DMS로 이관

## 구현한 것과 검증하지 못한 것

| 구현함 | 검증하지 못함 |
|---|---|
| Terraform으로 AWS·Azure 인프라 상당 부분 구성 | 전체 서비스 복구 |
| DMS 복제 태스크 구성, 일부 데이터 반영 확인 | RPO·RTO 정량 측정 |
| Route 53 DNS Failover 테스트 | Failback 후 데이터 정합성 |

## 면접에서 받은 질문

1. AWS와 Azure의 데이터 동기화는 어떻게 맞췄나요?
2. Route 53만 전환하는 것 같은데, 실제 DR이라고 할 수 있나요?
3. DR 전환도 Terraform으로 자동화할 수 있지 않나요?
4. AWS 장애 이후 Azure에서 생긴 데이터를 AWS로 어떻게 되돌리나요?

네 질문 모두 제대로 답하지 못했고, 이것이 v2의 출발점입니다.

## 돌아보니 보이는 문제

| # | 문제 | 근거 |
|---|---|---|
| 1 | 시나리오와 해결책이 어긋났다 | 고객 문제는 트래픽 폭증(용량)인데 설계는 DR 중심이었다 |
| 2 | "리전 장애 → 멀티클라우드"는 논리가 건너뛰었다 | 리전 장애는 멀티리전이나 리전 간 백업으로 해결된다 |
| 3 | 마이크로서비스가 분산 모놀리스였다 | 서비스끼리 동기 호출로 묶여 하나가 죽으면 예약도 실패, 인증 미들웨어가 4벌 복사됨 |
| 4 | 이관 방식이 과했다 | IDC 역할 DB는 `t3.micro` 1대, 시드 31KB인데 VPN + DMS + CDC를 썼다 |
| 5 | 장애 감지가 얕았다 | Route 53 헬스체크가 정적 프론트 위주라 백엔드·DB 장애를 놓칠 수 있었다 |
| 6 | 데이터 정합성을 증명하지 못했다 | 비동기 복제 지연과 RPO를 재지 않았고, Failback 스크립트는 INSERT 중심이었다 |
| 7 | 클라우드 간 의존이 남아 있었다 | Azure 쪽 인증도 AWS Cognito에 의존했다 |
| 8 | 상시 비용이 컸다 | Azure VPN Gateway, MySQL 등 대기 환경을 계속 켜 둬야 했다 |
| 9 | 재현성이 부족했다 | 일부 IAM·보안 설정이 수동이었고, CI/CD가 늦게 갖춰져 개발 중 배포가 어려웠다 |

한 문장으로 정리하면, **기술을 먼저 고르고 요구사항을 거기에 맞췄습니다.**

## v1에서 가져갈 것

- AWS·Azure를 Terraform으로 구성해 본 멀티클라우드 경험
- DMS 이관 경험: v2에서 "이 규모에는 덤프가 맞다"고 판단하는 근거가 됨
- 4인 팀 리딩 경험
- Route 53 Failover와 장애 전환 실습

## 면접 질문에 대한 v2의 답

| 질문 | v2의 답 |
|---|---|
| 1. 데이터 동기화 | 멀티클라우드를 없앴다. 같은 리전 안은 Multi-AZ 동기 복제, 리전 간은 백업 복제이며 RPO는 실측값으로 제시한다 |
| 2. DNS만 전환? | 다른 리전에 DB를 복원하고 로그인·예약 기능을 검증한 뒤에 전환한다. 전환은 CloudFront 원본 변경이고, RTO를 단계별로 실측한다 |
| 3. Terraform 자동화 | 같은 `regional` 모듈을 리전별 루트(`seoul`, `tokyo`)에서 적용하고, 복원과 검증을 스크립트로 묶는다 |
| 4. 데이터 되돌리기 | 쓰기 중지 → 덤프 → 원래 리전에 복원 → 검증 → 전환. 시간 순 UUID, `updated_at`, 삭제 대신 상태 변경으로 장애 직전 변경분을 대조한다 |

## 교훈

기술 선택은 **요구사항, 비용, 운영할 사람**에서 출발해야 합니다. v2는 이 순서를 지키고, 결과를 숫자로 증명하는 것을 목표로 합니다.
