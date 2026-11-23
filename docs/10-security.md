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
| 7 | 봇이 예약만 잔뜩 해 객실 묶어 두기 | ⚠️ 결제가 없어 예약이 공짜 | 앱(사람당 한도) + 결제 | △ 일부만. 근본 대책인 데모 결제(예약 먼저 + 10분 결제 대기, 안 내면 자동 취소)는 2026-11-18 앱에 넣음([APP-001](https://github.com/yubin05/hotel-booking-app/blob/main/docs/decisions.md)). 결제 키를 넣은 환경에서 동작 |
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

| 확인 | 기대 | 2026-11-15 결과 |
|---|---|---|
| 가입 · 로그인 · 검색 · 예약 · 변경 · 취소 · 쿠폰 받기 · 한글 리뷰 쓰기 | 모두 정상(오탐 없음) | 모두 통과: 가입 201, 한글 검색 · 내 정보 · 예약 목록 · 내 쿠폰 200, 예약 생성 201(한글 · 특수문자 요청 사항 포함) · 조회 · 변경(PATCH) · 취소(DELETE) 200, 쿠폰 받기 201. 한글 리뷰 본문 POST는 앱까지 도착(로그인 없어 401) |
| 같은 IP에서 로그인 101번 이상 | 한도를 넘긴 뒤 403 | 110건을 10초에 보내면 **모두 통과**, 약 41초 뒤부터 403. `/API/Auth/Login`(대소문자 우회)도 403, 같은 IP의 `/api/hotels`는 200 |
| `?city=' OR 1=1--` 같은 SQL 인젝션 모양의 요청 | 403 | 403 |
| `<script>` 넣은 요청 | 403 | 403 |
| Log4j 탐색(`${jndi:…}` 헤더), 경로 조작(`../../etc/passwd`) | 403 | 둘 다 403 |

- 로그인 한도에 걸린 IP는 가입도 함께 막혔다가 약 3분 뒤 풀렸다.
- 요청 수 제한은 바로 막지 않고 수십 초 늦게 걸린다(이번에는 약 41초). 그 사이 요청은 앱까지 가므로 비밀번호 대입은 앱의 계정 단위 제한과 함께 막아야 한다(6절).

- 3단계 k6 부하 시험은 EC2 IP 하나에서 보내 ②에 걸립니다. 그때 시험 IP 예외(IP 세트)를 정합니다.

## 6. 후속 후보 (보안 확장)

| 후보 | 막는 위험 |
|---|---|
| 앱: 계정 단위 로그인 실패 제한 | 4 (IP를 바꿔 가며 하는 대입) |
| 앱: 사람당 예약 수 한도 (데모 결제는 [APP-001](https://github.com/yubin05/hotel-booking-app/blob/main/docs/decisions.md)로 넣음) | 7 |
| 앱: 토큰을 httpOnly 쿠키로(+CSRF 대책), CSP 직접 설정 | 9 |
| 의존성: npm Dependabot, ECR 이미지 스캔 | 알려진 라이브러리 취약점 |
| WAF: 로그 저장, Bot Control · ATP | 오탐 추적, 6 · 8의 정교한 봇 |

## 7. 공격 방법 메모 (6단계 시나리오 후보, 2026-11-18)

앱 묶음 작업 중 정리한 공격 방법. 6단계 시나리오에 넣을지는 그때 정한다. 로그 칸은 앱의 보안 로그(`log=security`, [ADR-060](03-plan.md#adr-060)).

| 공격 | 방법 | 지금 막히나 | 우리 로그로 보는 신호 |
|---|---|---|---|
| 분산 크리덴셜 스터핑 | 다른 곳에서 털린 이메일 · 비밀번호 목록을 프록시망으로 수많은 IP에 나눠, 계정마다 한 번씩 넣는다(비밀번호 재사용을 노림) | 아니오. WAF 요청 수 제한(IP 단위)도, 앱 계정 잠금(15분 5회)도 숫자가 작아 안 울린다 | 사이트 전체의 `reason=unknown_account` 급증(유출 목록에 우리 회원이 아닌 이메일이 섞임), 실패한 서로 다른 `account` 수, 여러 IP의 같은 `ua`, `login_succeeded` 뒤 같은 `session_id`의 `booking_created.points_used` |
| 세션 토큰 탈취 | 정보 탈취 악성코드가 브라우저에 저장된 비밀번호 · 세션 쿠키(우리 앱은 localStorage의 토큰)를 가져가, 로그인 없이 그 토큰으로 요청 | 아니오. 토큰은 만료(1시간)까지 유효하고, 주인이 비밀번호를 바꿔도 이미 발급된 토큰은 그대로 쓰인다. 세션 끊기는 보안 강화 단계 | 새 `login_succeeded` 없이 같은 `session_id`가 다른 `ip` · `ua`에서 쓰임(정상 사용자도 IP가 바뀔 수 있어 단독으로 확정하지 않음) |
| X-Forwarded-For 위조 | 손님이 이 헤더에 남의 IP를 적어 보내 IP 차단 · 로그를 속이려 함 | 예. 앱은 우리 프록시(CloudFront → ALB)가 덧붙인 오른쪽 2칸만 믿는다(`trust proxy` 2, 앱 테스트로 확인) | 로그의 `ip`는 위조 값이 아닌 실제 손님 IP. "막히는 공격" 예시로 쓸 수 있음 |

## 8. 계정 탈취 탐지 · 세션 보류 (v3 시나리오 A, [ADR-072](04-decisions.md#adr-072), 2026-11-23)

7절의 크리덴셜 스터핑 · 세션 탈취로 **남의 적립금을 쓰는 경우**를 앱이 막는다. 설계와 근거는 [v3 시나리오 A 3절](v3-scenario-a.md#3-a-최소-설계-11-23-확정-adr-072), 운영자 대응은 [런북 5-10](../infra/README.md#5-10-시나리오-a-적립금-보류-경보-대응-운영자).

| 규칙 | 내용 (임계값은 모두 가설) | 코드 (앱 저장소) |
|---|---|---|
| 접속 기록 | 로그인 · 가입마다 `sessions` 행(세션 번호 = 토큰 jti, IP, 브라우저, 시각). 90일 뒤 삭제 | `src/auth` |
| 탐지 | 적립금을 쓰는 새 예약에서 셋 다 참이면 그 세션 보류: ① 새 환경(IP와 브라우저가 **둘 다** 평소 환경에 없음) ② 로그인 10분 안 ③ 사용 전 잔액의 50% 이상 | `src/points` `holdIfSuspicious` |
| 평소 환경 | 같은 회원의 최근 30일 세션 중 **24시간 넘었고**, 보류되지 않았고, 보류된 세션과 IP · 브라우저가 겹치지 않는 것. 비교할 세션이 없으면 새 환경으로 보지 않음 | `src/points` `isNewEnvironment` |
| 보류 검사 | 적립금을 깎는 유일한 길(`usePoints`) 맨 앞. 보류된 세션, 또는 다른 세션이 24시간 안에 보류됐는데 새 환경인 세션(공격자 재로그인)이면 403 + `points_hold_blocked` 로그. 예약 · 쿠폰 사용까지 함께 롤백 | `src/points` `assertNotHeld` |
| 첫 거래 | 막지 않는다(통과 + 같은 트랜잭션에서 보류). 같은 회원의 다음 사용은 사용자 행 잠금에서 기다렸다가 커밋된 보류를 본다 → 그사이 통과 0건 | `src/booking` |
| 경보 | 커밋 뒤 `points_hold_applied` 로그 → 지표 필터 → 경보(60초 합계 ≥ 1) → SNS → Slack. 보류는 경보를 기다리지 않는다 | 인프라 `modules/regional/alarms.tf` |
| 오탐 · 복구 | 보류 해제 `POST /api/admin/release-hold`, 사건 복구 `POST /api/admin/recover`(되돌림은 한 번만) | `src/admin` |

설계(3절)에서 구현하며 더하거나 고친 것:

| 무엇 | 왜 |
|---|---|
| 비교할 세션이 없으면 새 환경이 아님 | 글자 그대로면 "다른 세션에 없음"이 참이 되어, 배포 직후 모든 회원의 첫 세션과 갓 가입한 회원이 걸린다 |
| 평소 환경에서 보류된 세션과 IP · 브라우저가 겹치는 세션을 뺌 | 공격자의 재로그인 세션(403으로 막혀도 보류 기록은 롤백됨)이 평소 환경이 되면, 세 번째 로그인이 통과한다 |
| 평소 환경은 24시간 넘은 세션만 | 공격자가 두 번 로그인해 두면 두 세션이 서로를 평소 환경으로 봐서 한 번도 안 걸린다(시험으로 재현 · 확인) |
| 3-7 표 A3를 "각 40%" → "각 60%" | 확정 규칙(잔액의 50% 이상)에서 40%는 걸리지 않아 동시성을 시험하지 못한다 |
| 예약 변경에서 적립금을 다시 쓸 때도 사용자 행을 먼저 잠금 | 보류 검사의 세션 잠금 읽기와 같은 회원 새 예약의 보류 기록이 서로를 기다리는 교착을 막는다 |

알려진 한계 (지금 막지 않음):

- **쪼개 쓰기**: 매번 그때 잔액의 50% 미만만 쓰면(예: 49%씩 여러 번) 한 번도 안 걸린다. 막으려면 "이 세션의 누적 사용액 ≥ 세션 첫 사용 전 잔액의 50%"처럼 누적으로 본다(규칙 변경이라 결정 필요).
- **브라우저가 같은 공격자**: 흔한 브라우저 문자열은 남과 같을 수 있다. IP만 달라서는 새 환경이 아니다(여행 중인 회원을 걸지 않으려는 선택).
- **기다리는 공격자**: 로그인해 두고 24시간 뒤 다시 로그인하면 첫 세션이 평소 환경이 된다.
- 적립금을 안 쓰는 예약 · 토큰 자체는 막지 않는다(요청 범위). 토큰은 만료(1시간)까지 유효하다.

<details>
<summary>확인한 근거</summary>

- 요금(웹 ACL $5, 규칙 · 관리형 그룹 $1, 요청 100만 건당 $0.60, 시간 단위 일할, 1,500 WCU 초과분 요금): [WAF 요금](https://aws.amazon.com/waf/pricing/).
- 핵심 규칙 세트 700 WCU, `SizeRestrictions_BODY` 8KB, 알려진 나쁜 입력 200 WCU(Log4j 규칙 포함): [기본 규칙 그룹](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html). SQL 그룹 200 WCU, "SQL DB를 쓰는 앱이면 검토": [용도별 규칙 그룹](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-use-case.html). IP 평판 목록 25 WCU: [IP 평판 규칙 그룹](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-ip-rep.html).
- 요청 수 제한: 최소 10, 평가 기간 1 · 2 · 5 · 10분(기본 5분), 기본은 IP별: [요청 수 규칙](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-high-level-settings.html).
- 7절 크리덴셜 스터핑: 정의와 비밀번호 재사용 [OWASP](https://community.owasp.org/attacks/Credential_stuffing), 프록시망 분산이 "IP 차단 목록과 요청 수 제한을 둘 다 무력화할 수 있다" · IP 차단을 주된 방어로 쓰지 말 것 · 권하는 방어(MFA, CAPTCHA, 기기 지문, 이상 활동 알림 등) [OWASP 방어 가이드](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html). 세션 쿠키 탈취: [Microsoft, Lumma Stealer](https://www.microsoft.com/en-us/security/blog/2025/05/21/lumma-stealer-breaking-down-the-delivery-techniques-and-capabilities-of-a-prolific-infostealer/). X-Forwarded-For는 "믿을 수 있는 프록시가 추가한 IP만" 보안에 쓸 것: [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For).
- CloudFront 정액 요금제(Free는 WAF 포함 $0)는 Free · Pro가 VPC Origin을 지원하지 않아 쓰지 않음: [정액 요금제](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html).

</details>
