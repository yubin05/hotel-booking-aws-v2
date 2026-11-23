# v3 시나리오 A: 채용 공고 리서치와 최소 설계 (2026-11-23)

[인수인계](handoff-2026-11-23-v3-scenario-a.md) 2절(정밀 JD 리서치)과 4절(원 요청문)을 이어서 한 결과다. 1 ~ 2절은 사실과 판단, 3절은 **사용자 확인 전 설계 초안**이다(확정되면 ADR · 10-security로 옮긴다). 4절은 같은 날 추가로 조사한 클라우드 운영 관제 · 보안관제 공고 수다.

## 결론

- **보완해서 간다.** 탐지 · 관제 직무 공고가 반복해서 요구하는 "로그로 탐지 규칙을 만들고, 오탐을 줄이고, 사고 대응을 자동화"를 A가 그대로 보여 준다. 쿠팡 탐지 엔지니어 공고(M1)는 계정 탈취(ATO)와 대규모 거래 환경을 직접 언급한다.
- 빈틈은 두 가지다. ① 탐지가 앱 코드 안에만 있으면 "백엔드 기능"으로 읽힌다 → 탐지 결과를 CloudWatch 경보 → Slack 경로에 태우고 탐지 규칙을 문서로 남긴다(3절에 포함). ② 클라우드 보안 서비스 이름(CloudTrail · GuardDuty 등)은 A로 못 보여 준다 → 후속 후보로 남긴다(2절).
- 이상거래(FDS) 공고 7개 중 신입 가능은 0개다(최소 1년, 대부분 3 ~ 10년). A는 "FDS 포트폴리오"가 아니라 **"계정 탈취 탐지 · 자동 격리(보안관제 관점)"**로 내세운다.

## 1. 공고 리서치

**방법**: 2026-11-23 웹 검색으로 후보를 모으고 공고 원문을 읽었다(원티드 · 점핏 · 회사 채용 페이지 · 링커리어 · freehire 등). freehire · 비즈니스피플 · urjob은 원 공고를 옮겨 둔 모음 사이트다. 31개를 읽어 4개는 실패, **27개**를 집계했다.

**한계**
- 마감된 공고도 넣었다(27개 중 약 16개). 지금 지원할 목록이 아니라 **요건 경향 비교용**이다.
- 국내에 "클라우드 보안관제"를 직무명으로 단 공고가 적어, 그 갈래에 일반 관제 · SIEM 엔지니어 공고가 섞였다. 해외 MDR 공고는 1개만 넣었다.
- 키워드 개수는 페이지에 적힌 표현으로 셌다. 뜻이 같은 다른 표현(예: "탐지 패턴 튜닝" → 탐지 룰)은 판단해서 묶었으므로 **추론이 섞여 있다**.
- 신입 공고는 요건이 짧아 키워드가 적게 잡힌다.

### 클라우드 보안 (7)

| # | 회사 · 직무 | 경력 | 상태 | 요건 · 우대 핵심 | 링크 |
|---|---|---|---|---|---|
| C1 | 빗썸 · 클라우드 보안 담당자(신입 및 주니어) | 신입 ~ 5년 | 마감 | CSPM 탐지 항목 조치 매뉴얼, Remediation(자동 조치) 팩, CloudTrail · VPC Flow Logs 통합(Security Lake) · 모니터링, IAM 최소 권한, Python 자동화 | [원티드](https://www.wanted.co.kr/wd/334415) |
| C2 | 우아한형제들 · 클라우드 보안 엔지니어 | 5년 이상 | 마감 | SG · NACL · 방화벽 운영, CWPP, 아키텍처 보안성 검토, POC · BMT | [원티드](https://www.wanted.co.kr/wd/229160) |
| C3 | 구름 · 클라우드 보안 엔지니어 | 1 ~ 8년 | 마감 | 보안 로그 수집 · 분석, 이상 징후 실시간 모니터링, 침해 사고 대응, 버그바운티, Python | [원티드](https://www.wanted.co.kr/wd/300471) |
| C4 | 테이텀 · Cloud Cybersecurity Compliance Engineer | 신입(조건부) ~ 5년 | 마감(2024-07-31) | Compliance · Policy as Code, Security Hub 모범 사례, MITRE ATT&CK, 스크립트 검증 | [원티드](https://www.wanted.co.kr/wd/229315) |
| C5 | 한화비전 · Cloud Security Engineer | 5 ~ 12년 | 마감 | SOC2 감사, CNAPP(SIEM · CSPM) 운영, IAM · WAF | [원티드](https://www.wanted.co.kr/wd/266254) |
| C6 | 토스 · 보안 엔지니어(클라우드 보안) | 5년 이상 | 열림(11-20 게시) | IAM 권한 체계, 로깅 · 모니터링 자동화, GuardDuty · Control Tower · SCP, Python · Terraform 자동화 | [freehire](https://freehire.me/jobs/security-engineer-keulraudeu-boan-toss-qqcqku5v) |
| C7 | 야놀자 · 정보보안 매니저(클라우드 보안정책) | 2년 이상 | 마감 | 클라우드 보안 정책 · 인증(ISMS-P · PCI-DSS), 보안성 검토 | [원티드](https://www.wanted.co.kr/wd/88422) |

### 보안관제 (6)

| # | 회사 · 직무 | 경력 | 상태 | 요건 · 우대 핵심 | 링크 |
|---|---|---|---|---|---|
| S1 | 토스 · 보안 엔지니어(이벤트 분석 / 사고 대응) | 미표기 | 열림(11-20 게시) | SIEM 로그로 위협 시나리오 설계 · 운영, 침해사고 대응 프로세스 수립 · 자동화, 퍼블릭 클라우드 위협 대응, Detection Engineering, LLM 효율화 | [freehire](https://freehire.me/jobs/security-engineer-ibenteu-bunseog-sago-daeeung-toss-26fb2jvd) |
| S2 | 토스페이먼츠 · 보안 운영 엔지니어 | 3년 이상 | 열림(11-20 게시) | IAM · 보안 그룹 점검, CSPM, CloudTrail 로그 분석, SIEM 연동, Python · Bash 자동화 | [freehire](https://freehire.me/jobs/security-operation-engineer-endpoint-toss-e36j22ga) |
| S3 | SK쉴더스 · 보안관제 신입 및 경력 | 신입 가능 | 채용 시 마감 | 실시간 모니터링 탐지 · 분석, 관제 시스템 운영, 24 × 365 교대 | [채용 페이지](https://www.skshieldusapply.com/ko/o/107003) |
| S4 | 한국IBM · Security Specialist(SOC) 인턴 | 신입(인턴) | 2025 공고 | 침해사고 대응 절차 개념, 보안 이벤트 분석 기초, 클라우드 · AWS 구조 이해 | [링커리어](https://linkareer.com/activity/249724) |
| S5 | 여기어때 · Security Engineer | 5 ~ 10년 | 마감 | 관제 이벤트 · 침해사고 분석, AWS 보안 아키텍처, WAF · IPS 탐지 패턴 튜닝, SIEM 정책 | [원티드](https://www.wanted.co.kr/wd/223353) |
| S6 | 야놀자 · Security Analyst | 5 ~ 10년 | 마감(2025-03-08) | 상관분석 룰 · 시나리오 룰 개발, SIEM(Splunk · OpenSearch), 로그 수집 파이프라인, 우대 SOAR · 클라우드 침해 대응 | [점핏](https://jumpit.saramin.co.kr/position/50179047) |

### 클라우드 보안관제 · MDR (7)

| # | 회사 · 직무 | 경력 | 상태 | 요건 · 우대 핵심 | 링크 |
|---|---|---|---|---|---|
| M1 | 쿠팡 · Threat Detection Engineer | 5년 이상 | 열림(11-18 게시, **사내 공모 전용**) | 탐지 유즈케이스 정의 · SIEM 구현, 정탐/오탐 분석 · 튜닝, 룰 생성 ~ 폐기 문서화, 클라우드 · 인증 로그, ATT&CK, 계정 탈취(ATO) 언급, 우대 Detection-as-Code · 대규모 거래 환경 | [freehire](https://freehire.me/jobs/l5-threat-detection-engineer-detection-engineering-coupang-internal-3pwch3fd) |
| M2 | 티시스아이티 · 보안관제(EDR) | 5년 이상 | 11-25 마감 | EDR 탐지 정책 · 룰셋 튜닝, 위협 헌팅, 침해사고 분석 정리, Python 자동화, 우대 SIEM · 보고서 | [freehire](https://freehire.me/jobs/boangwanje-edr-tisiseuaiti-2tj73y7o) |
| M3 | 와탭랩스 · 정보보안 엔지니어 | 1년 이상 | 마감(11-10) | 인증 심사, 클라우드 취약점 점검, 보안 사고 대응, 점검 자동화(Terraform · Python), 우대 로그 분석 | [freehire](https://freehire.me/jobs/jeongboboan-enjinieo-wataebraebseu-oayrbmea) |
| M4 | 이너버스 · 통합보안관리 엔지니어(신입) | 신입 ~ 2년 | 11-26 마감 | SIEM 솔루션 기술 지원 · 구축, 우대 Python · Elasticsearch · Kafka | [freehire](https://freehire.me/jobs/tonghabboangwanri-enjinieo-sinib-ineobeoseu-fkuvob36) |
| M5 | 메가존클라우드 · 클라우드가드 보안 관제 및 운영 | 2년 이상(계약직) | 상시 | 방화벽 · IPS · DDoS · WAF 관제, SIEM 운용, 로그 확인 · 분석, 점검 자료 작성 | [urjob](https://www.urjob.kr/jobs/140f4027-4689-4d77-b93b-aaf1602c0f02) |
| M6 | 윈스테크넷 · 2025 하반기 신입(보안관제) | 신입 | 마감(2026-01-05) | 보안장비 이벤트 로그 분석 · 위협 대응, 교대근무 | [링커리어](https://linkareer.com/activity/287237) |
| M7 | Upwind Security(호주) · Security Engineer(MDR) | 미표기 | 열림 | 탐지 · 대응 튜닝, 심층 조사, 플레이북, Tier 1/2 에스컬레이션 처리, 클라우드(AWS 등), 온콜 | [freehire](https://freehire.me/jobs/security-engineer-upwind-security-ivcbujuj) |

### 이상거래 탐지 (7)

| # | 회사 · 직무 | 경력 | 상태 | 요건 · 우대 핵심 | 링크 |
|---|---|---|---|---|---|
| F1 | 카카오뱅크 · FDS 엔지니어 | 3년 이상 | 마감 | FDS 개발 · 운영, 실시간 ML 모형 서버, 실시간 데이터 파이프라인(Java · Kotlin · Spring) | [원티드](https://www.wanted.co.kr/wd/80529) |
| F2 | 카카오페이증권 · FDS 담당자(시니어) | 6년 이상 | 채용 시 마감 | Fraud 지표 · 룰 설계, 거래 · 행동 데이터 이상 징후 분석, 의심 거래 모니터링, 자동화, SQL · KPI | [채용 페이지](https://career.kakaopaysec.com/job_posting/2cjYjDZ4) |
| F3 | 토스씨엑스 · FDS Manager | 1년 이상 | 마감 | 탐지/차단 Rule 모니터링, 실시간 의심 거래 대응, 피해 확산 차단, Rule 개선 | [원티드](https://www.wanted.co.kr/wd/323921) |
| F4 | NHN PAYCO · FDS 운영/모니터링 | 3 ~ 6년 | 마감(2023-04-19) | 탐지 현황 분석 · 보고서, 룰 차단 내역 검토, 정책 적용 · 시험 | [원티드](https://www.wanted.co.kr/wd/137151) |
| F5 | 당근 · Trust & Safety Manager(부동산) | 3년 이상 | 열림(11-15 게시) | 신고 로그 분석, 어뷰징 패턴 정의 · 탐지 · 제재 룰, LLM · 에이전트 운영 도구, 우대 SQL | [freehire](https://freehire.me/jobs/trust-safety-manager-budongsan-danggeunmakes-vswasugu) |
| F6 | 쿠팡 · Principal, Trust&Safety(Fraud and Abuse Monitoring) | 10년 이상 | 2025-12 게시 | 리스크 정책 · 기준, 이상 징후 검토, 데이터 분석으로 우선순위, 운영 감사 | [비즈니스피플](https://www.bzpp.co.kr/biz/businessDetailView/BR251219A00259) |
| F7 | 카카오페이 · ML 엔지니어(이상거래탐지) | 석사 또는 4년 이상 | 2024-12 게시(상시) | ML/DL 모델, 사고 패턴 분석 · 모니터링 리포팅, Python · SQL, 조직이 실시간 고위험 거래 차단 | [비즈니스피플](https://www.bzpp.co.kr/biz/businessDetailView/BR241230A00089) |

**읽기 실패(집계 제외)**: 메가존 [Cloud Security Engineer](https://career.megazone.com/job_posting/SN1fzv4w) · [보안 침해사고 모니터링](https://career.megazone.com/job_posting/h7mPsWpF)(본문이 비어 옴), [velopers 1294](https://velopers.kr/jobs/1294)(404), 메가존 [클라우드 보안 엔지니어](https://m.career.co.kr/recruit/view/21923218)(본문이 이미지라 업무 · 요건 미확인).

## 2. 판단

### 질문 1. 공통으로 요구하는 것

보안 직무 20개(C · S · M)와 FDS 7개를 나눠 셌다.

| 항목 | 보안 20개 | 그중 탐지 · 대응 직무 7개(S1 · S2 · S5 · S6 · M1 · M2 · M7) | FDS 7개 |
|---|---|---|---|
| 클라우드 환경(AWS 등) | 15 | 6 | 0 |
| 로그 · 이벤트 분석 | 14 | 7 | 1(신고 로그) |
| 자동화(스크립트 · 자동 조치 · SOAR) | 11 | 6 | 2 |
| Python · 스크립트 | 10 | 4 | 1 |
| SIEM | 9 | 6 | 0 |
| 침해사고 대응(절차 · 분석) | 8 | 5 | 6(조사 · 대응) |
| 탐지 룰 · 시나리오 · 튜닝 | 6 | 6 | 5(룰 · 정책 설계) |
| 클라우드 보안 서비스 이름(CloudTrail · GuardDuty · Security Hub · CSPM · Control Tower · CNAPP) | 5 | 1 | 0 |
| IAM | 4 | 1 | 0 |
| 보고서 · 문서화 | 4 | 2 | 2 |
| IaC · as-Code(Terraform · Policy/Detection as Code) | 4 | 1 | 0 |
| MITRE ATT&CK | 2 | 1 | 0 |
| 이상거래 · 계정 탈취 언급 | 1(M1) | 1 | 7 |

- 신입 가능 공고는 6개(C1 · C4 · S3 · S4 · M4 · M6), 모두 보안 쪽이다. 1 ~ 3년까지 넣으면 12개.
- 신입 공고는 기초 지식(네트워크 · 클라우드 구조), 로그 분석 탐구심, 침해사고 대응 절차 개념, 교대근무를 본다. 경력 공고는 탐지 룰 개발 · SIEM 운영 · 자동화 · Detection-as-Code를 **해 본 경험**을 본다.
- (추론) 신입 포트폴리오의 차별점은 경력 공고의 "경험" 항목을 작게라도 해 본 증거다. 탐지 · 대응 직무 7개 기준으로는 로그 분석 · 탐지 룰 · SIEM · 자동화 · 사고 대응이 거의 빠짐없이 나온다.

### 질문 2. A가 보여 주는 것과 못 보여 주는 것

| A가 보여 주는 것 | 맞닿은 공고 표현 |
|---|---|
| 로그인 기록과 사용 기록을 세션으로 이어 판단하는 탐지 규칙 | S6 "상관분석 룰 및 시나리오 룰 개발", M1 "탐지 유즈케이스(시나리오)를 정의" |
| 정상 대조 사례로 임계값을 조정한 결과 | M1 "정탐/오탐 분석, 튜닝", M2 "오탐 분석 및 정책 튜닝" |
| 의심 세션의 추가 사용 자동 보류 | F3 "피해 확산을 차단", F7 조직의 "실시간으로 고위험 거래를 탐지하고 차단", S1 대응 자동화 |
| 탐지 → 보류 → 운영자 확인 → 복구 절차와 시각 기록 | S1 "침해사고 대응 프로세스를 수립", M7 "developing playbooks" |
| 계정 탈취(ATO) · 대규모 거래 환경 | M1 ATO 언급, 우대 "대규모 트랜잭션 환경" |

| 못 보여 주는 것 | 채우는 곳 |
|---|---|
| 클라우드 로그 소스(CloudTrail · VPC Flow Logs · GuardDuty), 클라우드 보안 서비스 이름(5/20) | 후속 후보: 같은 화면에 CloudTrail · GuardDuty 탐지를 붙이거나, 클라우드 계층 시나리오(예: 유출된 액세스 키) 하나 추가 |
| IAM · IaC(4/20) | v2에서 이미 Terraform · 역할 분리를 했고, v3 권한 재설계([03 v3 표](03-plan.md#v3-후속-계획-보안-운영-v2-범위-제외-옛-35단계6단계))가 이어서 채운다 |
| SIEM 화면 | 이번에는 CloudWatch Logs Insights · 경보 · Slack으로 대신한다(별도 SIEM 도입은 범위 밖) |

겹치는 정도(추론): 탐지가 예약 코드 안에서만 돌면 앱 계층 FDS 기능으로 보여 관제 · 클라우드 보안 공고와 거의 안 겹친다. 탐지 결과를 보안 로그 → CloudWatch 지표 필터 → 경보 → Slack으로 흘리고 규칙 문서(조건 · 임계값 근거 · 정탐/오탐 결과 · ATT&CK)를 남기면, 탐지 · 대응 직무 7개의 공통 항목(로그 · 탐지 룰 · 자동화 · 사고 대응)과 겹친다.

### 질문 3. 결론

**보완해서 간다.** 보완은 둘로 나눈다.

- **A 안에 넣는 것(추가 비용 작음, 3절에 반영)**: ① 탐지 결과를 보안 로그로 남기고 CloudWatch 경보 → 기존 Slack 경로로 알림 ② 탐지 규칙 문서(조건 · 임계값 가설과 조정 기록 · 정상/이상 결과표 · [ATT&CK T1078 Valid Accounts](https://attack.mitre.org/techniques/T1078/) 대응 · 런북) ③ 포트폴리오 표현을 "FDS"가 아니라 "계정 탈취 탐지 · 자동 격리"로
- **후속 후보(사용자 결정)**: CloudTrail · GuardDuty 탐지와 한 화면, 클라우드 계층 시나리오 하나

다른 시나리오로 바꿀 근거는 찾지 못했다. B(호스트 대량 열람)는 내부자 · 데이터 유출 쪽이라 S1 "데이터 유출"과 겹치지만, 탐지 · 자동 대응을 보여 주는 힘은 A와 같은 종류다(추론).

## 3. A 최소 설계 (초안, 사용자 확인 전)

코드 기준: 앱 `0ca94fc`(11-23 다시 확인, 그 뒤 커밋 없음), 인프라 `main`.

### 3-1. 첫 거래가 끝나는 시점과 후속 거래를 막을 수 있는 시점

포인트를 쓰는 예약 요청(`POST /api/bookings`) 한 번의 순서:

| 순서 | 코드 | 일 |
|---|---|---|
| ① | [booking/index.ts:145](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L145) | 토큰 검사 → `req.user.sessionId`(토큰 jti) |
| ② | [:162](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L162) | 트랜잭션 시작, `lockPointsOwner`로 회원 행 잠금. **같은 회원의 포인트 사용은 여기서 한 줄로 선다** |
| ③ | [:173 ~ 189](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L173-L189) | 예약 행 · 날짜 잠금 · 쿠폰 |
| ④ | [:191](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L191) → [points/index.ts:39 ~ 43](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/points/index.ts#L39-L43) | 잔액 확인 + 원장 `use` 줄 |
| ⑤ | [:203](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L203) | **커밋 = 첫 거래 완료.** 이 뒤로는 관리자 복구로만 되돌린다 |
| ⑥ | [:207](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L207) | `booking_created` 로그 |

- `booking_created`를 보고 판단하는 방식(로그 기반)은 ⑤ 뒤라 첫 거래를 못 막고, 후속 거래도 "로그 전송 + 지표 계산 + 경보 평가 + 조치"만큼 늦게 막는다(분 단위 예상, **가설**).
- **후속 거래를 막을 수 있는 가장 이른 시점은 ⑤와 같은 커밋이다.** 탐지 판정과 보류 기록을 ④ 바로 뒤, 같은 트랜잭션에 넣는다. 같은 회원의 다음 포인트 사용은 ②에서 기다렸다가 커밋된 보류를 본다 → "그사이 통과 0건"이 설계 목표다(완료 기준 5에서 실측).
- 첫 거래 자체를 막지 않는 이유: 원 요청의 자동 대응 범위가 "추가 사용 보류"까지이고, 첫 거래부터 막으면 여행 중인 정상 회원의 결제가 실패한다. 실무에서 첫 거래를 막으려면 추가 인증(step-up)을 붙인다(범위 밖).

### 3-2. 데이터: `sessions` 테이블 하나

지금 로그인 IP · 브라우저는 로그에만 있어 예약 트랜잭션 안에서 읽을 수 없고, 보류 상태를 둘 곳도 없다.

| 열 | 뜻 |
|---|---|
| `id` | 세션 번호(토큰 jti) |
| `user_id`, `ip`, `ua`, `created_at` | 로그인한 회원 · 접속 환경 · 시각 |
| `held_at`, `hold_reason` | 보류 시각 · 이유(없으면 NULL) |
| 색인 `(user_id, created_at)` | 같은 회원의 최근 세션 조회 |

- 쓰는 곳: 토큰을 발급하는 두 곳, 로그인 [auth/index.ts:145](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/auth/index.ts#L145)과 가입 [:92](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/auth/index.ts#L92)
- 보관: **3개월(90일) 뒤 삭제(추천, 사용자 확인 전)**. 국내 서비스는 개인정보처리방침에 "통신비밀보호법: 로그인 기록 3개월"을 흔히 적는다(예: [코난테크놀로지](https://konantech.com/support/privacy_v2) 제4조). 시행령 제41조 제2항은 인터넷 로그기록 · 접속지 추적자료를 3개월 **이상** 보관하게 한다([위키문헌 2008년 조문](https://ko.wikisource.org/wiki/%ED%86%B5%EC%8B%A0%EB%B9%84%EB%B0%80%EB%B3%B4%ED%98%B8%EB%B2%95_%EC%8B%9C%ED%96%89%EB%A0%B9), 2026년 현행본 본문은 확인 못 함). 탐지에는 최근 30일만 쓴다. 참고로 지금 앱 로그 그룹 보관은 7일이다([ecs.tf](../infra/modules/regional/ecs.tf))
- 배포 전에 발급된 토큰은 행이 없어 탐지 대상이 아니다. 토큰 수명이 1시간이라 배포 1시간 뒤면 사라진다

### 3-3. 탐지 조건 (임계값은 모두 가설)

포인트를 쓰는 예약 트랜잭션 안, `usePoints` 바로 뒤에서 판정한다.

| 신호 | 조건(가설) | 왜 |
|---|---|---|
| 새 환경 | 이 세션의 IP **와** 브라우저(UA)가 둘 다 같은 회원의 최근 30일 다른 세션에 없음 | IP만 새로우면 같은 휴대폰으로 여행 중인 회원이 걸린다 |
| 로그인 직후 | 세션 생성 ~ 이번 사용 ≤ 10분 | 탈취한 계정은 들키기 전에 바로 쓴다는 가정 |
| 큰 금액 | 이번 사용액 ≥ 사용 전 잔액의 50% | 잔액을 털어 쓰는지 본다 |

- 판정: 셋 다 참이면 그 세션을 보류한다(`held_at` = 지금, 같은 트랜잭션).
- **재로그인 구멍(권장 추가)**: 공격자가 다시 로그인하면 새 세션이라 "첫 거래"를 또 할 수 있다. 그래서 보류 검사 때 "같은 회원의 다른 세션이 24시간 안에 보류됐고, 이 세션도 새 환경"이면 보류로 본다. 평소 환경 세션은 새 환경이 아니라 영향이 없다. 원 요청 범위를 조금 넘으므로 뺄 수 있다. 넣으면 새 기기를 쓰는 정상 회원이 오탐되었을 때 24시간 동안 새 기기에서 포인트를 못 쓴다.

### 3-4. 보류 검사 위치

- **`usePoints()` 맨 앞, 잔액 확인 바로 전**([points/index.ts:39](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/points/index.ts#L39)). 포인트를 깎는 길은 이 함수 하나다(예약 생성 [booking:191](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L191), 예약 변경 [booking:299](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L299)).
- 보류 여부는 잠금 읽기(`FOR SHARE`)로 읽는다. `balanceOf`와 같은 이유다(일반 SELECT는 기다리기 전 스냅샷을 볼 수 있음, [points/index.ts:20 ~ 21](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/points/index.ts#L20-L21) 주석).
- 걸리면 403과 `points_hold_blocked` 보안 로그. 예외가 트랜잭션을 되돌려 예약 행 · 날짜 잠금 · 쿠폰 사용까지 롤백되므로 **"새 예약 · 원장 차감 없음"(완료 기준 3)은 추가 코드 없이 충족**된다.
- 포인트를 안 쓰는 예약은 막지 않는다(요청 범위). 이 예약은 원장에 세션이 안 남는 기존 한계([admin/index.ts:37](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/admin/index.ts#L37))대로 로그에서 찾는다.
- 토큰(JWT)은 폐기하지 않는다. 보류는 DB를 보고 판단하므로 토큰이 살아 있어도 효과가 있다. 오탐 피해는 그 세션의 포인트 사용뿐이고 결제 예약은 된다.

### 3-5. 경보 (보완 ①)

- 커밋 뒤 `booking_created` 옆([booking:205 ~ 212](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/booking/index.ts#L205-L212))에서 `points_hold_applied` 보안 로그를 남긴다. 필드: `booking_id` · `points_used` · `balance_before` · `minutes_since_login` · `new_ip` · `new_ua`.
- 인프라: 앱 로그 그룹 `/ecs/${name}`([ecs.tf:42](../infra/modules/regional/ecs.tf))에 지표 필터 `{ $.event = "points_hold_applied" }` → 경보(60초 합계 ≥ 1) → 기존 SNS 주제 `${name}-alerts`([alarms.tf:24](../infra/modules/regional/alarms.tf)와 같은 경로) → Slack. `modules/regional/alarms.tf`에 리소스 2개를 더한다. JSON 필드 선택자(`$.`)는 [필터 패턴 문서](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html)에 있고, 배포 전 [TestMetricFilter](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_TestMetricFilter.html)로 패턴을 시험할 수 있다.
- 경보는 사람에게 알리는 용도다. 자동 대응(보류)은 경보를 기다리지 않으므로 **보류 시각 ≤ 경보 시각**이 정상 결과다.
- 버린 대안: 경보 → Lambda → 보류 API(SOAR 방식). Lambda와 관리자 권한이 더 필요하고, 그 지연(분 단위 가설) 동안 후속 거래가 통과한다.

### 3-6. 운영자 확인 · 복구 (기존 코드 그대로)

- 어느 세션이 어느 예약에 얼마를 썼는지: `GET /api/admin/users?email=`([admin:18](https://github.com/yubin05/hotel-booking-app/blob/0ca94fc/src/admin/index.ts#L18))이 원장 줄마다 세션 번호 · 예약 · 금액을 준다. 로그 타임라인은 Logs Insights `filter session_id = "<세션>" | fields @timestamp, event, ip, ua, booking_id, points_used | sort @timestamp`.
- 복구: `POST /api/admin/recover`. 되돌림 줄의 `reverses_id`가 유니크이고 되돌릴 줄이 없으면 404라, 다시 시도해도 잔액이 늘지 않는다(완료 기준 4는 기존 코드로 충족, 시험으로 확인만 한다).

### 3-7. 검증 (정상 · 이상)

자동 시험은 `sessions` 행을 직접 넣어 접속 환경을 만들고, 실제 시연은 평소 PC와 다른 네트워크(휴대폰 테더링 · 다른 사람 PC) 브라우저로 한다.

| # | 경우 | 환경 | 로그인 → 사용 | 사용액 / 잔액 | 기대 | 완료 기준 |
|---|---|---|---|---|---|---|
| N1 | 여행 중인 회원 | 평소 폰(UA 같음), 새 IP | 5분 | 80% | 통과 | 1 |
| N2 | 폰을 바꾼 회원 | 새 IP · 새 UA | 2시간 | 60% | 통과 | 1 |
| N3 | 새 환경에서 소액 | 새 IP · 새 UA | 3분 | 10% | 통과 | 1 |
| A1 | 시험 세션 첫 사용 | 새 IP · 새 UA | 3분 | 60% | 통과 + 보류 + 경보 | 2 |
| A2 | 같은 세션 두 번째 사용 | 같음 | - | - | 403, 예약 수 · 원장 줄 수 변화 0 | 3 |
| N4 | 같은 회원의 평소 세션 | 평소 환경 | - | - | A1 뒤에도 통과 | 3 |
| A3 | 첫 사용을 동시에 2건 | 새 IP · 새 UA | 3분 | 각 40% | 1건만 통과(기대) | 5 |
| A4 | 공격자 재로그인 | 같은 새 환경, 새 세션 | 1분 | 30% | 403(재로그인 규칙을 넣을 때) | 3 |
| R1 | 운영자 복구 | - | - | - | 첫 거래 포인트 한 번 환원, 확정 예약 취소 | 4 |
| R2 | 복구 재시도 | - | - | - | 404, 잔액 그대로 | 4 |

- 정상 사례(N1 ~ N4)가 걸리면 임계값을 고치고 다시 돌려 전 · 후를 기록한다.
- 시각 기록(완료 기준 5): 첫 거래 = 원장 `use` 줄 `created_at`, 보류 = `sessions.held_at`, 경보 = `aws cloudwatch describe-alarm-history`의 상태 변경 시각과 Slack 도착 시각, 그사이 통과 = 첫 거래 ~ 보류 사이 같은 세션의 `use` 줄 수와 합계.

### 3-8. 바꿀 곳 (확정 뒤 구현)

| 저장소 | 파일 | 바꿀 것 |
|---|---|---|
| 앱 | `db/schema.sql` | `sessions` 테이블 |
| 앱 | `src/auth/index.ts` | 로그인 · 가입 때 세션 행 쓰기 |
| 앱 | `src/points/index.ts` | 보류 검사(맨 앞), 판정 · 보류 기록 함수 |
| 앱 | `src/booking/index.ts` | `usePoints` 뒤 판정 호출, 커밋 뒤 `points_hold_applied` 로그 |
| 앱 | `src/admin/index.ts` | 보류 해제 API(3-9 더할 것 ①) |
| 앱 | DB 시험(`db/test-db.sh` 계열) | 3-7 표의 자동 시험 |
| 인프라 | `infra/modules/regional/alarms.tf` | 지표 필터 + 경보 |
| 인프라 | `docs/10-security.md`, `infra/README.md` | 탐지 규칙 문서, 운영자 런북 |

### 3-9. 수업 자료(SKT-ALEPH 4과목 이상탐지 · 5과목 SOAR)와 맞춘 점

수업 저장소(`security-agent-toolkit`, 비공개)의 실습 제목과 A를 대조했다. 수업은 로컬 로그 파일과 Python으로 진행하며 CloudTrail · GuardDuty · CloudWatch는 다루지 않는다.

| 수업 실습 | A에서 해당하는 것 |
|---|---|
| 4과목 ③ 지난 7일로 평소 기준 · 알림 기준 정하기 | 새 환경 = 최근 30일 평소 접속 환경과 비교, 임계값은 정상 대조로 조정 |
| 4과목 ④ 서로 다른 로그를 한 사용자로 연결해 60분 안의 사건 찾기 | 로그인과 포인트 사용을 세션으로 연결, 로그인 후 10분 |
| 4과목 ④ 위험 점수 · 등급 · 이유 저장 | `hold_reason`에 걸린 신호(새 환경 · 로그인 직후 · 큰 금액)를 남긴다 |
| 5과목 ④ 봉쇄(계정 잠금 · IP 차단 · 세션 종료), 허용 목록 · 공유 IP 제외, 차단 유효 기간(TTL) | 계정 전체가 아니라 의심 세션만 보류, IP 하나로는 막지 않음, 보류 유효 기간 = 토큰 만료(재로그인 규칙은 24시간) |
| 5과목 ④ 실행 · 사후 검증 · 감사 기록 세 단계 | 보류 기록 + `points_hold_applied` 로그(감사 기록) + A2 시험(사후 검증) |
| 5과목 ⑧ 승인 게이트(자동 / 승인 필요 / 차단 금지) | 보류는 자동, 포인트 복구 · 예약 취소는 운영자 승인(기존 관리자 API) |
| 5과목 ⑧ 오탐 롤백 · 복구 확인 · 규칙 조정 제안 | **빠져 있음** → 더할 것 ① |
| 5과목 ⑦ MTTA(평균 확인 시간) · MTTR(평균 해결 시간), ⑧ 초동 대응 리포트 | 완료 기준 5의 시각 기록이 재료 → 더할 것 ② |

더할 것(작음, 사용자 확인 전):
1. **오탐 처리**: 운영자가 보류를 푸는 관리자 API(`POST /api/admin/release-hold`)와 절차(영향 확인 → 보류 해제 → 복구 확인 → 임계값 조정 제안). 지금 설계는 토큰 만료로만 풀린다.
2. **초동 대응 리포트**: 사건 현황, 시각표(첫 거래 · 보류 · 경보 · 운영자 확인 · 복구), 경보 ~ 확인(MTTA) · 경보 ~ 복구(MTTR), 처리 경위, 오탐 여부, 규칙 조정 제안. 캡스톤의 AI 사건 보고서(수업 4과목 Day 6: 사실만 LLM에 보내 요약)와 같은 재료를 쓴다.

## 4. 추가 조사: 클라우드 운영 관제 · 보안관제 공고 수 (11-23)

사용자 질문: "클라우드 운영 관제 · 보안관제 공고가 많으면 그쪽으로도 가고 싶다." **결정(11-23)**: 교대근무 가능. 클라우드 관제로 들어가 경력을 쌓고 클라우드 엔지니어로 전환하는 경로로 간다.

**방법**: 사람인 · 잡코리아의 키워드 검색 결과 수(2026-11-23). 잡코리아는 1쪽 일반 공고 20개(광고 제외)를 직무 · 경력별로 나눴다. career-ops는 이력서(`cv.md`)가 없어 정식 실행을 못 했고, 공고 자동 수집(`scan.mjs`)은 해외 채용 시스템(Greenhouse · Ashby · Lever)과 회사별 파서만 읽어 국내 사이트는 웹 검색으로 대신했다.

| 키워드 | 사람인 전체 | 사람인 신입 필터* | 잡코리아 전체 | 잡코리아 표본 20개 중 IT 관제 · 운영 직무 | 그중 신입 · 경력무관 |
|---|---|---|---|---|---|
| 보안관제 | 4,254 | 1,732 | 1,340 | 12(IT 아님 7: 경비 · 주차 · 시설 · 상담 등) | 5 |
| 클라우드 관제 | 322 | 86 | 240 | 13 | 4 |
| 클라우드 운영 | 2,372 | 594 | 1,968 | 13 | 1 |
| 클라우드 보안 | 1,307 | 338 | - | - | - |
| 클라우드 엔지니어 | 1,193 | 339 | - | - | - |

\* `exp_cd=1`을 붙이면 수가 줄었지만, 화면에 "신입" 선택 표시가 없어 신입만인지 경력무관이 섞였는지는 확인 못 함.

- 검색 결과 수는 본문 전체에서 찾으므로 부풀려진다. 보안관제 표본 20개 중 7개는 IT 직무가 아니다.
- 신입이 들어갈 수 있는 비율(표본 기준 추론): 관제 키워드(보안관제 · 클라우드 관제) IT 공고 25개 중 9개, 클라우드 운영 IT 공고 13개 중 1개(나머지는 1 ~ 6년 경력 요구). **신입 문은 관제 쪽이 넓다.**
- 대가: 신입 관제 공고는 24시간 교대 · 야간 · 지방 근무가 많다. 예: SK쉴더스 "24 X 365교대 근무"(1절 S3), 윈스테크넷 "주/야간 교대근무 가능하신 분"(M6), 링네트 "IDC 야간 OP", 메가존 [247 서비스(부산)](https://career.megazone.com/job_posting/K4YDqPpT) 신입(자원 · 보안 이벤트 모니터링, 알람 관리, 장애 대응, 기술 문서 작성. 검색 요약 기준), 이글루 보안관제 춘천 · 부산. 주간 관제(NHN Cloud 보안관제 주간)는 경력 5년 이상이다. 목록 제목에는 교대 표시가 거의 없어 상세 공고에서 확인해야 한다.
- (추론) 클라우드 운영 엔지니어 공고 다수가 1 ~ 5년 경력을 요구하므로, 관제(OP) 경력이 그 경력을 채우는 길이 될 수 있다.
- 포트폴리오 확장: 운영 관제 증거(Grafana 관제 대시보드 · CloudWatch 경보 → Slack · 장애 · DR 실측 · 런북)는 이미 있다. 빠진 것은 "경보 → 판단 → 조치 → 보고"를 한 흐름으로 보여 주는 장면, 보고서 1장, 보안 이벤트(시나리오 A)다. 보여주기 장면은 [handoff-2026-11-23-portfolio-monitoring](handoff-2026-11-23-portfolio-monitoring.md)로 ChatGPT(Codex)에 넘긴다.

출처: [사람인 보안관제 검색](https://www.saramin.co.kr/zf_user/search/recruit?searchType=search&searchword=%EB%B3%B4%EC%95%88%EA%B4%80%EC%A0%9C), [잡코리아 보안관제](https://www.jobkorea.co.kr/Search/?stext=%EB%B3%B4%EC%95%88%EA%B4%80%EC%A0%9C&tabType=recruit) · [클라우드 관제](https://www.jobkorea.co.kr/Search/?stext=%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C+%EA%B4%80%EC%A0%9C&tabType=recruit) · [클라우드 운영](https://www.jobkorea.co.kr/Search/?stext=%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C+%EC%9A%B4%EC%98%81&tabType=recruit) 검색(나머지 키워드는 같은 주소에 검색어만 바꿈)
