# infra 실행 절차 (2단계 이후)

매일 올리고 내리는 순서와 리전 전환(failover) · 되돌리기(failback) 방법입니다. 명령은 Git Bash 기준입니다. 왜 이렇게 했는지는 [04 설계 결정](../docs/04-decisions.md), 실제 시각과 숫자는 [03 결과 표](../docs/03-plan.md)에 있습니다.

| 루트 | 들어 있는 것 | 수명 |
|---|---|---|
| `bootstrap` | state 버킷, IAM(평소 정책 · 역할), ECR, 금고, 예산, Route 53 영역 | 상시. 관리자만 |
| `seoul` · `tokyo` | `modules/regional`: VPC, NAT, ALB(HTTPS), ECS, RDS, **CloudFront 통로(VPC Origin)** | 쓸 때만. 도쿄는 전환 시험 · DR 때만 |
| `global` | CloudFront, WAF, 인증서(us-east-1), ALB 입구 규칙, `hotel` 레코드 | 서울과 함께 매일 ([ADR-052](../docs/04-decisions.md#adr-052)) |

## 0. 시작 전

```bash
unset AWS_PROFILE
aws sts get-caller-identity --query Arn --output text   # user/vundle34 (평소 사용자)여야 함
```

- 세션이 끝났으면 `aws login`(평소) / `aws login --profile admin`(관리자, 1시간).
- **관리자 명령은 그 명령 앞에만 붙입니다:** `AWS_PROFILE=admin terraform apply`. `export AWS_PROFILE=admin`은 쓰지 않습니다. 남은 관리자 프로필로 긴 apply가 돌다 세션이 끝나면 state 저장이 실패합니다(2026-11-15 도쿄).
- apply · destroy는 `date; terraform apply; date`로 시각을 남기고, plan 숫자를 먼저 예측합니다.

## 1. 매일 올리기: seoul → global → CD

```bash
cd /c/dev/hotel-booking-aws-v2/infra/seoul
terraform plan                      # 43 to add (모듈 42 + 통로 1)
date; terraform apply; date         # 약 9분. 이 동안 CloudFront가 서울 VPC에 보안 그룹을 만들어 둠

cd ../global
terraform plan                      # 7 to add (인증서 · 확인 레코드 · 발급 대기 · 입구 · WAF · CloudFront · 레코드)
date; terraform apply; date

# 새 RDS에 스키마 · app 계정 · 데이터를 넣는 migrate는 CD가 돌림. 안 돌리면 DB API가 500(Access denied for user 'app')
gh workflow run cd.yml --repo yubin05/hotel-booking-app --ref main
gh run list --repo yubin05/hotel-booking-app --limit 1
```

확인:

```bash
curl -sI https://hotel.vundle34.cloud/ | grep -iE "^HTTP|x-cache"
curl -s https://hotel.vundle34.cloud/api/health/deep            # {"status":"ok","db":"ok"}
```

## 2. 매일 내리기: global → seoul

global의 CloudFront와 입구 규칙이 서울의 통로 · ALB를 쓰고 있어서 **global을 먼저** 지웁니다. 서울을 먼저 지우면 통로를 못 지우고 멈춥니다.

```bash
cd /c/dev/hotel-booking-aws-v2/infra/global
terraform plan -destroy             # 7 to destroy
date; terraform destroy; date       # 약 4~5분 (CloudFront 끄고 지우기)

cd ../seoul
terraform plan -destroy             # 43 to destroy
date; terraform destroy; date       # 약 9분 (통로 삭제를 기다려 예전보다 3~4분 김)
```

남은 자원 확인(관리자 · 서울):

```bash
AWS_PROFILE=admin aws ec2 describe-vpcs --region ap-northeast-2 --filters Name=cidr,Values=10.0.0.0/16 --query 'length(Vpcs)'
AWS_PROFILE=admin aws rds describe-db-instances --region ap-northeast-2 --query 'length(DBInstances)'
AWS_PROFILE=admin aws ec2 describe-addresses --region ap-northeast-2 --query 'length(Addresses)'
```

## 3. 리전 전환(failover): 서울 → 도쿄

CloudFront 원본만 바꾸고 DNS는 그대로 둡니다([ADR-012](../docs/04-decisions.md#adr-012) · [ADR-035](../docs/04-decisions.md#adr-035)). DB 복원은 5단계 드릴에서 절차를 정합니다.

```bash
# 1) 도쿄 올리기: 통로까지 같이 만들어짐(9분 남짓). 그 사이 CloudFront가 도쿄 VPC에 보안 그룹을 만들어 둠
cd /c/dev/hotel-booking-aws-v2/infra/tokyo
terraform plan                      # 43 to add
date; terraform apply; date

# 2) (5단계에서 정함) 도쿄 RDS 복원 · 기능 검증

# 3) 전환: 도쿄 입구 열기 → CloudFront 원본 교체 → 서울 입구 닫기
cd ../global
terraform plan  -var active_region=ap-northeast-1    # 1 to add, 1 to change, 1 to destroy (입구가 +/-)
date; terraform apply -var active_region=ap-northeast-1; date   # 2026-11-15: 1분 27초, 손님 오류 0
```

- **전환한 동안은 global의 모든 plan · apply에 `-var active_region=ap-northeast-1`을 붙입니다.** 빼면 기본값(서울)으로 되돌아갑니다.
- plan에서 `no matching EC2 Security Group found`가 나면 도쿄 apply 직후라 보안 그룹이 아직 없는 것입니다. 1~2분 뒤 다시 plan합니다. plan 단계에서 멈추므로 손님 영향은 없습니다.
- 실제 서울 장애에서는 서울 API가 안 돼 "서울 입구 닫기"가 실패할 수 있습니다(원본 교체 뒤라 손님 영향은 없음, 가설). 5단계에서 확인합니다.

## 4. 되돌리기(failback): 도쿄 → 서울

```bash
# 1) 서울이 내려가 있으면 올리기 (1절의 seoul apply). DB를 서울로 되돌리는 방법은 5단계에서 정함

# 2) 전환: 서울 입구 열기 → 원본 교체 → 도쿄 입구 닫기
cd /c/dev/hotel-booking-aws-v2/infra/global
terraform plan                      # 1 to add, 1 to change, 1 to destroy
date; terraform apply; date         # 2026-11-15: 1분 1초, 손님 오류 0

# 3) 도쿄 내리기 (global이 서울을 가리킨 뒤에만)
cd ../tokyo
terraform plan -destroy             # 43 to destroy
date; terraform destroy; date
```

## 5. 전환 중 끊김 재기 (선택)

전환 apply 전에 다른 터미널에서 켜 두고, 끝나면 `Ctrl+C`로 멈춥니다.

```bash
while :; do echo "$(date +%T) $(curl -s -m 5 -o /dev/null -D - -w 'code=%{http_code}' https://hotel.vundle34.cloud/api/health | grep -ioE 'x-served-by: [a-z0-9-]+|code=[0-9]+' | tr '\n' ' ')"; sleep 1; done | tee ~/switch-$(date +%H%M).log

grep -vc "code=200" ~/switch-*.log                              # 200이 아닌 줄 수
```

2026-11-15 기록은 [docs/experiments/region-switch](../docs/experiments/region-switch/README.md)에 있습니다.

## 6. 자주 만난 문제

| 증상 | 원인 | 할 일 |
|---|---|---|
| apply 끝에 `failed to upload state ... ExpiredToken` | 관리자 프로필이 남은 터미널에서 긴 apply가 돌다 세션 만료 | `unset AWS_PROFILE` → 평소 사용자로 `plan`. apply 도중 중간 저장된 state가 있어 남은 것만 나옴 → 그만큼 apply |
| global plan에서 `no matching EC2 Security Group found` | 리전 apply 직후라 CloudFront 보안 그룹이 아직 없음(비동기로 1~2분 뒤 생김) | 1~2분 뒤 다시 plan |
| DB를 쓰는 API가 500, 앱 로그에 `Access denied for user 'app'` | 새 RDS인데 CD(migrate)를 아직 안 돌림 | 1절의 `gh workflow run cd.yml` |
| `Value for undeclared variable "active_region"` | global이 아닌 폴더에서 실행 | 프롬프트의 폴더 확인 → `infra/global` |
| 같은 PC에서 로그인 · 가입이 403 | WAF 로그인 한도(IP당 5분 100번)에 걸림 | 몇 분 뒤 풀림([10 보안 점검](../docs/10-security.md)) |
| 같은 이메일 로그인이 429 | 계정 잠금(15분 안에 5번 틀림, [ADR-054](../docs/04-decisions.md#adr-054)) | 15분 뒤 풀림 |
