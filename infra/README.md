# infra 실행 절차 (2단계 이후)

매일 올리고 내리는 순서와 리전 전환(failover) · 되돌리기(failback) 방법입니다. 명령은 Git Bash 기준입니다. 왜 이렇게 했는지는 [04 설계 결정](../docs/04-decisions.md), 실제 시각과 숫자는 [03 결과 표](../docs/03-plan.md)에 있습니다.

| 루트 | 들어 있는 것 | 수명 |
|---|---|---|
| `bootstrap` | state 버킷, IAM(평소 정책 · 역할), ECR, 금고, 예산, Route 53 영역, 사진 · 이관 버킷, SES 도메인 · 장애 알림 주제 · Slack 연결([ADR-071](../docs/04-decisions.md#adr-071)) | 상시. 관리자만 |
| `seoul` · `tokyo` | `modules/regional`: VPC, NAT, ALB(HTTPS), ECS, RDS, **CloudFront 통로(VPC Origin)** | 쓸 때만. 도쿄는 전환 시험 · DR 때만 |
| `global` | CloudFront, WAF, 인증서(us-east-1), ALB 입구 규칙, `hotel` 레코드 | 서울과 함께 매일 ([ADR-052](../docs/04-decisions.md#adr-052)) |
| `security` | CloudTrail(감사 로그 버킷 90일), GuardDuty(서울 · 도쿄 · us-east-1), 점검(Config + Security Hub CSPM, `posture_check`) | 상시. 관리자만. 점검만 켜고 끔 ([ADR-057](../docs/04-decisions.md#adr-057)) |

## 0. 시작 전

```bash
unset AWS_PROFILE
aws sts get-caller-identity --query Arn --output text   # user/vundle34 (평소 사용자)여야 함
```

- 세션이 끝났으면 `aws login`(평소) / `aws login --profile admin`(관리자, 콘솔에서 역할을 전환한 때부터 2시간).
- **변수는 `-var` 대신 각 루트의 `terraform.tfvars`에 씁니다(2026-11-22~).** 파일은 커밋하지 않고(`.gitignore`), 쓸 수 있는 줄은 루트마다 `terraform.tfvars.example`에 있습니다. Terraform 문서도 평소에는 파일을 권하고(*"In most cases we recommend using the `-var-file` option instead"*, [plan](https://developer.hashicorp.com/terraform/cli/commands/plan)), CLI 값은 일회성 덮어쓰기용으로 둡니다([변수](https://developer.hashicorp.com/terraform/language/values/variables)). `terraform.tfvars`는 자동으로 읽힙니다. 우리에겐 "다음 apply에서 `-var`를 빼먹어 설정이 되돌아가는" 사고(예: 도쿄 전환 중 global apply가 서울로 돌아감)를 막는 효과가 큽니다. 실험이 끝나면 그 줄을 지우고 apply합니다.
- **관리자 명령은 그 명령 앞에만 붙입니다:** `AWS_PROFILE=admin terraform apply`. `export AWS_PROFILE=admin`은 쓰지 않습니다. 남은 관리자 프로필로 긴 apply가 돌다 세션이 끝나면 state 저장이 실패합니다(2026-11-15 도쿄).
- apply · destroy는 `date; terraform apply; date`로 시각을 남기고, plan 숫자를 먼저 예측합니다.
- 측정 · 드릴 날은 먼저 `bash scripts/preflight.sh`(읽기만): 도구 · SSH 키 · `~/.hotel-legacy` · legacy tfvars의 IP = 지금 IP · 루트마다 `terraform init`을 확인하고 NG만 고칩니다.

## 1. 매일 올리기: seoul → global → CD

```bash
cd /c/dev/hotel-booking-aws-v2/infra/seoul
terraform plan                      # 50 to add (모듈 49: 관제 대시보드 · 오토스케일링 대상 · 목표 추적 · 비운 기본 보안 그룹 · 3단계 일회성 태스크 정의 restore · sql(11-18~) · dump(11-19~) 포함 + 통로 1, 예약 이벤트가 있으면 이벤트마다 +2)
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
# 점검 안내 페이지(ADR-070): 200 · text/html. 앱 서버가 없을 때 502 · 503 · 504 응답 대신 이 내용이 나옴(상태 코드는 그대로)
curl -sI https://hotel.vundle34.cloud/maintenance/index.html | grep -iE "^HTTP|content-type"
```

- 점검 안내 페이지도 사진 창고(`maintenance/index.html`, bootstrap이 올림)에 상시로 있습니다. 문구는 `infra/bootstrap/maintenance.html`을 고친 뒤 bootstrap 관리자 apply.
- 사진은 bootstrap 버킷에 상시로 있어 매일 올리지 않습니다. 사진을 바꿀 때만 [scripts/photos](../scripts/photos/README.md)로 올립니다.

## 2. 매일 내리기: global → seoul

global의 CloudFront와 입구 규칙이 서울의 통로 · ALB를 쓰고 있어서 **global을 먼저** 지웁니다. 서울을 먼저 지우면 통로를 못 지우고 멈춥니다.

```bash
cd /c/dev/hotel-booking-aws-v2/infra/global
terraform plan -destroy             # 13 to destroy (사진 버킷 · 사진은 bootstrap이라 남음)
date; terraform destroy; date       # 약 4~5분 (CloudFront 끄고 지우기)

cd ../seoul
terraform plan -destroy             # 50 to destroy (restore · sql · dump 태스크 정의 · 관제 대시보드 포함, 기본 보안 그룹은 state에서만 빠짐)
date; terraform destroy; date       # 약 9분 (통로 삭제를 기다려 예전보다 3~4분 김, 2026-11-16 9분 26초)
```

남은 자원 확인(관리자 · 서울):

```bash
AWS_PROFILE=admin aws ec2 describe-vpcs --region ap-northeast-2 --filters Name=cidr,Values=10.0.0.0/16 --query 'length(Vpcs)'
AWS_PROFILE=admin aws rds describe-db-instances --region ap-northeast-2 --query 'length(DBInstances)'
AWS_PROFILE=admin aws ec2 describe-addresses --region ap-northeast-2 --query 'length(Addresses)'
```

## 3. 리전 전환(failover): 서울 → 도쿄

CloudFront 원본만 바꾸고 DNS는 그대로 둡니다([ADR-012](../docs/04-decisions.md#adr-012) · [ADR-035](../docs/04-decisions.md#adr-035)). 이 절은 빈 DB로 바꾸는 전환 PoC입니다. 도쿄 복제본을 승격해 DB까지 살리고 되돌리는 드릴은 5-8(`drill/region.sh`)이 한 번에 합니다.

```bash
# 1) 도쿄 올리기: 통로까지 같이 만들어짐(9분 남짓). 그 사이 CloudFront가 도쿄 VPC에 보안 그룹을 만들어 둠
cd /c/dev/hotel-booking-aws-v2/infra/tokyo
terraform plan                      # 50 to add (서울과 같은 모듈 + 일회성 태스크 정의 restore · sql · dump(11-19~), 관제 대시보드 · 오토스케일링 · 기본 보안 그룹 포함)
date; terraform apply; date

# 2) DB까지 살리는 실제 전환(복제본 승격)은 5-8 드릴에서 (region.sh standby · run, ADR-066)

# 3) 전환: 도쿄 입구 열기 → CloudFront 원본 교체 → 서울 입구 닫기
cd ../global
echo 'active_region = "ap-northeast-1"' >> terraform.tfvars
terraform plan                      # 1 to add, 1 to change, 1 to destroy (입구가 +/-)
date; terraform apply; date         # 2026-11-15: 1분 27초, 손님 오류 0
```

- **전환한 동안은 `infra/global/terraform.tfvars`에 `active_region = "ap-northeast-1"`을 둡니다.** 그 줄을 지우고 apply하면 기본값(서울)으로 되돌아갑니다(4절).
- plan에서 `no matching EC2 Security Group found`가 나면 도쿄 apply 직후라 보안 그룹이 아직 없는 것입니다. 1~2분 뒤 다시 plan합니다. plan 단계에서 멈추므로 손님 영향은 없습니다.
- 실제 서울 장애에서는 서울 API가 안 돼 "서울 입구 닫기"가 실패할 수 있습니다(원본 교체 뒤라 손님 영향은 없음, 가설). 5단계에서 확인합니다.

## 4. 되돌리기(failback): 도쿄 → 서울

```bash
# 1) 서울이 내려가 있으면 올리기 (1절의 seoul apply). DB를 서울로 되돌리는 덤프 이관은 5-8 드릴이 함

# 2) 전환: 서울 입구 열기 → 원본 교체 → 도쿄 입구 닫기
cd /c/dev/hotel-booking-aws-v2/infra/global
terraform plan                      # 1 to add, 1 to change, 1 to destroy
date; terraform apply; date         # 2026-11-15: 1분 1초, 손님 오류 0

# 3) 도쿄 내리기 (global이 서울을 가리킨 뒤에만)
cd ../tokyo
terraform plan -destroy             # 50 to destroy (관제 대시보드 포함)
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
echo 'posture_check = true' >> terraform.tfvars
date; AWS_PROFILE=admin terraform apply; date                                 # 점검 켜기
sed -i '/^posture_check/d' terraform.tfvars
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
grep -q '^is_load_test' terraform.tfvars || echo 'is_load_test = true' >> terraform.tfvars   # 고객사 legacy 루트도 tfvars로. 끝나면 줄을 지움
date; terraform apply; date   # 19개
bash start-db.sh && bash start-app.sh yubin05/hotel-booking-aws-v2:<태그>
cd /c/dev/hotel-booking-aws-v2/infra/seoul
terraform plan                      # 51 to add (1번 매일 올리기와 같음)
date; terraform apply; date
cd ../global
# k6 발생기 IP를 WAF 요청 수 한도에서만 뺌 (관리형 규칙은 그대로). 평소 apply에는 안 붙임
LOAD_IP=$(terraform -chdir=/c/dev/hotel-booking-app/legacy output -raw load_test_instance_1_public_ip | tr -d '\r')
echo "loadtest_ips = [\"$LOAD_IP/32\"]" >> terraform.tfvars   # 시험이 끝나면 이 줄을 지우고 apply (발생기 IP 반납 전에)
terraform plan                      # 14 to add (매일 13 + 발생기 IP 세트. 허용 규칙은 웹 ACL 안)
date; terraform apply; date

# 2) 사전 (손님 영향 없음). 관리자 세션은 2시간(11-21부터, 콘솔 역할 전환 시점부터)이라 여기서 새로 로그인
aws login --profile admin
eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy
cd /c/dev/hotel-booking-aws-v2
bash migration/cutover.sh prep      # 키를 SSM에, 점검 페이지 준비, 표지 손님 가입. 끝에 "준비 끝"

# 2-1) 리허설 (손님 영향 없음, 5 ~ 10분): 점검 페이지 없이 덤프 → S3 → 복원 태스크 → 체크섬. AWS 쪽을 진짜 이관 전에 시험
bash migration/cutover.sh rehearse  # 끝에 "리허설 끝". 막히면 고치고 다시 (RDS는 run이 덮어씀)

# 3) 중단 구간 ⑤ → ⑩ (점검 페이지 → 덤프 · 잠가 올리기 → 복원 → 체크섬 → migrate → 새 주소 예약)
bash migration/cutover.sh run       # 끝에 "중단 시간 N분 N초", 덤프 · 키는 자동으로 지움

# 실패하면: 40분 안에 고쳐 다시 run, 아니면 되돌림 (옛 DB는 읽기만 해서 그대로)
bash migration/cutover.sh rollback
bash migration/cutover.sh cleanup   # 되돌렸을 때 덤프 · 키 지우기
```

- 결과는 `migration/results/cutover-<시각>/`(git에 안 올라감): `steps.log` 단계 시각, `poll.log` 1초 기록, `legacy.sum` · `rds.sum` 체크섬. 결과 표는 03에 적습니다.
- 처음 접속하는 서버 지문을 물으면 `yes`(prep에서 한 번).
- **다시 찍기(녹화 등):** 다른 날은 인프라를 올리면 DB가 새것이라 `prep` → `run`만 하면 됩니다. 같은 날 여러 번은 `bash migration/cutover.sh reset`(yes 확인: 옛 앱 되살리기 + 새 DB 비우기 + 앱 계정 삭제, 약 1분) → `prep` → `run`. 녹화 순서 · 화면 배치는 5-6.
- 이관 뒤 옛 주소는 점검 페이지(503)로 남습니다. 옛 환경은 k6 발생기 때문에 그날 끝까지 둡니다.
- 이관 뒤 1단계와 같은 k6 3회는 **한 회차씩** 합니다. 묶음(`bash load/run-baseline-x3.sh`, 약 2시간)은 관리자 세션(1시간)이 끝나 회차 사이에서 멈췄습니다(2026-11-20 `ExpiredTokenException`). 계획은 [3단계 계획](../docs/experiments/migration.md) 2절. 회차마다:

```bash
cd /c/dev/hotel-booking-aws-v2
aws ecs describe-services --cluster hotel-booking-aws-v2 --services app --region ap-northeast-2 --query 'services[0].[desiredCount,runningCount]' --output text   # "2 2"일 때 시작 (앞 회차 뒤 줄기까지 15분 넘게 걸릴 수 있음)
TARGET=aws bash load/run-baseline.sh                                  # 37분. 태스크 수 5초 기록(tasks.log)도 같이
aws login --profile admin                                             # 끝나면 바로 (1초 지표는 시작부터 3시간만 남음)
bash load/cw-metrics.sh "$(ls -td load/results/baseline-aws-2* | head -1)"
```

3회가 끝나면(또는 한 회차가 끊겨 따로 할 때) 아래를 **서울 destroy 전에** 관리자로:

```bash
cd /c/dev/hotel-booking-aws-v2
bash load/cw-metrics.sh load/results/baseline-aws-*        # 회차마다 서울 서버 지표(CloudWatch 1분)를 cw.json으로
for f in load/results/baseline-aws-2*/*.json.gz; do node scripts/baseline-report.mjs "$f"; done   # 층별 표 + 서울 서버 지표
bash migration/sql.sh scripts/check-consistency.sql       # 정합성 검사를 RDS에서 (서울 안 일회성 태스크 sql, 약 1분)
```

## 5-5. 쿠폰 오픈 스파이크 (3단계)

정해진 시각 T에 쿠폰 100장을 열고 1,000명이 함께 누릅니다([3단계 계획](../docs/experiments/migration.md) 3절). 이관 · k6 비교 뒤 같은 날, 옛 환경 발생기 · 서울 · global(WAF 예외)이 떠 있을 때 합니다. 관리자 로그인이 필요합니다.

- **Grafana 실시간 전송(2026-11-20, [ADR-064](../docs/04-decisions.md#adr-064)):** PC에 `~/.hotel-legacy/grafana.env`(Grafana Cloud 원격 쓰기 주소 · 사용자 · 쓰기 토큰, `chmod 600`)가 있으면 `run-coupon.sh`가 k6 지표를 Grafana Cloud로 1초마다 보냅니다(`testid` = 회차 이름). 시작할 때 `Grafana 전송: 켬/끔`이 나오고, 토큰 파일은 회차가 끝나면 발생기에서 지웁니다. CloudWatch 패널은 bootstrap의 `grafana_read` 역할(관리자 apply, `terraform.tfvars`에 Grafana 계정 ID · 외부 ID)
- **서버 2대로 묶기 · 풀기 (fixed2 회차, 2026-11-20):** 최소 · 최대는 예약 스케일링이 바꾸므로 Terraform이 관리하지 않아(`ignore_changes`) 명령으로 묶고 풉니다(평소 사용자). 묶으면 몰려드는 동안에도 2대 그대로, fixed2 회차가 다 끝나면 꼭 풉니다
  ```bash
  aws application-autoscaling register-scalable-target --service-namespace ecs --resource-id service/hotel-booking-aws-v2/app --scalable-dimension ecs:service:DesiredCount --region ap-northeast-2 --min-capacity 2 --max-capacity 2   # 묶기
  aws application-autoscaling register-scalable-target --service-namespace ecs --resource-id service/hotel-booking-aws-v2/app --scalable-dimension ecs:service:DesiredCount --region ap-northeast-2 --min-capacity 2 --max-capacity 4   # 풀기
  ```
- **관리자 세션(1시간):** 3회 묶음은 회차 사이 대기 중에 끊길 수 있어(11-20 k6 비교에서 겪음) 한 회차씩 하고 회차마다 먼저 `aws login --profile admin`
- **Grafana 관제실 처음 준비(한 번):** ① bootstrap에 Grafana 값을 넣고(`terraform.tfvars`, [새 PC 설정](../docs/pc-setup.md)) `AWS_PROFILE=admin terraform apply` → `AWS_PROFILE=admin terraform output -raw grafana_read_role_arn` ② Grafana → Connections → CloudWatch 데이터 소스 → Settings의 Assume Role ARN에 붙이고 Default Region `ap-northeast-2` → Save & test ③ Dashboards → New → Import → [load/grafana/coupon-dashboard.json](../load/grafana/coupon-dashboard.json) 올리고 Prometheus · CloudWatch 고르기 ④ 대시보드 Share → Share externally → Anyone with the link(시간 범위 바꾸기는 끔). 실험 날이 아니면 Pause access. 만든 링크(LIVE, 2026-11-20): https://zestyjungle807.grafana.net/public-dashboards/15c00b34bed84915a1169bff946af122 (11-20 16:4x에 대시보드를 덮어써 다시 만듦. 덮어쓰면 공유가 지워져 새 링크가 생김)

묶음 스크립트(2026-11-19): T를 10분 간격으로 잡고 회차마다 `cw-metrics.sh`까지 합니다.

```bash
cd /c/dev/hotel-booking-aws-v2
bash load/run-coupon-x3.sh none                 # 없이 3회: 회차마다 태스크 2개를 기다린 뒤 T = 지금 + 6분
bash load/run-coupon-x3.sh plan 15:00           # 있게 전에: scale_events 한 줄을 보여 줌 → seoul/main.tf에 넣고 서울 apply
bash load/run-coupon-x3.sh scheduled 15:00      # 있게 3회 (15:00 · 15:10 · 15:20)
```

한 회차씩 직접 할 때:

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

## 5-6. 관제 화면 · 녹화 (3단계)

서울(또는 도쿄)을 apply하면 CloudWatch 대시보드 `hotel-booking-aws-v2-<리전>`이 같이 생깁니다([ADR-061](../docs/04-decisions.md#adr-061)). 녹화는 apply 직후 바로 할 수 있습니다.

1. 콘솔 → CloudWatch → 대시보드 → `hotel-booking-aws-v2-ap-northeast-2`
2. 시간 범위는 저장된 최근 15분 그대로, 새로고침은 10초(최소), 브라우저 전체 화면(F11)으로 한 화면에 3 × 3칸
3. 1줄 손님 체감(1초) → 2줄 용량 → 3줄 DB. 칸마다 기준선(p95 1초 · 태스크 최소 2 / 최대 4 · CPU 늘리기 60% · RDS 한계 90% · 연결 예산 48)
4. **회차가 끝날 때마다** `bash load/cw-metrics.sh load/results/<회차 폴더>`(관리자, 묶음 스크립트는 자동). 1초 지표는 3시간만 남아, 재생 페이지를 만들 원본을 그때 받아 둡니다. 스케일링 결정(`scaling.json`) · ECS 이벤트(`ecs-service.json`, 최근 100개만 남음) · 태스크 크기(`task-def.json`) · 커밋도 같이 받습니다. 회차 동안의 태스크 수는 `run-baseline.sh`(aws) · `run-coupon.sh`가 뒤에서 `load/record-tasks.sh`로 5초마다 `tasks.log`에 남깁니다(평소 사용자)

- 녹화 · 영상은 2026-12-01 이후로 미뤘습니다([ADR-063](../docs/03-plan.md#adr-063)). 이 화면은 시험 중 관제용입니다

- 1초 주기: 대시보드 본문 문서는 최소 60초라고 적지만, 2026-11-18 시험용 대시보드에 `period: 1`을 넣어 보니 검증 메시지 없이 받아들여졌다(바로 지움). 실제로 1초 간격으로 그려지는지는 서울을 올린 날 화면으로 확인하고, 안 그려지면 녹화 때 콘솔에서 주기를 1초로 고릅니다.
- 대시보드를 만드는 권한은 평소 정책에 있습니다(이름 `hotel-booking-aws-v2-*`만). 이 권한을 넣는 bootstrap apply(1 to change)가 서울 apply보다 먼저입니다.

## 5-7. 장애 테스트 (4단계)

서울에 장애를 넣고 손님이 본 오류와 회복 시간을 잽니다([4단계 계획](../docs/experiments/faults.md)). 옛 환경 · 발생기는 필요 없습니다(손님 역할은 PC의 `drill/writer.mjs`, 초당 5건). 서울 · global과 관리자 로그인이 필요합니다.

```bash
# 태스크 종료 · 깨진 배포: 평소 서울. RDS · AZ: Multi-AZ로 (NAT 2 + RDS Multi-AZ, 시간당 비용이 늘어 그날만)
cd /c/dev/hotel-booking-aws-v2/infra/seoul
echo 'multi_az = true' >> terraform.tfvars   # 끝나면 이 줄을 지우고 apply(또는 destroy)
terraform plan                             # 처음부터 53 to add, 이미 떠 있으면 NAT · EIP · 경로 추가 + RDS 1 to change
date; terraform apply; date

cd /c/dev/hotel-booking-aws-v2
aws login --profile admin
BASELINE=10 TAIL=10 bash drill/fault.sh task   # 스모크(기록 안 함)
bash drill/fault.sh task      # × 3 (회차 사이 태스크 2 · 정상 2를 스크립트가 확인)
bash drill/fault.sh deploy    # × 3 (깨진 리비전은 끝나면 등록 해제)
bash drill/fault.sh rds       # × 3 (multi_az=true)
bash drill/fault.sh az        # × 3 (multi_az = true, 10분 막음 · +60초 zonal shift → 되돌림 · 취소. 11-21 기준선 조건은 SHIFT_AFTER=off)
```

- 회차마다 `drill/results/fault-<종류>-<시각>/report.md`(손님 쪽 끊김 · 오류 · 중복 예약)와 `marks.log`(주입 · 감지 · 회복 시각).
- **az가 중간에 끊기면** 서브넷이 막힌 채, zonal shift가 켜진 채 남을 수 있습니다: `bash drill/fault.sh az-undo drill/results/fault-az-<시각>`(서브넷 되돌림 → shift 취소). 스크립트는 끝날 때(Ctrl+C 포함) 스스로 되돌리고, shift는 차단 시간 + 10분 뒤 스스로 만료됩니다.
- zonal shift를 쓰려면 ALB에 `enable_zonal_shift`가 켜져 있어야 합니다(모듈 코드, 11-22~). 서울이 이미 떠 있으면 서울 apply에서 ALB 1 to change로 붙습니다([ADR-067](../docs/04-decisions.md#adr-067)).
- Multi-AZ는 끝나면 `terraform.tfvars`에서 `multi_az` 줄을 지우고 apply(또는 destroy)해서 평소로 돌립니다. 3단계 비교는 Multi-AZ를 끈 채로 해야 1단계와 조건이 같습니다.

## 5-8. 리전 복원 드릴 (5단계)

서울 장애를 선언하고 도쿄 복제본(Pilot Light)을 승격해 손님을 받은 뒤, 서울로 되돌립니다([5단계 계획](../docs/experiments/region-drill.md), [ADR-066](../docs/04-decisions.md#adr-066)). 한 회차 = standby(복제본 만들기) + run 1시간 안팎.

```bash
# 처음 한 번: 평소 권한(복제본 생성 · 승격 · 관리자 금고 읽기)과 관리자 비밀번호 금고 (bootstrap, ADR-066 · 069)
cd /c/dev/hotel-booking-aws-v2/infra/bootstrap
AWS_PROFILE=admin terraform plan        # 2 to add(관리자 금고 · 값), 2 to change(평소 정책 · 실행 역할 정책)
date; AWS_PROFILE=admin terraform apply; date
terraform -chdir=../tokyo init              # 이 PC에서 도쿄를 처음 쓰면

# 1) 서울 → global (매일 올리기와 같음)
cd ../seoul && date; terraform apply; date
cd ../global && date; terraform apply; date

# 2) 회차마다: 도쿄 대기 상태 → 드릴 → 도쿄 내리기
#    관리자 세션은 콘솔에서 역할을 전환한 때부터 2시간(11-21 1 → 2시간). 회차마다 콘솔에서 역할을 새로 전환한 뒤 바로 로그인
#    (같은 브라우저 세션으로 aws login만 다시 하면 끝나는 시각이 안 늘어남)
cd /c/dev/hotel-booking-aws-v2
aws login --profile admin
bash drill/region.sh standby  # 도쿄 7 to add(복제본 · VPC · DB 서브넷 2 · 보안 그룹 · 서브넷 그룹 · 설정표) → yes. 끝에 "available arn:..."
bash drill/region.sh run      # 장애 선언 → 도쿄 plan(승격 + 나머지) → 확인 SQL → global plan → RTO
                              # → 실제 사이트에서 예약해 보기 → Enter → 도쿄 멈춤 · 대조 · 덤프 이관 · 체크섬 → 서울 → global plan
                              # plan이 1회차 실측(도쿄 43 · 1 · 0, global 1 · 1 · 1)과 같으면 바로 apply, 다를 때만 yes를 물음
cd infra/tokyo && date; terraform destroy; date; cd ../..   # 50개(11-22 9분 33초). 다음 회차는 standby부터
```

- **중간에 멈추면** 손님 측정기 · 도쿄 DB 상태 기록기는 계속 돕니다(11-21 시도 2 · 3은 같이 꺼져 RTO를 잃음). `region.sh`는 변수를 각 루트의 `terraform.tfvars`에 써 두므로(도쿄 `replica_source_arn`, global `active_region`) 손으로 이어 가도 같은 값이 쓰입니다. 남은 단계를 손으로 끝까지 한 뒤(예: `cd infra/tokyo && terraform apply` → global `terraform.tfvars`에 `active_region = "ap-northeast-1"` 확인 → `cd ../global && terraform apply`) `bash drill/region.sh stop drill/results/region-<시각>`으로 끝내면 보고서가 나옵니다. 서울로 되돌리려면 `bash drill/region.sh seoul-up`(global의 `active_region` 줄도 지움) → `cd infra/global && terraform apply`, 도쿄는 destroy.
- 첫 회차에서 확인할 것(문서로 못 정한 가설): 도쿄 AWS 관리 키로 다른 리전 복제본이 되는지, 승격과 관리자 비밀번호(`password_wo_version`)가 한 apply에서 되는지(오류면 같은 apply를 한 번 더), standby 시간.
- 11-22 첫 standby는 RDS가 관리자 금고를 관리하는 서울 DB라 거부됨 → 관리자 비밀번호를 bootstrap 금고로 옮김([ADR-069](../docs/04-decisions.md#adr-069)). 바꾼 뒤 처음 서울 apply는 서울 DB 비밀번호 방식을 바꾸는 그 자리 수정(`~ update in-place`)이어야 함
- 결과: `drill/results/region-<시각>/` `steps.log`(단계 시각), `db-state.log`(도쿄 DB 10초마다), `report.md`(RTO(측정기 원본) · RPO · 끊김 · 중복), `lost-in-seoul.txt`(대조), `tokyo.sum` · `seoul.sum`(체크섬).
- 예전 Backup & Restore(서울 `-var backup_replication=true`, `region.sh cleanup`)는 2026-11-22에 뺐습니다([ADR-066](../docs/04-decisions.md#adr-066)). 11-21 시도 기록은 [region-drill](../docs/experiments/region-drill.md)에 있습니다.

## 5-9. 결제 · 메일 · 카톡 배포 연결과 Slack 장애 알림 (v3 첫 주, 한 번)

서울 앱이 토스 결제 · 예약 확정 메일(SES) · 카카오톡을 실제로 쓰고, 장애 경보가 Slack으로 옵니다([ADR-071](../docs/04-decisions.md#adr-071)). 키 · Slack ID는 저장소에 없고 사람이 넣습니다. **서울(`app_integrations = true`)을 올리기 전에 1) ~ 4)를 끝내야** 앱 태스크가 뜹니다(없는 SSM 키를 참조하면 태스크가 시작되지 않음).

```bash
# 1) Slack (처음 한 번, 브라우저)
#    - 새 워크스페이스 만들기: Slack 시작 페이지 → 새로 만들기 → 이메일 확인 코드 (Slack 도움말 "Create a Slack workspace")
#    - 알림 채널 만들기(예: #hotel-alerts)
#    - 앱 설치: Slack 왼쪽 Automations(없으면 More) → Browse Apps Directory → Amazon Q Developer → Add
#    - AWS 콘솔(관리자 역할) https://console.aws.amazon.com/chatbot/ (us-east-2 콘솔만 됨)
#      → Configure a chat client에서 Slack → Configure → 오른쪽 위에서 워크스페이스 고르기 → Allow
#      → Workspace details의 Workspace ID 복사. 채널 설정(Configure new channel)은 콘솔에서 하지 않음(Terraform이 만듦)
#    - Slack 알림 채널에서 /invite @Amazon Q → Invite Them
#    - 채널 이름 오른쪽 클릭 → Copy Link → 링크 끝 문자열(C로 시작)이 Channel ID

# 2) bootstrap terraform.tfvars에 세 줄 (예시: terraform.tfvars.example)
#    slack_team_id = "T..."   slack_channel_id = "C..."   ses_test_recipients = ["받을 주소"]
#    받을 주소 = 시연할 때 사이트에 가입할 이메일(예약 확정 메일이 회원 이메일로 감. 샌드박스는 인증한 주소로만 받음)

# 3) 결제 · 카카오 키 4개를 SSM에 (5-3과 같은 방식, 값은 hotel-booking-app/docs/local-integrations.md의 콘솔 위치)
for name in toss-secret-key toss-client-key kakao-rest-api-key kakao-client-secret; do
  read -rsp "/hotel-booking/$name: " V; echo
  MSYS_NO_PATHCONV=1 AWS_PROFILE=admin aws ssm put-parameter --region ap-northeast-2 --name "/hotel-booking/$name" --type SecureString --value "$V"
done; unset V
MSYS_NO_PATHCONV=1 AWS_PROFILE=admin aws ssm get-parameters-by-path --region ap-northeast-2 --path /hotel-booking --recursive --query "Parameters[].Name"   # 7개(시연 계정 3 + 키 4)

# 4) bootstrap: SES 도메인 인증 · DKIM 레코드 · 받는 주소, SNS 주제, Slack 채널 연결, 태스크 역할, 평소 · CD 정책 수정
cd /c/dev/hotel-booking-aws-v2/infra/bootstrap
AWS_PROFILE=admin terraform plan          # 숫자를 먼저 예측
date; AWS_PROFILE=admin terraform apply; date

# 받는 주소 메일함의 SES 확인 메일 링크 누르기. 도메인은 DKIM 레코드가 보이면 인증됨
AWS_PROFILE=admin aws sesv2 get-email-identity --region ap-northeast-2 --email-identity vundle34.cloud \
  --query "[VerifiedForSendingStatus, DkimAttributes.Status]"                # [true, "SUCCESS"]
# Slack 경로: 콘솔(us-east-2) → Slack → 워크스페이스 → 채널 hotel-booking-aws-v2-alerts → Send test message

# 5) 1절대로 서울 → global → CD
```

확인 (서울 · global · CD 뒤):

```bash
# 결제: 사이트 가입(2)의 받을 주소) → 숙소 예약 → 토스 결제창(테스트 키, 돈 안 빠짐) → 내 예약 "결제 완료"
# 메일: 같은 주소로 예약 확정 메일 (스팸함도 확인)
# 카톡: 내 예약 → "카카오톡 알림 받기" → 다음 결제 뒤 나와의 채팅방에 메시지
# 앱 로그에서 발송 실패 이유 찾기
MSYS_NO_PATHCONV=1 aws logs tail /ecs/hotel-booking-aws-v2 --region ap-northeast-2 --since 15m | grep -iE "mail|kakao|toss|error"

# Slack 경보: 일부러 울렸다가(평소 사용자에겐 SetAlarmState 권한이 없어 관리자) 다음 평가(1분)에 실제 값으로 돌아오며 복구 알림
AWS_PROFILE=admin aws cloudwatch set-alarm-state --region ap-northeast-2 --alarm-name hotel-booking-aws-v2-app-unhealthy \
  --state-value ALARM --state-reason "런북 5-9 경로 시험"
```

- 경보는 "정상 태스크가 3분 동안 2개 미만" 하나입니다. 트래픽 눌림(CPU · 5xx · p95) 경보는 v3 임계값 작업에서 더합니다.
- 도쿄(`app_integrations = false`)는 결제 · 메일 · 카톡이 꺼진 채 뜹니다. 키는 서울 SSM에만 있습니다.
- Slack 채널 역할의 신뢰 주체(`chatbot.amazonaws.com`)는 공식 문서에서 찾지 못한 가설입니다. 테스트 메시지가 안 오면 여기부터 봅니다.

## 6. 자주 만난 문제

| 증상 | 원인 | 할 일 |
|---|---|---|
| apply 끝에 `failed to upload state ... ExpiredToken` | 관리자 프로필이 남은 터미널에서 긴 apply가 돌다 세션 만료 | `unset AWS_PROFILE` → 평소 사용자로 `plan`. apply 도중 중간 저장된 state가 있어 남은 것만 나옴 → 그만큼 apply |
| global plan에서 `no matching EC2 Security Group found` | 리전 apply 직후라 CloudFront 보안 그룹이 아직 없음(비동기로 1~2분 뒤 생김) | 1~2분 뒤 다시 plan |
| DB를 쓰는 API가 500, 앱 로그에 `Access denied for user 'app'` | 새 RDS인데 CD(migrate)를 아직 안 돌림 | 1절의 `gh workflow run cd.yml` |
| `Value for undeclared variable "active_region"` | global이 아닌 폴더에서 실행 | 프롬프트의 폴더 확인 → `infra/global` |
| 같은 PC에서 로그인 · 가입이 403 | WAF 로그인 한도(IP당 5분 100번)에 걸림 | 몇 분 뒤 풀림([10 보안 점검](../docs/10-security.md)) |
| `ssm put-parameter`가 `Parameter name must be a fully qualified name` | Git Bash가 `/hotel-booking/...`를 `C:/Program Files/Git/hotel-booking/...`로 바꿔 넘김 (2026-11-18) | 명령 앞에 `MSYS_NO_PATHCONV=1` (런북 5-3) |
| 서울 apply가 `creating CloudWatch Logs Log Group (/aws/ecs/containerinsights/hotel-booking-aws-v2/performance) ... ResourceAlreadyExistsException`로 멈춤 (11-21 13:18 · 11-22 16:07) | **ECS가 다시 만듦(CloudTrail로 확인):** destroy가 로그 그룹을 지운 지 약 40초 뒤 `ecs.amazonaws.com`이 같은 이름으로 다시 만들고 보관 1일을 건다(11-21 02:22 → 02:23, 20:19 → 20:20) | 11-22부터 Terraform이 이 로그 그룹을 만들지 않는다(`removed` 블록, ECS 소유). 옛 state가 남아 같은 오류가 나면: `MSYS_NO_PATHCONV=1 terraform import 'module.regional.aws_cloudwatch_log_group.container_insights' /aws/ecs/containerinsights/hotel-booking-aws-v2/performance` → 최신 코드로 plan · apply |
| 같은 이메일 로그인이 429 | 계정 잠금(15분 안에 5번 틀림, [ADR-054](../docs/04-decisions.md#adr-054)) | 15분 뒤 풀림 |
