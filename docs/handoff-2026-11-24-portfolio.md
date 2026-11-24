# 인수인계 2026-11-24 (Claude → Codex): v2 아키텍처 그림 고치기 · 도쿄 DR 구성 변경

[강사 피드백 안내문](handoff-2026-11-23-portfolio-feedback.md) 다음 편입니다. 작업 규칙은 [첫 안내문](handoff-2026-11-22-portfolio.md) 0절과 같습니다. 새 장 · 새 장면은 더하지 않고 **그림과 문구를 사실에 맞게 고치는 것만** 합니다.

## 1. 바뀐 결정 (11-24, [ADR-073](04-decisions.md#adr-073))

- 장애로 도쿄에 넘어가면 ① 복구(RTO 안): 승격 + **NAT 2**(AZ마다) · ALB 1 · ECS 2 ~ 4 · VPC Origin · **장애 경보** → ② 보강(RTO 밖): 손님을 받은 뒤 **도쿄 DB Multi-AZ**
- 평시 도쿄는 그대로: 서울 DB의 읽기 복제본(Single-AZ) + 그 DB의 네트워크(VPC · DB 서브넷 · 보안 그룹 · 설정표)
- 5단계 드릴은 이 조건으로 **3회를 처음부터 다시** 잽니다. 그때까지 RTO 12분 28초 등 11-22 숫자는 "NAT 1 · 보강 없음 조건"으로 그대로 두고, 새 숫자가 나오면 다음 안내문으로 알립니다
- 3단계 성능(3,000명까지 버팀)은 Single-AZ 조건이었습니다. Multi-AZ 1회 비교 뒤 기준 안이면 그대로 씁니다([기준](experiments/migration.md#multi-az-조건-비교-1회-2026-11-24-계획)). 결과 전까지 숫자는 바꾸지 않습니다

## 2. "서비스 요청과 리전 복구" 그림 고칠 곳

근거는 이 저장소 `infra/` 코드와 [02 8절](02-architecture.md#8-리전-장애-복구-흐름-pilot-light). 경로는 `infra/` 기준입니다.

**틀린 곳**
1. 앱 CloudFront → IGW → VPC Origin 화살표: VPC Origin 트래픽은 IGW를 지나지 않습니다(*"The internet gateway is not used for routing traffic to origins inside the subnet"*, [CloudFront VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)). 앱 CloudFront → VPC Origin으로 바로 잇고, IGW는 VPC 경계에 두어 NAT Gateway의 바깥 출구로만 연결(ECS → NAT → IGW → 외부 API · ECR)
2. 앱 CloudFront 라벨 "/api/* 캐시 됨" → "/api/* 캐시 안 함 · 화면은 원본 Cache-Control" (`global/cloudfront.tf:78-84` Managed-CachingDisabled)
3. 도쿄 RDS "시점 복제(PTR)" → "읽기 복제본 → 장애 시 승격"(ADR-066). 서울 Primary → 도쿄 RDS 화살표 "리전 간 읽기 복제" 추가
4. 도쿄 VPC 전체에 붙은 "장애·드릴 시 생성" → 둘로 나눔
   - 평시에 켜져 있음(실선): VPC · Private DB 서브넷 · RDS 읽기 복제본 (`drill/region.sh` standby, 7개)
   - 장애 선언 뒤 생성(점선): IGW · Public/Private App 서브넷 · NAT 2 · ALB · ECS · VPC Origin · 경보
   - 각주: "포트폴리오는 대기 상태도 DR 드릴 날만 만들고 끝나면 도쿄 전체 destroy"
5. 도쿄 NAT Gateway: 지금 그림의 "아이콘 2개가 박스 하나에 묶인" 모양 → AZ마다 Public 서브넷에 NAT 1개씩, 각 AZ의 Private App이 자기 AZ NAT로 (`tokyo/main.tf` `nat_count = 2`)
6. 도쿄 RDS 라벨: "Single-AZ로 승격 → 손님을 받은 뒤 Multi-AZ(보강)"
7. Amazon ECR이 서울 VPC 안에 그려짐 → VPC 밖(리전 서비스)으로. "서울 ECR → 도쿄 ECR 이미지 복제" 화살표 (`bootstrap/ecr.tf:56`)
8. 사진 영역 부제 "전용 태그" → "전용 배포"

**빠진 곳**
9. WAF 웹 ACL이 사진 CloudFront에도 붙어 있음(`global/photos.tf:31`) → "웹 ACL 부착" 선을 사진 CloudFront에도
10. 사진 CloudFront → 도쿄 S3 원본 페일오버 점선 "원본 장애 시(403 · 404 · 5xx)". 가까운 쪽을 고르는 게 아니라 항상 서울 먼저 (`global/photos.tf:42-54`)
11. 도쿄 VPC Origin(장애 때 생성): 보라색 "CloudFront 원본 수동 전환" 점선이 도쿄 VPC Origin → 도쿄 ALB로
12. 도쿄 ECS → 도쿄 RDS 화살표
13. 장애 경보: 서울 · 도쿄 각각 CloudWatch 경보 → SNS → Slack (작은 아이콘 한 줄이면 충분, ADR-071 · ADR-073)

**다듬기**
14. Route 53 화살표가 데이터 경로처럼 보임 → "사용자 → Route 53"은 점선 "DNS 조회", 실제 요청은 사용자 → 앱 CloudFront · 사진 CloudFront 실선
15. AZ 이름(2a/2c, 1a/1c)은 코드와 맞는지 확인되지 않음. 코드는 AZ ID: 서울 `apne2-az1` · `apne2-az3`, 도쿄 `apne1-az1` · `apne1-az2`. AZ ID로 표기하거나 사용자가 확인한 이름으로
16. 서울 NAT 2 · RDS Standby 각주: "설계 기준. 포트폴리오 평시 NAT 1 · Single-AZ, AZ 장애 테스트 · 리전 드릴 날만 NAT 2 · Multi-AZ (ADR-034 · ADR-042)"

**맞으니 그대로**: 서브넷 대역(10.x.0/1 · 10/11 · 20/21), ALB 1개가 두 AZ에 걸침, ECS 2 ~ 4개 · 0.5 vCPU / 1 GB · CPU 60% 목표 추적 · 예약 스케일링, WAF 관리형 4 · 요청 수 한도 3, OAC, active_region 수동 전환 · DNS 유지

## 3. 문구 동기화

- v2 대문 [README.md](../README.md) "리전 장애" 줄에 한 문장 추가함: "넘어간 뒤 도쿄도 서울 설계처럼 AZ마다 NAT · 장애 경보, 손님을 받은 뒤 DB Multi-AZ(ADR-073)". 포트폴리오 대문의 같은 줄도 같은 글로
- 숫자(RTO · 3,000명)는 바꾸지 않습니다(1절)
