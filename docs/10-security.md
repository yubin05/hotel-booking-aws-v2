# 10. 보안 점검과 WAF

WAF 규칙을 "있는 것 다 켜기"로 고르지 않고, **우리 앱의 약점에서 출발해** 고르려고 점검했습니다(위협 모델링 1차, 2026-11-15). 기준은 [OWASP Top 10](https://owasp.org/Top10/)과 [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)입니다.

- 대상: 고객사 앱 [hotel-booking-app `7e498d5`](https://github.com/yubin05/hotel-booking-app/tree/7e498d5)의 API(라우트 전체, 인증, 예약, 쿠폰, 리뷰, 진입점)
- 보지 않은 것: 프론트 코드 전체, 의존성 취약점(npm audit). 전체 보안 감사가 아니라 API 중심 점검입니다.

## 결론

- **권한 · SQL 인젝션 · 쿠폰 중복 같은 핵심 위험은 코드로 막혀 있습니다.** 이건 WAF가 원래 못 막는 영역이라 코드에서 막는 게 맞습니다.
- **남은 약점은 대부분 "횟수 · 자동화" 문제**(로그인 반복, 가짜 가입, 긁어 가기)이고, WAF의 요청 수 제한이 잘 맞습니다.
- WAF 관리형 규칙은 코드가 놓칠 때를 대비한 **2차 방어(심층 방어)** 로 둡니다.

## 1. 공격 표면 (손님이 부를 수 있는 API)

| 인증 | API |
|---|---|
| 없음 | `POST /api/auth/register` · `login`, `GET /api/hotels`(검색 · 도시 · 추천 · 상세 · 객실), `GET /api/reviews`, `GET /api/coupons`, `GET /api/health` · `health/deep`, 화면 파일(나머지 GET은 모두 `index.html`) |
| JWT 필요 | `GET /api/auth/profile`, `/api/bookings` 전체(생성 · 목록 · 상세 · 변경 · 취소), `GET /api/coupons/mine`, `POST /api/coupons/:id/claim`, `POST /api/reviews` |

## 2. 위험별 점검

| # | 위험 | 지금 상태 | 어디서 막나 | WAF |
|---|---|---|---|---|
| 1 | SQL 인젝션 | ✅ 값은 `?` 자리로 따로 넘기고([hotel:51](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/hotel/index.ts#L51)), 정렬 기준은 정해 둔 목록에서만 고름([hotel:72](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/hotel/index.ts#L72)) | 코드 | 2차 방어(SQL 그룹) |
| 2 | 남의 예약 보기 · 바꾸기 (API 1위, BOLA) | ✅ 예약 API 전체에 인증([booking:120](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/booking/index.ts#L120)), 조회 · 변경 · 취소에 `user_id` 조건([booking:209](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/booking/index.ts#L209), [booking:93](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/booking/index.ts#L93)) | 코드 | ❌ 정상 요청과 모양이 같아 못 막음 |
| 3 | 쿠폰 두 번 쓰기 | ✅ "아직 안 쓴 것만" 조건부 갱신([coupon:24](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/coupon/index.ts#L24)) | 코드 | ❌ |
| 4 | **비밀번호 대입** | ⚠️ 로그인 시도 횟수 제한이 없음([auth:99](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/auth/index.ts#L99)) | WAF (+앱) | ✅ 로그인 전용 낮은 한도 |
| 5 | **로그인 폭주로 서버가 느려짐** | ⚠️ 비밀번호 확인(scrypt) 1번에 메모리 약 32MiB와 CPU를 많이 씀([auth:26](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/auth/index.ts#L26)), 태스크는 0.5 vCPU · 1GB. "수십 건이 동시에 오면 모든 손님의 로그인이 느려진다"는 가설(부하 시험으로 확인 가능) | WAF | ✅ 4와 같은 규칙 |
| 6 | 가짜 계정 대량 가입 → 선착순 쿠폰 독식 | ⚠️ 가입 제한이 없음([auth:71](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/auth/index.ts#L71)) | WAF + (나중에 본인 확인) | △ IP 하나에서 오는 것만. IP를 여러 개 쓰는 봇은 Bot Control · CAPTCHA |
| 7 | 봇이 예약만 잔뜩 해 객실 묶어 두기 | ⚠️ 결제가 없어 예약이 공짜 | 앱(사람당 한도) + 결제 | △ 일부만. 근본 대책은 [데모 결제](03-plan.md#v2-이후-후보) |
| 8 | 숙소 · 검색 긁어 가기 → DB 부담 | ⚠️ 검색이 `LIKE '%…%'`라 무거운 편 | WAF | ✅ 전체 한도 |
| 9 | XSS → 로그인 토큰 탈취 | 🟡 React가 기본으로 막고 `dangerouslySetInnerHTML`도 없음. 그러나 토큰이 localStorage에 있어([auth.tsx:33](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/web/src/auth.tsx#L33)) XSS 하나면 토큰이 털리고, 보안 헤더(CSP 등)가 없음 | 코드 + CloudFront 보안 헤더 | 2차 방어(핵심 규칙 세트) |
| 10 | 취약점 스캐너(`/.env`, Log4j 탐색) | 🟡 화면 주소 처리 때문에 아무 주소나 200(`index.html`)으로 답함([app:54](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/app.ts#L54)) | WAF | ✅ 알려진 나쁜 입력 + 핵심 규칙 세트 |
| 11 | 너무 큰 요청 | ✅ 본문 10KB 제한([app:16](https://github.com/yubin05/hotel-booking-app/blob/7e498d5/src/app.ts#L16)) | 코드 | 핵심 규칙 세트(8KB 초과 차단)도 같은 방향 |

## 3. WAF 구성 ([ADR-050](04-decisions.md#adr-050))

웹 ACL 하나를 앱 CloudFront에 붙이고, global 루트에서 CloudFront와 함께 만들고 지웁니다.

| 규칙 | 막는 위험 | WCU |
|---|---|---|
| ① 로그인 · 가입 전용 한도: `POST /api/auth/login` · `register`, IP당 5분 100건 (가설값) | 4 · 5 · 6 | 약 10 |
| ② 전체 한도: IP당 5분 2,000건 (가설값: 손님 한 명은 5분에 수백 건, 통신사 모바일은 여러 손님이 공인 IP 하나를 나눠 쓸 수 있어 여유) | 7 · 8 | 2 |
| ③ 핵심 규칙 세트(`AWSManagedRulesCommonRuleSet`): XSS, 경로 조작, SSRF, 크기 제한 | 9 · 10 · 11 | 700 |
| ④ 알려진 나쁜 입력(`AWSManagedRulesKnownBadInputsRuleSet`): Log4j 등 | 10 | 200 |
| ⑤ Amazon IP 평판 목록(`AWSManagedRulesAmazonIpReputationList`) | 6 · 8 | 25 |
| ⑥ SQL 데이터베이스(`AWSManagedRulesSQLiRuleSet`) | 1 | 200 |
| 합계 | | 약 1,140 (기본 1,500 안이라 추가 요금 없음) |

**요금:** 웹 ACL 월 $5 + 규칙 6개(관리형 그룹도 하나에 1개로 셈) × $1 = **월 $11**, 요청 100만 건당 $0.60. 월 요금은 시간 단위로 일할 계산돼 켜 둔 시간만 냅니다(시간당 약 $0.015).

**운영 방식:** 관리형 규칙은 보통 Count(기록만)로 먼저 켜 오탐을 본 뒤 Block으로 바꿉니다. 우리는 실제 손님이 없어 지켜볼 기간이 의미가 없으므로 Block으로 켜고, 5절의 정상 흐름을 직접 눌러 확인합니다.

## 4. WAF로 못 막는 것

| 무엇 | 왜 | 대신 |
|---|---|---|
| 권한 · 업무 규칙(2 · 3) | 요청 모양이 정상과 같음 | 코드 (막혀 있음) |
| IP를 여러 개 쓰는 공격 | 요청 수 제한은 IP 하나 단위 | Bot Control · ATP(유료), CAPTCHA |
| 보안 헤더(CSP, HSTS 등) | WAF는 요청을 거르는 일만 함 | CloudFront 응답 헤더 정책 |

## 5. apply 뒤 확인할 것

| 확인 | 기대 |
|---|---|
| 가입 · 로그인 · 검색 · 예약 · 변경 · 취소 · 쿠폰 받기 · 한글 리뷰 쓰기 | 모두 정상(오탐 없음) |
| 같은 IP에서 로그인 101번 이상 | 한도를 넘긴 뒤 403 |
| `?city=' OR 1=1--` 같은 SQL 인젝션 모양의 요청 | 403 |
| `<script>` 넣은 요청 | 403 |

- 3단계 k6 부하 시험은 EC2 IP 하나에서 보내 ②에 걸립니다. 그때 시험 IP 예외(IP 세트)를 정합니다.

## 6. 후속 후보 (보안 확장)

| 후보 | 막는 위험 |
|---|---|
| 앱: 계정 단위 로그인 실패 제한 | 4 (IP를 바꿔 가며 하는 대입) |
| 앱: 사람당 예약 수 한도, [데모 결제](03-plan.md#v2-이후-후보) | 7 |
| 앱: 토큰을 httpOnly 쿠키로(+CSRF 대책), CSP 직접 설정 | 9 |
| 의존성: npm Dependabot, ECR 이미지 스캔 | 알려진 라이브러리 취약점 |
| WAF: 로그 저장, Bot Control · ATP | 오탐 추적, 6 · 8의 정교한 봇 |

<details>
<summary>확인한 근거</summary>

- 요금(웹 ACL $5, 규칙 · 관리형 그룹 $1, 요청 100만 건당 $0.60, 시간 단위 일할, 1,500 WCU 초과분 요금): [WAF 요금](https://aws.amazon.com/waf/pricing/).
- 핵심 규칙 세트 700 WCU, `SizeRestrictions_BODY` 8KB, 알려진 나쁜 입력 200 WCU(Log4j 규칙 포함): [기본 규칙 그룹](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html). SQL 그룹 200 WCU, "SQL DB를 쓰는 앱이면 검토": [용도별 규칙 그룹](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-use-case.html). IP 평판 목록 25 WCU: [IP 평판 규칙 그룹](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-ip-rep.html).
- 요청 수 제한: 최소 10, 평가 기간 1 · 2 · 5 · 10분(기본 5분), 기본은 IP별: [요청 수 규칙](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-high-level-settings.html).
- CloudFront 정액 요금제(Free는 WAF 포함 $0)는 Free · Pro가 VPC Origin을 지원하지 않아 쓰지 않음: [정액 요금제](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html).

</details>
