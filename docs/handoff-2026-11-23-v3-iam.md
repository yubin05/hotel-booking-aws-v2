# 인수인계 2026-11-23: v3 권한 재설계 (작업별 역할 분리)

v3 보안 운영 작업. **2026-11-23 사용자 결정: v3 작업으로 한다.** 아래 3역할 구조는 Claude 추천안이고, 세부(특히 읽기 전용 정책 종류)는 시작할 때 확정한다. 03 계획 v3 표의 "권한 재설계" 줄과 같은 내용이다.

**언제:** 인프라(서울 · global)를 내린 뒤. 매일 apply 권한을 바꾸는 작업이라, 떠 있는 동안 하면 내리기도 막힐 수 있다.

## 1. 지금 상태 (11-23 관리자로 읽기만 해서 확인)

| 항목 | 값 |
|---|---|
| 사람 IAM 사용자 | `vundle34` 하나. 액세스 키 없음, MFA 있음(`vundle34-authy`), 콘솔 로그인 + `aws login`(임시 자격 증명) |
| vundle34 그룹 `normal-user-group` | 관리형 `hotel-booking-aws-v2-operator-v2`(서울 · 도쿄 인프라, `infra/iam/v2-operator-policy.json`) · `hotel-booking-aws-v2-operator-edge`(CloudFront · WAF · ACM · Route 53 레코드, `edge-operator-policy.json`) · AWS 관리형 `IAMUserChangePassword` · `SignInLocalDevelopmentAccess`(`aws login`용), 인라인 `AssumeAdminRolePolicy`(MFA일 때만 관리자 역할 전환) |
| 관리자 | `Administrator-Role`: 같은 계정 + MFA일 때만 전환, 세션 2시간. CLI는 `[profile admin]` = 콘솔에서 역할 전환 뒤 `aws login --profile admin`(`login_session` 방식) |
| 기계용 역할 | `-github-deploy`(CD, OIDC), `-ecs-execution` · `-ecs-task`(앱), `-grafana-read`(Grafana Cloud, 외부 ID), `-chatbot`(Slack), `-photos-replication` |
| 정리 후보 | `AWS-QuickSetup-SSM-DefaultEC2MgmtRole-ap-northeast-2`(마지막 사용 11-20), `dms-vpc-role`(11-18). 이 프로젝트 코드가 만든 것이 아님. 누가 쓰는지 확인한 뒤 판단 |
| 정책 크기 | operator-v2 6,004 / 6,144자(한도 근접), edge 2,179자 |
| 사용 기록(last accessed) | 허용된 18개 서비스를 **모두 11-22에 사용**. 안 쓰는 서비스 권한은 없음 |
| 확인 못 함 | 루트 사용자 MFA · 루트 액세스 키(관리자 세션 만료). 첫 단계에서 `aws iam get-account-summary`로 `AccountMFAEnabled` · `AccountAccessKeysPresent` 확인 |

**시뮬레이션 결과** (`iam simulate-principal-policy`, 사용자 vundle34)

| 막힘 | 허용 (넓은 곳) |
|---|---|
| IAM 역할 · 키 만들기, CloudTrail 끄기, GuardDuty · Config 끄기, state 버킷 삭제, Route 53 영역 · ECR 삭제, JWT 금고 · SSM 값 읽기, EC2 인스턴스 만들기 · 지우기, 서울 · 도쿄 밖 리전 | 서울 · 도쿄 안에서 **이름과 상관없이** VPC · RDS 등 만들고 지우기(리전 조건만 있고 리소스는 `*`), CloudFront · WAF 삭제(계정 전체), DB 관리자 비밀번호 읽기(매일 apply 때 Terraform이 RDS 비밀번호를 넣으려고 필요) |

판단: "평소 사용자는 감사 · 보안 · IAM · state를 못 건드린다"는 핵심 경계는 지켜지고 있다. 퇴색한 건 **넓이**(리전 안 리소스 전부, 정책 하나에 몰림)다.

## 2. 목표 구조

| | 지금 | 목표 |
|---|---|---|
| `vundle34` | 로그인 + 운영 권한 직접 보유 | **로그인 + 역할 전환만**(그룹에는 `AssumeRole` · 비밀번호 변경 · `aws login`만) |
| 운영 역할 (새로) | 없음 | 매일 apply(서울 · 도쿄 · global). operator-v2 · edge 정책을 옮겨 붙임 |
| 읽기 전용 역할 (새로) | 없음 | 보기만: 대시보드 · 로그 검색 · 지표 · 리소스 상태 |
| 관리자 역할 | 있음 | 그대로(bootstrap · security · IAM, MFA, 2시간) |
| 기계용 역할 | 있음 | 그대로 |

**읽기 전용이 필요한 근거 (11-23 실제 사례):** 메일 실패 원인을 찾는 앱 로그 검색(`logs:FilterLogEvents`)과 경보 그래프 지표 조회(`cloudwatch:GetMetricStatistics`)를 평소 사용자가 못 해서 **보기만 하려고 관리자 역할을 썼다.** 실무 용어로 최소 권한 · 직무 분리: 평소에는 읽기 전용으로 보고, 바꿀 때만 운영 역할로 올라간다. 멘토 · 면접관에게 콘솔을 보여 줄 때도 이 역할을 쓴다.

**알림만 보는 사람:** IAM 사용자를 만들지 않는다. Slack `#hotel-alerts` 채널 멤버면 된다(Amazon Q는 IAM 사용자가 아니라 채널 역할로 동작). AWS 권장은 사람이 페더레이션 · 임시 자격 증명으로 들어오는 것([IAM 모범 사례](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)).

## 3. 진행 순서와 완료 기준

| 단계 | 할 일 | 완료 기준 |
|---|---|---|
| 0 | 루트 MFA · 키 확인, 지금 권한 시뮬레이션 표를 "전"으로 저장 | 1절 표 + 루트 상태 기록 |
| 1 | bootstrap(관리자): 운영 · 읽기 전용 역할 생성. 신뢰는 vundle34 + MFA. 운영 역할에 operator-v2 · edge 연결 | plan 숫자 예측 → apply 시각 기록 |
| 2 | 읽기 전용 정책 고르기 | AWS 관리형 `ReadOnlyAccess` · `ViewOnlyAccess` 등 후보를 **공식 문서로** 비교: 비밀값 · S3 객체(state 포함) · 로그 내용이 읽히는지. 필요하면 로그 검색 · 지표만 더한 좁은 정책 |
| 3 | CLI 프로필 `operator` · `readonly` 추가(`admin`과 같은 방식) | 각 프로필로 `sts get-caller-identity` 확인 |
| 4 | **운영 역할로 매일 apply 한 번 성공**(서울 → global → 내리기) | 런북 1 · 2절이 `AWS_PROFILE=operator`로 끝까지 됨 |
| 5 | 그다음에 vundle34 그룹에서 operator-v2 · edge 떼기 | vundle34 단독으로는 apply 실패, 운영 역할로는 성공. **되돌리기: 그룹에 다시 붙이기** |
| 6 | 태그 조건으로 "이 프로젝트 리소스만" | provider `default_tags` 먼저 → 생성은 `aws:RequestTag`, 수정 · 삭제는 `aws:ResourceTag` 조건. 프로젝트 밖 리소스 삭제가 막힘을 시뮬레이션으로 보임 |
| 7 | 정리 · 기록 | 전 · 후 시뮬레이션 표(포트폴리오 결과물), 런북 0 · 1 · 2절 프로필 갱신, ADR, 정리 후보 역할 판단 |

**순서 주의:** 4를 5보다 먼저 한다. 새 역할이 되는 걸 확인하기 전에 옛 권한을 떼면 매일 apply가 막힌다.

## 4. 확인할 가설 · 위험

- `aws login` 방식 프로필로 운영 · 읽기 전용 역할을 쓰는 방법: 관리자와 같은 "콘솔에서 역할 전환 → `aws login --profile …`"로 될 것으로 보지만, 역할을 세 개 오가는 흐름은 미확인
- 운영 역할로 옮기면 CloudTrail에 역할 세션으로 남아 "누가 무엇을" 추적이 좋아진다(기대 효과, 실제 기록으로 확인)
- 태그 조건은 Terraform이 만드는 모든 리소스에 태그가 붙어야 동작한다. 태그를 지원하지 않는 리소스 · 동작은 예외로 남는다(그때 목록화)
- 정책 크기 한도: 역할로 옮겨도 관리형 정책 1개당 6,144자는 같다. 태그 조건을 더하면 넘을 수 있어 정책을 나눠야 할 수 있다
- 매일 apply 권한을 바꾸는 작업이라 인프라가 내려가 있는 날 한다

## 5. 새 세션 시작 문장 (복사해서 쓰기)

```text
docs/handoff-2026-11-23-v3-iam.md 읽고 3절 0단계부터 진행해줘.
결정이 필요한 곳(읽기 전용 정책 종류 등)은 공식 문서로 비교한 뒤 추천 하나와 함께 물어봐줘.
```
