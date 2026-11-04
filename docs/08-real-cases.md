# 08. 실제 사례 조사

시나리오와 설계 결정(ADR)을 뒷받침하는 실제 사례입니다. 조사일은 2026-11-04입니다.
업체 홍보 자료가 많아서 **"누가 무엇을 옮겼다"는 사실**과 **"얼마나 좋아졌다"는 효과**를 나눠서 씁니다.

## 신뢰도 기준

| 등급 | 뜻 | 포트폴리오에 쓰는 법 |
|---|---|---|
| 높음 | 독립 언론 인터뷰, 공식 기술 문서 | 근거로 인용 |
| 보통 | 업체 자료 중 사실 관계 (이전했다, 이 서비스를 쓴다) | "~했다고 밝혔다"로 인용 |
| 낮음 | 업체 홍보 수치, 익명 후기 | 인용하지 않고 참고만 |

## 1. 시나리오 근거

### 1-1. 소규모 조직의 IDC → AWS (인디스쿨)

교사 커뮤니티 인디스쿨의 AWS 고객 사례입니다. 이 프로젝트의 시나리오(IDC를 쓰는 작은 조직, 트래픽 변동이 큼)와 가장 가깝습니다.

> **원문 상태**: [사례 페이지](https://aws.amazon.com/ko/solutions/case-studies/indischool)가 2026-11-04 현재 고객 사례 목록으로 넘어갑니다.
> 아래 내용은 검색 결과 요약으로만 확인했습니다. 인용하기 전에 [인터넷 아카이브](https://web.archive.org/web/*/aws.amazon.com/ko/solutions/case-studies/indischool*)에서 원문을 확인해야 합니다.

| 항목 | 내용 | 신뢰도 |
|---|---|---|
| 이전 환경 | 약 10년간 국내 IDC의 월 정액 호스팅 서비스 (업체 서버를 빌리는 서버 호스팅으로 보임) | 보통 |
| 이전 이유 | 노후 서버로 인한 장애와 속도 저하. 회원 14만 명으로 늘며 급증한 트래픽 대응의 한계. 방학 때 트래픽이 거의 없는데도 비용이 같음 | 보통 |
| 검토 과정 | 국내 클라우드도 검토했지만 시장 지속성과 점유율을 보고 AWS 선택. 약 한 달간 기존과 비슷한 환경을 AWS에 만들어 시험하고, 월평균 비용이 IDC보다 높지 않음을 확인한 뒤 이전 | 보통 |
| 결과 | 전체 시스템 이전. 오토스케일링으로 방학 때 비용 절감, CodeDeploy로 적은 인원이 운영 | 낮음 (홍보) |

**이 프로젝트와의 연결**
- "비슷한 환경을 먼저 만들어 비교한 뒤 이전"한 순서가 [1단계(이전 환경 재현과 기준선)](03-plan.md#1단계-이전-환경-재현과-부하-기준선)와 같습니다.
- 트래픽 변동(방학)과 고정 비용 문제는 이 프로젝트의 쿠폰 이벤트 급증과 같은 종류의 문제입니다.

### 1-2. 정해진 시각의 선착순 쿠폰

[01 시나리오](01-scenario.md)의 "선착순 쿠폰 이벤트"(오픈 시각에 극단적으로 몰림)가 숙박 예약 업계에서 실제로 운영되는 방식이라는 근거입니다.

| 사례 | 내용 | 출처 | 신뢰도 |
|---|---|---|---|
| 대한민국 숙박세일페스타 (문체부·한국관광공사) | 야놀자·여기어때·지마켓에서 숙박 할인쿠폰(5만 원 초과 예약 시 3만 원) 9만 장을 1인 1매 선착순으로 배포. 2024-02-07 오전 10시부터 | 스포츠경향 (2024-02-01) | 높음 |
| 같은 행사의 다른 회차 | 매일 오전 10시 선착순 발급, 몇 분 만에 소진된다는 안내 | 개인 블로그 | 낮음 (회차마다 다름) |

이 회사들이 오픈 순간의 트래픽을 내부에서 어떻게 처리하는지는 공개 자료를 찾지 못했습니다.

## 2. 같은 업종의 대규모 비교: Booking.com

| 항목 | 내용 | 출처 | 신뢰도 |
|---|---|---|---|
| 방향 | 자체 데이터센터에서 퍼블릭 클라우드(AWS)로 이전 중 | CTO 인터뷰 (The Stack, 2022) | 높음 |
| 방식 | 서버를 그대로 옮기는 방식(lift-and-shift)은 하지 않음. 큰 단일 앱에서 주문·인증 같은 공통 기능부터 떼어 냄 | 같은 인터뷰 | 높음 |
| 준비 | 이전 전 약 2년간 보안·비용 통제 같은 기반을 먼저 만듦. "현대화를 시작하면 생각보다 깊은 구덩이에 있다는 걸 알게 된다" | 같은 인터뷰 | 높음 |
| 데이터 | 150PB 이상의 데이터를 AWS에서 관리 | AWS 사례 | 보통 |
| 머신러닝 | 검색 순위 모델을 사내 서버에서 AWS로 옮겨 학습 작업 3배, 실패 절반, 학습 시간 1/5 | AWS 사례 | 낮음 (홍보) |
| 예약 백엔드 | 숙박 예약 백엔드를 쪼개서 옮기는 방법을 re:Invent 2025에서 발표 | AWS re:Post 소개 | 내용 미확인 |

**규모에 따라 이전 방식이 다릅니다** (면접에서 쓸 비교)

| | Booking.com | 이 프로젝트 (소규모 회사) |
|---|---|---|
| 방식 | 기능을 하나씩 떼어 몇 년에 걸쳐 이전 | 점검 시간을 두고 덤프로 한 번에 이전 |
| 이유 | 서비스를 멈출 수 없고 시스템이 매우 큼 | 시스템이 작아서 짧은 중단이 더 싸고 단순함 |

## 3. SaaS·PaaS 대안의 서울 리전 ([ADR-002](04-decisions.md#adr-002) 근거)

| 서비스 | 용도 | 서울 리전 | 출처 |
|---|---|---|---|
| Supabase | DB(Postgres)·인증 | 있음 (ap-northeast-2) | 공식 문서 |
| Vercel | 화면·서버리스 함수 | 있음 (icn1). 기본값은 미국 동부(iad1). 설정해도 일부 요청이 오사카로 갔다는 커뮤니티 보고 있음 | 공식 문서, 커뮤니티 |
| Render | 컨테이너 실행 | **없음** (미국 3곳, 프랑크푸르트, 싱가포르) | 공식 문서 |
| Railway | 컨테이너 실행 | **없음** (캘리포니아, 버지니아, 암스테르담, 싱가포르) | 공식 문서 |
| PlanetScale | MySQL 호환 DB | AWS 서울은 문서에 없음. GCP 서울(asia-northeast3)은 2023년 추가 | 공식 변경 기록 |
| TiDB Cloud | MySQL 호환 DB | 확인 못 함 | - |

**해석**
- Vercel + Supabase는 서울에서 돌릴 수 있습니다. 이 조합을 고르지 않은 이유는 리전이 아니라 **재개발**입니다. Postgres로 바꾸면 DB 계층과 테스트를 다시 짜야 합니다. 요청마다 함수가 따로 도는 구조라서, 연결을 모아 쓰고 행을 잠그는 지금의 트랜잭션 방식과도 맞지 않습니다.
- Render·Railway + MySQL 호환 DB는 앱을 거의 그대로 올릴 수 있지만 **앱을 서울에 둘 수 없습니다.** 앱이 싱가포르에 있고 DB가 서울에 있으면 쿼리마다 국가 간 왕복이 생깁니다. 둘 다 싱가포르에 두면 개인정보가 국외에 저장됩니다.

## 4. 반대 방향 사례: 클라우드에서 나간 경우 (37signals)

"클라우드가 항상 답인가?"라는 질문에 대비한 사례입니다.

- 연 약 $320만이던 클라우드 비용 가운데 컴퓨팅을 자체 서버(약 $70만)로 옮겨 연 약 $200만을 줄였고, 5년간 $1,000만 이상 절감을 예상한다고 밝혔습니다. (CTO 본인 발표, 신뢰도 보통)
- 규모가 크고 트래픽이 안정적이면 자체 서버가 쌀 수 있습니다. 이 프로젝트처럼 작고 트래픽 변동이 큰 회사는 반대 판단이 맞을 수 있습니다. 규모와 트래픽 모양에 따라 답이 바뀐다는 근거로 씁니다.

## 찾지 못한 것

- 국내 중소기업의 IDC → AWS 독립 후기 (업체 자료가 아닌 것)
- 국내 기업의 Vercel·Supabase·Render·Railway 운영 사례 (검색 도구가 velog·티스토리 같은 국내 블로그를 잘 찾지 못해 놓쳤을 수 있음)
- TiDB Cloud 서울 지원 여부, PlanetScale GCP 서울이 지금도 운영되는지
- 개인정보 국외 이전 규정의 세부 내용
- 숙박 플랫폼이 쿠폰 오픈 트래픽을 처리하는 내부 구조

## 출처

- [AWS 고객 사례: 인디스쿨](https://aws.amazon.com/ko/solutions/case-studies/indischool) (2026-11-04 현재 목록으로 넘어감)
- [스포츠경향: 설 연휴 숙박 할인쿠폰 선착순 배포 (2024-02-01)](https://sports.khan.co.kr/article/202402011206003)
- [숙박 세일 페스타 쿠폰 발급시간 (개인 블로그)](https://www.finanandinvest.kr/숙박-세일-페스타-쿠폰-발급시간/)
- [The Stack: Booking.com CTO Rob Francis 인터뷰](https://www.thestack.technology/the-big-interview-booking-com-cto-rob-francis/)
- [AWS: Booking.com 사례](https://aws.amazon.com/solutions/case-studies/innovators/booking/)
- [AWS: Booking.com EKS 사례](https://aws.amazon.com/solutions/case-studies/booking-eks-case-study/)
- [re:Invent 2025 서버리스 미션 크리티컬 앱 설계 (re:Post)](https://repost.aws/articles/ARo70NlhSuQTyDpsdnLW3LEQ/re-invent-2025-designing-mission-critical-applications-with-serverless-services)
- [Supabase 리전](https://supabase.com/docs/guides/platform/regions)
- [Vercel 리전](https://vercel.com/docs/regions)
- [Vercel 커뮤니티: icn1 설정 후 오사카 경유 보고](https://community.vercel.com/t/network-connectivity-issue-slow-or-unreachable-requests-to-vercel/5746.md)
- [Render 리전](https://render.com/docs/regions)
- [Railway 리전](https://docs.railway.com/deployments/regions)
- [PlanetScale GCP 서울 리전 추가](https://planetscale.com/changelog/gcp-asia-northeast3-region)
- [The Register: 37signals 절감 결과](https://www.theregister.com/2024/10/21/37signals_aws_savings)
- [DHH: 5년 1,000만 달러 절감 전망](https://world.hey.com/dhh/our-cloud-exit-savings-will-now-top-ten-million-over-five-years-c7d9b5bd)
