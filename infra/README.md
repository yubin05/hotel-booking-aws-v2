# infra 실행 절차 (2단계 이후)

매일 올리고 내리는 순서와 리전 전환(failover) · 되돌리기(failback) 방법입니다. 명령은 Git Bash 기준입니다. 왜 이렇게 했는지는 [04 설계 결정](../docs/04-decisions.md), 실제 시각과 숫자는 [03 결과 표](../docs/03-plan.md)에 있습니다.

| 루트 | 들어 있는 것 | 수명 |
|---|---|---|
| `bootstrap` | state 버킷, IAM(평소 정책 · 역할), ECR, 금고, 예산, Route 53 영역, 사진 · 이관 버킷 | 상시. 관리자만 |
| `seoul` · `tokyo` | `modules/regional`: VPC, NAT, ALB(HTTPS), ECS, RDS, **CloudFront 통로(VPC Origin)** | 쓸 때만. 도쿄는 전환 시험 · DR 때만 |
| `global` | CloudFront, WAF, 인증서(us-east-1), ALB 입구 규칙, `hotel` 레코드 | 서울과 함께 매일 ([ADR-052](../docs/04-decisions.md#adr-052)) |
| `security` | CloudTrail(감사 로그 버킷 90일), GuardDuty(서울 · 도쿄 · us-east-1), 점검(Config + Security Hub CSPM, `posture_check`) | 상시. 관리자만. 점검만 켜고 끔 ([ADR-057](../docs/04-decisions.md#adr-057)) |

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
terraform plan                      # 48 to add (모듈 47: 오토스케일링 대상 · 목표 추적 · 비운 기본 보안 그룹 · 3단계 일회성 태스크 정의 restore · sql(11-18~) 포함 + 통로 1, 예약 이벤트가 있으면 이벤트마다 +2)
date; terraform apply; date         # 약 9분. 이 동안 CloudFront가 서울 VPC에 보안 그룹을 만들어 둠

cd ../global
terraform plan                      # 13 to add (앱 7: 인증서 · 확인 레코드 · 발급 대기 · 입구 · WAF · CloudFront · 레코드
                                    #  + 사진 6: img 확인 레코드 · OAC · 사진 CloudFront · 버킷 정책 서울/도쿄 · img 레코드, ADR-055)
date; terraform apply; date         # 약 4분 반 (2026-11-16)

# 새 RDS에 스키마 · app 계정 · 데이터를 넣는 migrate는 CD가 돌림. 안 돌리면 DB API가 500(Access denied for user 'app')
gh workflow run cd.yml --repo yubin05/hotel-booking-app --ref main
gh run list --repo yubin05/hotel-booking-app --limit 1
```

확인:

```bash
curl -sI https://hotel.vundle34.cloud/ | grep -iE "^HTTP|x-cache"
curl -s https://hotel.vundle34.cloud/api/health/deep            # {"status":"ok","db":"ok"}
# 사진: 200 · image/webp, x-amz-replication-status가 COMPLETED면 서울 S3, REPLICA면 도쿄 S3에서 옴
curl -sI https://img.hotel.vundle34.cloud/hotels/0001/1/640.webp | grep -iE "^HTTP|x-cache|replication"
```

- 사진은 bootstrap 버킷에 상시로 있어 매일 올리지 않습니다. 사진을 바꿀 때만 [scripts/photos](../scripts/photos/README.md)로 올립니다.

## 2. 매일 내리기: global → seoul

global의 CloudFront와 입구 규칙이 서울의 통로 · ALB를 쓰고 있어서 **global을 먼저** 지웁니다. 서울을 먼저 지우면 통로를 못 지우고 멈춥니다.

```bash
cd /c/dev/hotel-booking-aws-v2/infra/global
terraform plan -destroy             # 13 to destroy (사진 버킷 · 사진은 bootstrap이라 남음)
date; terraform destroy; date       # 약 4~5분 (CloudFront 끄고 지우기)

cd ../seoul
terraform plan -destroy             # 48 to destroy (restore · sql 태스크 정의 포함, 기본 보안 그룹은 state에서만 빠짐)
date; terraform destroy; date       # 약 9분 (통로 삭제를 기다려 예전보다 3~4분 김, 2026-11-16 9분 26초)
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
terraform plan                      # 46 to add (서울과 같은 모듈, 오토스케일링 · 기본 보안 그룹 포함)
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
terraform plan -destroy             # 46 to destroy
date; terraform destroy; date
```

## 5. 전환 중 끊김 재기 (선택)

전환 apply 전에 다른 터미널에서 켜 두고, 끝나면 `Ctrl+C`로 멈춥니다.

```bash
while :; do echo "$(date +%T) $(curl -s -m 5 -o /dev/null -D - -w 'code=%{http_code}' https://hotel.vundle34.cloud/api/health | grep -ioE 'x-served-by: [a-z0-9-]+|code=[0-9]+' | tr '\n' ' ')"; sleep 1; done | tee ~/switch-$(date +%H%M).log

grep -vc "code=200" ~/switch-*.log                              # 200이 아닌 줄 수
```

2026-11-15 기록은 [docs/experiments/region-switch](../docs/experiments/region-switch/README.md)에 있습니다.

## 5-1. 오토스케일링 예약 시연 (선택)

쿠폰 오픈처럼 시각을 아는 급증에 앱 태스크를 미리 늘립니다([ADR-015](../docs/04-decisions.md#adr-015)). 서울만 떠 있으면 됩니다.

```bash
# 1) infra/seoul/main.tf의 scale_events에 이벤트를 적음 (한국 시간, apply보다 5분 이상 뒤)
#    { name = "demo-1120", start = "2026-11-20T15:10:00", end = "2026-11-20T15:25:00", min = 4 },
cd /c/dev/hotel-booking-aws-v2/infra/seoul
terraform plan                      # 예약 2개 추가 (시작 · 끝)
date; terraform apply; date

# 2) 시각 전에 감시 시작 (바뀔 때마다 한 줄, 끝낼 시각을 인자로)
cd ../.. && bash scripts/watch-scaling.sh 15:35

# 3) 끝난 뒤 이유가 붙은 기록 (AWS가 6주 보관)
aws application-autoscaling describe-scaling-activities --service-namespace ecs --region ap-northeast-2 \
  --query 'ScalingActivities[].[StartTime,Description,Cause]' --output text
```

- 2026-11-16 시험: 예약 실행이 23 ~ 38초 늦고, 새 태스크가 손님을 받기까지 예약 시각부터 약 1분 반. 끝난 뒤에는 목표 추적이 CPU를 보고 줄임(대기 시간 300초를 적기 전에는 1분마다 하나씩).
- 시연이 끝나면 `scale_events`에서 지난 이벤트를 지우고 apply합니다.

## 5-2. 계정 보안 점검 켜고 끄기 (security)

매일 올리기 · 내리기와 별개인 상시 루트라 destroy하지 않습니다. 점검(Config + Security Hub CSPM)만 변수로 켜고 끕니다.

```bash
cd infra/security
AWS_PROFILE=admin terraform init                                              # 처음 한 번
date; AWS_PROFILE=admin terraform apply -var posture_check=true; date        # 점검 켜기
date; AWS_PROFILE=admin terraform apply; date                                 # 점검 끄기 (CloudTrail · GuardDuty는 남음)
```

- 점검을 켜 두는 동안 Config 구성 항목 1건마다 $0.003입니다. 인프라를 올리고 내리면 그만큼 늘어납니다([ADR-057](../docs/04-decisions.md#adr-057)).
- 끄기 전에 Security Hub 결과(실패 항목 · 고친 것 · 예외)를 03 결과 표에 기록합니다.

## 5-3. 시연 계정 비밀번호 넣기 (한 번, SSM)

호스트 2 · 관리자 1 시연 계정은 migrate가 배포마다 없으면 만듭니다([ADR-060](../docs/03-plan.md#adr-060)). 비밀번호는 저장소 · Terraform 상태 · 대화 기록에 남지 않게 사람이 SSM Parameter Store에 직접 넣습니다. destroy해도 남으므로 한 번만 하면 됩니다. **서울(`demo_accounts = true`)을 올리기 전에 해야** migrate 태스크가 뜹니다.

```bash
# 1) 실행 역할이 파라미터를 읽을 권한 (bootstrap, 1 to change)
cd infra/bootstrap
date; AWS_PROFILE=admin terraform apply; date

# 2) 비밀번호 3개. 화면에 보이지 않게 입력하고 명령 기록에도 남지 않음
#    MSYS_NO_PATHCONV=1: Git Bash가 /로 시작하는 인자를 윈도 경로(C:/Program Files/Git/...)로 바꾸는 것을 막음
for name in host-password/11111111-0000-0000-0000-000000000002 host-password/11111111-0000-0000-0000-000000000003 admin-password; do
  read -rsp "/hotel-booking/$name: " PW; echo
  MSYS_NO_PATHCONV=1 AWS_PROFILE=admin aws ssm put-parameter --region ap-northeast-2 --name "/hotel-booking/$name" --type SecureString --value "$PW"
done; unset PW

# 3) 확인: 이름 3개(값은 안 나옴)
MSYS_NO_PATHCONV=1 AWS_PROFILE=admin aws ssm get-parameters-by-path --region ap-northeast-2 --path /hotel-booking --recursive --query "Parameters[].Name"
```

| 계정 (이메일) | 파라미터 |
|---|---|
| `host1@spongetrip.local` (숙소 6곳) | `/hotel-booking/host-password/11111111-0000-0000-0000-000000000002` |
| `host2@spongetrip.local` (숙소 4곳) | `/hotel-booking/host-password/11111111-0000-0000-0000-000000000003` |
| `admin@spongetrip.local` | `/hotel-booking/admin-password` |

- 이미 있는 계정의 비밀번호는 migrate가 바꾸지 않습니다. 값을 바꿨으면 서울을 내렸다 올려 DB가 새로 생길 때 반영됩니다.
- 도쿄 복원(5단계)은 `demo_accounts = false`라 이 파라미터를 참조하지 않습니다.

## 5-4. 덤프 이관 (3단계, 한 번)

옛 환경(IDC 역할) DB를 서울 RDS로 옮깁니다([ADR-008](../docs/04-decisions.md#adr-008)). 덤프는 PC에서 잠가 S3에 잠깐 맡기고, 서울 일회성 태스크가 받아 풀어 넣습니다. 근거 · 단계 표 · 예측은 [3단계 실행 계획](../docs/experiments/migration.md) 1절. 점검 창은 고객사와 합의한 새벽 03:00 ~ 04:00로 가정하고, 시험은 같은 절차로 합니다.

```bash
# 0) 처음 한 번: 이관 버킷 (bootstrap, 4 to add: 버킷 · 공개 차단 · HTTPS만 정책 · 1일 뒤 삭제)
cd /c/dev/hotel-booking-aws-v2/infra/bootstrap
date; AWS_PROFILE=admin terraform apply; date

# 1) 올리기: 옛 환경(+ 발생기) → 서울 → global. 서울 CD(migrate)는 돌리지 않음 (빈 RDS에 시드가 들어가 복원과 겹침)
cd /c/dev/hotel-booking-app/legacy
date; terraform apply -var is_load_test=true; date   # 19개
bash start-db.sh && bash start-app.sh yubin05/hotel-booking-aws-v2:<태그>
cd /c/dev/hotel-booking-aws-v2/infra/seoul
terraform plan                      # 48 to add (1번 매일 올리기와 같음)
date; terraform apply; date
cd ../global
# k6 발생기 IP를 WAF 요청 수 한도에서만 뺌 (관리형 규칙은 그대로). 평소 apply에는 안 붙임
LOAD_IP=$(terraform -chdir=/c/dev/hotel-booking-app/legacy output -raw load_test_instance_1_public_ip | tr -d '\r')
terraform plan -var "loadtest_ips=[\"$LOAD_IP/32\"]"      # 14 to add (매일 13 + 발생기 IP 세트. 허용 규칙은 웹 ACL 안)
date; terraform apply -var "loadtest_ips=[\"$LOAD_IP/32\"]"; date

# 2) 사전 (손님 영향 없음). 관리자 세션은 1시간이라 여기서 새로 로그인
aws login --profile admin
eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy
cd /c/dev/hotel-booking-aws-v2
bash migration/cutover.sh prep      # 키를 SSM에, 점검 페이지 준비, 표지 손님 가입. 끝에 "준비 끝"

# 3) 중단 구간 ⑤ → ⑩ (점검 페이지 → 덤프 · 잠가 올리기 → 복원 → 체크섬 → migrate → 새 주소 예약)
bash migration/cutover.sh run       # 끝에 "중단 시간 N분 N초", 덤프 · 키는 자동으로 지움

# 실패하면: 40분 안에 고쳐 다시 run, 아니면 되돌림 (옛 DB는 읽기만 해서 그대로)
bash migration/cutover.sh rollback
bash migration/cutover.sh cleanup   # 되돌렸을 때 덤프 · 키 지우기
```

- 결과는 `migration/results/cutover-<시각>/`(git에 안 올라감): `steps.log` 단계 시각, `poll.log` 1초 기록, `legacy.sum` · `rds.sum` 체크섬. 결과 표는 03에 적습니다.
- 처음 접속하는 서버 지문을 물으면 `yes`(prep에서 한 번).
- 이관 뒤 옛 주소는 점검 페이지(503)로 남습니다. 옛 환경은 k6 발생기 때문에 그날 끝까지 둡니다.
- 이관 뒤 1단계와 같은 k6: `cd load && TARGET=aws bash run-baseline.sh` × 3(37분씩, 대상만 새 주소). 계획은 [3단계 계획](../docs/experiments/migration.md) 2절. 끝나면 **서울 destroy 전에** 관리자로:

```bash
cd /c/dev/hotel-booking-aws-v2
bash load/cw-metrics.sh load/results/baseline-aws-*        # 회차마다 서울 서버 지표(CloudWatch 1분)를 cw.json으로
for f in load/results/baseline-aws-2*/*.json.gz; do node scripts/baseline-report.mjs "$f"; done   # 층별 표 + 서울 서버 지표
bash migration/sql.sh scripts/check-consistency.sql       # 정합성 검사를 RDS에서 (서울 안 일회성 태스크 sql, 약 1분)
```

## 5-5. 쿠폰 오픈 스파이크 (3단계)

정해진 시각 T에 쿠폰 100장을 열고 1,000명이 함께 누릅니다([3단계 계획](../docs/experiments/migration.md) 3절). 이관 · k6 비교 뒤 같은 날, 옛 환경 발생기 · 서울 · global(WAF 예외)이 떠 있을 때 합니다. 관리자 로그인이 필요합니다.

```bash
cd /c/dev/hotel-booking-aws-v2
# 1) 예약 스케일링 없이 3회: 태스크 2개 · 예약 0일 때(스크립트가 확인). T는 지금보다 5분 이상 뒤, 회차 사이 10분
bash load/run-coupon.sh 14:00 none
bash load/run-coupon.sh 14:10 none
bash load/run-coupon.sh 14:20 none

# 2) 있게 3회: 예약 하나로 묶음. infra/seoul/main.tf의 scale_events에 첫 T 5분 전 ~ 마지막 T + 10분 (한국 시간)
#    { name = "coupon-1118", start = "2026-11-18T14:40:00", end = "2026-11-18T15:15:00", min = 4 },
cd infra/seoul && date; terraform apply; date; cd ../..     # 예약 2개 추가
bash load/run-coupon.sh 14:45 scheduled
bash load/run-coupon.sh 14:55 scheduled
bash load/run-coupon.sh 15:05 scheduled

# 3) 서울 destroy 전에: CloudWatch 지표를 받고 보고서 (정상 태스크 수 · CPU 칸이 채워짐)
bash load/cw-metrics.sh load/results/coupon-*
node scripts/coupon-report.mjs load/results/coupon-*/coupon-*.json.gz
```

- k6 비교 뒤 태스크가 늘어 있으면, 목표 추적이 2개로 줄이기까지 15분 넘게 걸릴 수 있습니다(줄이기 경보: CPU 54% 미만 1분 × 15번, 11-16 시험). `run-coupon.sh none`이 태스크 수를 보고 멈추면 기다렸다 다시 합니다.
- 끝나면 `scale_events`에서 이벤트를 지우고 apply합니다(5-1과 같음).
- 회차 결과: `load/results/coupon-<조건>-<시각>/`. `verify.txt`는 발급 수 = 장 수(초과 0), 받은 줄 수 = 받은 사람 수(1인 1매)입니다.

## 6. 자주 만난 문제

| 증상 | 원인 | 할 일 |
|---|---|---|
| apply 끝에 `failed to upload state ... ExpiredToken` | 관리자 프로필이 남은 터미널에서 긴 apply가 돌다 세션 만료 | `unset AWS_PROFILE` → 평소 사용자로 `plan`. apply 도중 중간 저장된 state가 있어 남은 것만 나옴 → 그만큼 apply |
| global plan에서 `no matching EC2 Security Group found` | 리전 apply 직후라 CloudFront 보안 그룹이 아직 없음(비동기로 1~2분 뒤 생김) | 1~2분 뒤 다시 plan |
| DB를 쓰는 API가 500, 앱 로그에 `Access denied for user 'app'` | 새 RDS인데 CD(migrate)를 아직 안 돌림 | 1절의 `gh workflow run cd.yml` |
| `Value for undeclared variable "active_region"` | global이 아닌 폴더에서 실행 | 프롬프트의 폴더 확인 → `infra/global` |
| 같은 PC에서 로그인 · 가입이 403 | WAF 로그인 한도(IP당 5분 100번)에 걸림 | 몇 분 뒤 풀림([10 보안 점검](../docs/10-security.md)) |
| `ssm put-parameter`가 `Parameter name must be a fully qualified name` | Git Bash가 `/hotel-booking/...`를 `C:/Program Files/Git/hotel-booking/...`로 바꿔 넘김 (2026-11-18) | 명령 앞에 `MSYS_NO_PATHCONV=1` (런북 5-3) |
| 같은 이메일 로그인이 429 | 계정 잠금(15분 안에 5번 틀림, [ADR-054](../docs/04-decisions.md#adr-054)) | 15분 뒤 풀림 |
