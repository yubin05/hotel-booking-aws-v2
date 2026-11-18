# 3단계 덤프 이관과 비교 — 실행 계획 (뼈대, 2026-11-18)

[03 3단계](../03-plan.md#3단계-덤프-이관과-비교)의 할 일을 실행 순서로 풀어 쓴 계획입니다. 지금은 뼈대이고, 절마다 필요한 파일만 읽어 채웁니다. 마감은 이관(3 · 4 · 5단계) 2026-11-27([ADR-059](../03-plan.md#adr-059)).

| 절 | 하는 일 | 완료 기준 | 상태 |
|---|---|---|---|
| 0 | 앱 변경 효과(로컬) | 3단계 비교표 각주 | **완료(11-18):** 500명에서 차이 없음, 새 조회 DB 0.003초/실행. 1,000명은 포화로 비교 제외 → [app-change](app-change.md) |
| 1 | 덤프 이관 | 중단 시간 실측, 건수 · 체크섬 일치, 한글 확인 | 뼈대 |
| 2 | 1단계와 같은 k6 비교 | 층별 에러율 · p95 · 처리량, "N명까지 버팀", 오토스케일링 동작 | 뼈대 |
| 3 | 쿠폰 오픈 스파이크 (예약 스케일링 없이 / 있게) | 초과 발급 0, 남은 수량 거절 0, 오픈 순간 p95, 쿠폰 행 처리량 상한 | 뼈대 |
| 4 | 실측 기반 라이트사이징 (2026-11-18 추가) | 태스크 크기 확정, 월 비용 차이 | 뼈대 |

## 하루 순서 (2026-11-18 정함)

legacy(+ 발생기) apply → 서울 apply → global apply(WAF 예외 포함) → **1 이관**(복원 뒤 migrate) → **2 k6 비교 3회**(37분씩) → **3 쿠폰 스파이크** → **4 라이트사이징 확인 1회** → 전부 destroy.

- 이관에 legacy가 필요하고, 발생기도 1단계와 같게 legacy Terraform(`is_load_test=true`)에 있어 같은 날 묶는 게 가장 쌉니다. 2 · 3 · 4는 회차 사이에서 끊고 다른 날 이어 갈 수 있습니다(이때는 legacy를 발생기 때문에 다시 올림).
- 비용: 서울 시간당 약 $0.19(11-16 실측) + legacy · 발생기 + WAF. 하루 합계는 채울 때 계산.

## 1. 덤프 이관

근거: [ADR-008](../04-decisions.md#adr-008)(작은 DB + 점검 시간 허용 → `mysqldump`), 경로 · 점검 방식은 아래 [정한 것](#정한-것-2026-11-18-사용자) ① ②. 옛 DB와 복원 태스크가 같은 `mysql:8.4` 이미지라(mysqldump · mysql · gzip · openssl 있음, 확인함) 양쪽 도구가 같다. 옛 DB 스키마는 고객사 저장소 main의 `schema.sql`을 받아 만들어 새 구조와 같다(`legacy/ec2_instance.tf`).

**가정한 점검 창:** 고객사와 합의해 손님에게 미리 공지한 새벽 03:00 ~ 04:00(1시간). 시험은 낮에 같은 절차로 한다. 시작 40분까지 검증을 통과하지 못하면 되돌린다(되돌림은 옛 앱을 다시 켜는 1분 안팎이라 창 안에 끝남).

| 때 | 단계 | 누가 · 무엇으로 |
|---|---|---|
| 사전 | ① legacy(`is_load_test=true`) · 서울 · global apply. **서울 migrate는 아직 안 돌림**(빈 RDS에 시드가 들어가 복원과 겹침) | 사용자 |
| 사전 | ② 1회용 암호 키를 SSM SecureString에 넣음(화면에 안 나오게 만들어 바로 저장) | 사용자(관리자) |
| 사전 | ③ 옛 사이트에 "표지" 손님 가입(한글 이름): 점검 직전 쓰기까지 옮겨졌는지, 한글이 바이트 그대로인지 보는 표 | 스크립트 |
| 사전 | ④ 1초 간격 기록 시작(옛 주소 · 새 주소 상태 코드) | 스크립트 |
| **중단** | ⑤ 옛 앱 멈춤 → 503 점검 페이지(`Retry-After`) | 스크립트 |
| 중단 | ⑥ 옛 DB 컨테이너 안에서 `mysqldump`(utf8mb4, `--single-transaction`, 루틴 · 트리거 · 이벤트 제외) → gzip → openssl 암호화 → SSH로 흘려 운영 PC에서 그대로 S3로(PC 디스크에 파일 없음). 같은 때 옛 DB 체크섬 | 스크립트 |
| 중단 | ⑦ 관리자로 복원 일회성 태스크 실행: 미리 서명한 GET 주소(15분 유효)로 받아 해제 → 압축 풀기 → RDS 관리자 계정으로 복원 → 같은 체크섬 출력 | 스크립트 |
| 중단 | ⑧ 검증: 테이블별 행 수 · 내용 해시가 같고, 표지 손님 이름이 바이트(HEX) 그대로 | 스크립트 |
| 중단 | ⑨ migrate 일회성 태스크: `app` 계정 · 시연 계정(숙소가 있어 시드는 건너뜀) | 스크립트 |
| **끝** | ⑩ 새 주소에서 예약 성공 = 중단 끝. 덤프 · 키 삭제 | 스크립트 |
| 되돌림 | ⑧ · ⑩ 실패 또는 40분 초과: 점검 페이지 내리고 옛 앱 다시 켬(옛 DB는 읽기만 함) | 스크립트 |

- 체크섬: 테이블마다 행 수 + 모든 칸을 이은 문자열의 CRC32를 XOR로 합친 값(행 순서 · 저장 형식과 무관). `CHECKSUM TABLE`은 행 형식이 바뀌면 값도 바뀐다고 문서에 있어([MySQL](https://dev.mysql.com/doc/refman/8.4/en/checksum-table.html)) 서버가 다른 양쪽 비교에는 쓰지 않는다
- 측정: 단계별 시각(스크립트가 남김), **중단 시간 = ⑤ → ⑩**, 덤프 크기, 덤프 · 올리기 · 복원 · migrate 각 시간, 손님이 본 503 수(1초 기록)
- 실행 전에 Claude가 로컬에서 같은 파이프(덤프 → 암호화 → 해제 → 다른 MySQL에 복원 → 체크섬 비교)를 스모크 점검한다

### 예측 (실행 전)

| 항목 | 뜻 | Claude 예측 | 사용자 예측 |
|---|---|---|---|
| 덤프 크기 | 압축 · 암호화한 파일 크기 | 10 ~ 20MB (숙소 1,010 · 회원 2만 · 예약 10만 · 리뷰 5만) | |
| 덤프 + 올리기 | ⑥ 시간 | 30초 이내 | |
| 복원 태스크 | ⑦ 시작부터 끝까지(이미지 받기 포함) | 2 ~ 4분 | |
| 중단 시간 | ⑤ → ⑩ | 8 ~ 15분(태스크 2번 시작 대기가 대부분) | |
| 체크섬 | 모든 테이블 일치 여부 | 일치, 한글 그대로 | |

- 만든 것(2026-11-18): 이관 버킷 [bootstrap/migration.tf](../../infra/bootstrap/migration.tf)(공개 차단 · HTTPS만 · 버전 관리 없음 · 1일 뒤 삭제), 복원 태스크 정의 [regional/migration.tf](../../infra/modules/regional/migration.tf)(서울만), 스크립트 [migration/](../../migration/)(`cutover.sh` · 양쪽 공용 `checksum.sh` · 표지 손님 `marker.mjs`), 런북 [5-4](../../infra/README.md#5-4-덤프-이관-3단계-한-번). 키 읽기 권한은 실행 역할에 이미 있음(`/hotel-booking/*`)
- 잠금: AES-256-CBC, 키에서 PBKDF2(10만 번, SHA-256)로 암호 키를 만듦. 1회용 키는 SSM SecureString에만 있고 PC는 run 동안 메모리로만 들고 있음. openssl `enc`는 위조 검출(인증 암호)을 하지 않아, 내용이 바뀌었는지는 gzip 검사와 체크섬 비교로 잡는다

## 2. 1단계와 같은 k6 비교

- 같은 [baseline.js](../../load/baseline.js)(500명씩 3,000명까지, 37분) × 3회, 같은 발생기(t3.medium, legacy VPC)
- 대상만 바뀜: 1단계 `http://<앱 IP>` → 3단계 `https://hotel.vundle34.cloud`(CloudFront → WAF → 통로 → ALB → Fargate 2~4개 → RDS). `/api/*`는 캐시를 끈 경로라(global `cloudfront.tf`) 모든 요청이 서버까지 간다
- 서버 지표는 SSH가 아니라 CloudWatch에서: ECS CPU · 메모리, RDS CPU · 연결 수, 태스크 수 변화 시각, 앱 1초 지표(ADR-061)
- 비교표 각주: 0절 앱 변경 효과
- 채울 것: `run-baseline.sh`를 3단계 대상으로 돌리는 방법(서버 지표 수집 부분), 예측(1단계는 1,000명 뒤 연결 추적 표가 차서 무너짐 → 새 구조에서 먼저 막히는 곳은 태스크 상한 4 × DB 연결 12 = 48인지)

## 3. 쿠폰 오픈 스파이크

- 로컬 E-03([e03-coupon-open.js](https://github.com/yubin05/hotel-booking-app/blob/main/load/e03-coupon-open.js))을 AWS 규모로: 오픈 시각에 N명이 함께 누르고 쿠폰은 M장
- 두 조건 × 3회: **예약 스케일링 없이**(태스크 2개 + 목표 추적만 = 이관 전 IDC처럼 미리 못 늘림, 예약을 깜빡했을 때 안전망 시험) / **있게**(오픈 전 최소 4개, [ADR-015](../04-decisions.md#adr-015))
- 채울 것: N · M, 쿠폰 만드는 방법(관리자 API 또는 SQL), 오픈 시각과 예약 시각의 간격, 예측

## 4. 실측 기반 라이트사이징

- 뜻: 자원 크기를 실제 쓰는 양에 맞추는 것(AWS Well-Architected 비용 원칙 [COST06](https://docs.aws.amazon.com/wellarchitected/latest/framework/cost_type_size_number_resources_metrics.html)). 태스크 **개수**를 자동으로 바꾸는 오토스케일링과 다르다. 이번에 바꾸는 것은 태스크 **한 개의 크기**
- 지금: 0.5 vCPU / 1GB(`ecs.tf`, "3단계 부하 뒤 확정"), 2~4개, CPU 60% 목표 추적
- 자료: 2절 k6 동안 층별 태스크 CPU · 메모리 평균 · 최대
- 후보(Fargate 조합, [문서](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html)): 0.25 vCPU / 0.5 · 1 · 2GB, 0.5 vCPU / 1 ~ 4GB, 1 vCPU / 2 ~ 8GB
- 엮인 것: CPU를 줄이면 같은 부하에 태스크가 더 늘어나고, 태스크당 DB 연결 12 × 상한 4 = 48 계산이 바뀐다. 메모리는 이런 엮임이 없어 먼저 본다
- 확인: 바꾼 크기로 k6 1회 → p95 · 에러가 같은지, 월 비용 차이. 결과는 비용 결정 표 · 09에
- 채울 것: 판단 규칙(실행 전에 숫자로), 예측

## WAF 예외 (2 · 3 · 4 공통)

- 문제: 발생기는 IP 1개라 "IP당 5분 2,000건"(`all-rate-limit`)을 몇 초 만에 넘어 403을 받는다. 서버가 아니라 WAF가 막은 것이 "무너짐"으로 잡힌다
- 안: 요청 제한 규칙 3개(`auth` · `all` · `photo`)에만 "발생기 IP가 아니면 센다"는 범위 조건(scope-down + NOT IP set)을 넣고, 관리형 규칙 4개는 그대로 둔다(손님처럼 WAF 검사 시간을 포함해서 잼). 요청 제한 규칙은 범위 조건에 맞는 요청만 센다([WAF 요청 제한](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-request-limiting.html), NOT IP set 모양은 [Bot Control 예시](https://docs.aws.amazon.com/waf/latest/developerguide/waf-bot-control-example-scope-down-ip.html))
- 발생기 IP는 global apply 때 변수로 넣고 기본값은 빈 목록. global은 시험 날마다 지우므로 예외가 남지 않는다

## 실험 설계 점검표 (2 · 3 · 4 공통)

| 점검 | 어떻게 |
|---|---|
| 1. 응답 시간 = 손님이 기다린 시간 | `blocked + duration` (baseline-report · ab-report와 같음) |
| 2. 기대 결과 · 숨은 기준을 미리 | 절마다 예측 표와 판정 기준을 실행 전에 이 문서에 |
| 3. 같은 조건 3회 | 2 · 3절 3회씩, 4절 확인은 1회(바꾼 크기가 같은 결과를 내는지 보는 확인) |
| 4. 손 조작은 스크립트로 | 쿠폰 오픈 시각 · 예약 스케일링 시각을 스크립트 · Terraform 변수로 고정 |
| 5. 환경 한계 | 발생기 1대(IP 1개 → 한 CloudFront 엣지), 1단계와 달리 HTTPS · CDN을 거침(새 구조의 일부로 봄) |
| 6. 분석 스크립트를 미리 | 2절 baseline-report 재사용, 3절 E-03 분석 재사용 여부 확인 |
| 7. 회귀 테스트 | 앱을 고치게 되면 상태 확인 기반으로 |
| 8. 스모크 점검 | Claude가 짧게(몇 명 · 1분) 돌려 보고 기록하지 않음 |

## 정한 것 (2026-11-18, 사용자)

| # | 결정 | 이유 (자료 / 추론) |
|---|---|---|
| ① 덤프 전달 | **S3 경유 + 일회성 복원 태스크**(`mysql:8.4` 이미지에 curl · mysql 있음, 확인함) | 자료: **AWS가 만든 온프레미스 → RDS 이관 기능(Restore from S3)도 백업을 S3에 올려 복원한다**([RDS 문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MySQL.Procedural.Importing.html), Aurora도 같음) → S3 경유는 AWS가 공식으로 열어 둔 길이다(그 기능은 물리 백업 전용이라 덤프는 우리 태스크가 넣음). VPC 피어링은 VPC끼리만 잇는다([피어링](https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html)) → 실제 IDC에는 못 씀. IDC → AWS 연결은 VPN · 전용선([Site-to-Site VPN](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html))이고, v1이 VPN + DMS였다. AWS도 덤프를 같은 리전의 중간 서버로 옮겨 넣는 절차를 안내한다([RDS 문서](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-importing-data-reduced-downtime.html)). 추론: 한 번뿐인 작은 덤프라 상시 통로 없이 인터넷(HTTPS)으로 파일만 보낸다. 원본이 진짜 IDC여도 바깥 인터넷 출구만 있으면 같은 절차. 덤프에 개인정보(이메일 · 비밀번호 해시)가 있어 TLS 전송 · 저장 암호화 · 끝나면 삭제 · 업로드 권한은 그 경로 하나만 |
| ② 점검 | **공지된 새벽 점검처럼, 옛 앱 자리에 503 점검 페이지**(`Retry-After`) | 자료: **AWS 이관 가이드는 중단 창을 앱 소유자와 합의하는 것을 정해진 단계로 둔다**([컷오버 단계](https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html)). **실제 예: 인터파크(NOL, 숙박 · 투어 · 티켓 예약) 2026-03-17 03:00 ~ 07:30, 2023-03-23 00:00 ~ 07:00 점검**([점검 페이지](https://avis.interpark.com), [공지](http://m.shop.interpark.com/777.html)). 01 가정 "이관 시 새벽 점검 시간을 쓸 수 있다"와 [ADR-008](../04-decisions.md#adr-008). 계획된 중단에는 오류 · 연결 거부 대신 503 안내 페이지를 권한다([Google](https://developers.google.com/search/docs/crawling-indexing/pause-online-business)). 작은 DB는 오프라인 덤프로 충분하고 중단을 줄여야 하면 DMS · 변경 복제를 쓴다([AWS 패턴](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/migrate-an-on-premises-mysql-database-to-amazon-rds-for-mysql.html)). 국내 새벽 점검 공지 예: [업비트](https://docs.upbit.com/kr/changelog/점검-서버-점검-안내-0524-0200~) · [정부24](https://www.gov.kr/portal/ntcItm/107348). 숙박 플랫폼의 점검 공지는 찾지 못함 |
| ③ 전환 범위 | **새 구조(global 포함)를 미리 올리고**, 중단 시간 = 점검 페이지 켬 → 새 주소에서 예약 성공 | 자료: RDS 문서도 새 DB를 미리 만들어 데이터를 넣은 뒤, 마지막에 쓰기를 멈추고 앱을 옮긴다. 추론: 앱 · 입구도 같은 원리로, 옛 사이트가 평소대로 영업하는 동안 미리 만들어 둔다(손님에게 중단이 아님). 한계: 도메인이 처음부터 새 구조만 가리켜 DNS 전환 · 반영 시간은 재지 않는다 |
| ④ 일정 | **하루에 1 → 4** | 사용자: 빨리 끝낸다. legacy를 한 번만 올림 |
| ⑤ WAF | **요청 제한 규칙 3개만 발생기 IP 예외, 관리형 규칙은 그대로** | 위 WAF 절 |

## 근거 조사 (2026-11-18)

**덤프 하나에 VPN이 필요한가**
- AWS가 만든 온프레미스 → RDS 경로도 S3를 거친다: 백업을 S3에 올려 새 RDS로 복원([RDS Restore from S3](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MySQL.Procedural.Importing.html)), Aurora도 같은 방식([Aurora XtraBackup + S3](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraMySQL.Migrating.ExtMySQL.S3.html))
- 계속 복제하는 DMS도 VPN · 전용선 말고 인터넷 경로(원본 방화벽에 NAT IP만 허용 + TLS)를 지원한다([DMS 네트워크](https://docs.aws.amazon.com/dms/latest/userguide/instance-profiles-network.html), [DMS 보안](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Security.html))
- 국내 기준: 개인정보의 안전성 확보조치 기준 제7조는 인터넷으로 주고받을 때 **암호화**를 요구한다(2차 자료 [itwiki](https://itwiki.kr/w/%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4%EC%9D%98_%EC%95%88%EC%A0%84%EC%84%B1_%ED%99%95%EB%B3%B4%EC%A1%B0%EC%B9%98_%EA%B8%B0%EC%A4%80_%EC%A0%9C7%EC%A1%B0)로 확인, 국가법령정보센터 원문은 미확인). 전송 수단으로 VPN을 지정한다는 내용은 찾지 못했다
- 추론: VPN · 전용선은 이미 있거나, 데이터가 크거나, 계속 복제할 때 쓴다. 덤프 한 번 때문에 새로 깔아야 한다는 자료는 없다 → S3 경유 + 올리기 전 암호화 유지

**새벽 점검을 고객사가 허용하나**
- AWS 이관 가이드는 중단 창(outage window)을 앱 소유자와 합의하고, 넘칠 때 되돌림 계획을 맞추는 것을 정해진 단계로 둔다([컷오버 단계](https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html))
- 국내 예: 인터파크(NOL) 2026-03-17 03:00 ~ 07:30 · 2023-03-23 00:00 ~ 07:00 점검([점검 페이지](https://avis.interpark.com), [공지](http://m.shop.interpark.com/777.html)), 카카오뱅크 2024-05-12 01:00 ~ 08:00 금융거래 중단([기사](https://news.mtn.co.kr/news-detail/2024050709472686874)), 하나은행 2025-09-13 00:00 ~ 08:00([공지](https://www.kebhana.com/cont/news/news01/news0101/1509675_118324.jsp))
- 못 찾은 것: "고객사가 얼마나 자주 허용하는가" 통계, 야놀자 · 여기어때 · 아고다의 점검 공지
