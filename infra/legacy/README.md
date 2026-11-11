# 1단계 AWS 이전 환경 올리기 (새 PC 기준)

IDC 역할을 하는 이전 환경을 서울 리전에 만들고, 앱을 띄워 브라우저로 확인한 뒤 지우는 순서입니다. 설계 근거는 [ADR-016](../../docs/04-decisions.md#adr-016) · [ADR-021](../../docs/04-decisions.md#adr-021)에 있습니다.

- 만드는 것(17개): VPC · 서브넷 · NAT 인스턴스, 웹+앱 EC2(퍼블릭 서브넷), MySQL EC2(프라이빗 서브넷), 보안 그룹 2개, 키 페어. 서버 3대 모두 t3.micro
- 부하 시험 날만: 부하 발생기 EC2(퍼블릭 서브넷) + 보안 그룹 → 19개. `-var is_load_test=true`로 켜고, 변수 없이 `terraform apply`하면 발생기만 지웁니다([ADR-023](../../docs/04-decisions.md#adr-023)). 시험 순서는 아래 [부하 기준선 시험 날](#부하-기준선-시험-날-과제-3)
- 비용: 켜 둔 동안 시간당 약 $0.049. 발생기를 켜면 약 $0.018 추가(t3.micro일 때). **작업이 끝나면 반드시 `terraform destroy`**

## 처음 한 번 (새 PC 준비)

| 준비물 | 확인 명령 | 메모 |
|---|---|---|
| Git Bash | | 아래 명령은 모두 Git Bash 기준 |
| AWS CLI 2.32.0 이상 | `aws --version` | `aws login` 명령이 이 버전부터 있음 ([ADR-018](../../docs/04-decisions.md#adr-018)) |
| Terraform 1.x | `terraform version` | 1.17.0 · AWS provider 6.x에서 확인 |
| Docker Desktop | `docker version` | **앱 이미지를 새로 만들 때만.** 이미 올린 이미지로 띄우기만 하면 필요 없음 |

IAM 사용자와 정책([legacy-operator-policy.json](../iam/legacy-operator-policy.json))은 AWS 계정에 한 번 만들어 두는 것이라 PC가 바뀌어도 그대로입니다.

```bash
# 1. 저장소 받기
git clone https://github.com/yubin05/hotel-booking-aws-v2.git /c/dev/hotel-booking-aws-v2
cd /c/dev/hotel-booking-aws-v2/infra/legacy

# 2. SSH 키 (코멘트는 영문만: 한글이면 AWS가 키 등록을 거부함)
ssh-keygen -t ed25519 -f ~/.ssh/hotel-legacy -C "hotel-legacy"

# 3. SSH를 허용할 내 IP (장소가 바뀌면 다시)
curl -s https://checkip.amazonaws.com
cp terraform.tfvars.example terraform.tfvars   # 열어서 ["<위 IP>/32"]로 고치기

# 4. 비밀값 (저장소 밖. 다른 PC에서 복사해 올 필요 없음: DB를 매일 새로 만들어서 새 값이어도 됨)
mkdir -p ~/.hotel-legacy
cat > ~/.hotel-legacy/db.env <<EOF
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
MYSQL_DATABASE=hotel_booking
MYSQL_USER=app
MYSQL_PASSWORD=$(openssl rand -hex 16)
EOF
cat > ~/.hotel-legacy/app.env <<EOF
JWT_SECRET=$(openssl rand -hex 32)
EOF

# 5. Terraform 준비
terraform init
```

키 페어는 apply할 때 이 PC의 공개 키(`~/.ssh/hotel-legacy.pub`)로 만들고 destroy할 때 지웁니다. 그래서 PC마다 키를 새로 만들어도 됩니다.

## 매일: 올리기 → 확인 → 지우기

```bash
cd /c/dev/hotel-booking-aws-v2/infra/legacy

aws login
aws sts get-caller-identity          # Arn에 :user/ 가 보여야 평소 권한 (관리자 역할이면 :assumed-role/)
eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy   # Git Bash 창마다

date; terraform apply                # 17개 추가 (부하 시험 날: terraform apply -var is_load_test=true → 19개)
bash start-db.sh                     # 끝에 hotels 1010이 나오면 DB 준비 완료
bash start-app.sh yubin05/hotel-booking-aws-v2:<태그>   # 끝에 {"status":"ok","db":"ok"}와 브라우저 주소
```

- `<태그>`: [Docker Hub 저장소](https://hub.docker.com/r/yubin05/hotel-booking-aws-v2/tags)의 최신 태그(커밋 SHA, [ADR-022](../../docs/04-decisions.md#adr-022))
- 브라우저에서 `http://<앱 IP>`를 열어 확인합니다. HTTP라 로그인 정보가 평문으로 오가므로 다른 곳에서 쓰는 비밀번호는 쓰지 마세요.
- 서버 지문을 물으면 `yes`. 스크립트가 매번 예전 서버 기록을 지워서 날마다 묻습니다. post-quantum 경고는 무시해도 됩니다.

끝낼 때:

```bash
terraform destroy; date              # 17개 삭제
```

## 부하 기준선 시험 날 (과제 3)

손님을 500명씩 늘려 3,000명까지 올리는 37분짜리 시험을 3번 돌립니다. 계획·기준·예측은 [기준선 문서](../../docs/experiments/baseline.md)에 있습니다. 전부 하면 약 3시간이고, 회차 사이에서 끊었다가 다른 날·다른 PC에서 이어 해도 됩니다(아래 주의).

```bash
cd /c/dev/hotel-booking-aws-v2 && git pull && cd infra/legacy
aws login; eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy

date; terraform apply -var is_load_test=true   # 19개 추가 (발생기 t3.medium + 보안 그룹 포함)
bash start-db.sh                               # 끝에 hotels 1010
bash start-app.sh yubin05/hotel-booking-aws-v2:<태그>

bash run-baseline.sh --stage 30s:5 --stage 10s:0   # 1분 시험 실행: 끝에 결과 폴더와 정합성 표가 나오면 스크립트 정상 (이 PC에서 처음일 때만)
bash run-baseline.sh                               # 1회 37분. 회차 사이 2~3분 쉬고 반복

terraform destroy; date                        # 19개 삭제
```

| 때 | 화면에 보이는 것 |
|---|---|
| 시작 | `시작: baseline-<시각> (앱 http://…, 발생기 …)` |
| 진행 중 | `running (12m30s), 1000/3000 VUs …`: 지난 시간 · 지금 손님 수 |
| 끝 | k6 요약 표 → `결과: load/results/<이름>/` → 정합성 검사 표(첫 표의 bad가 모두 0) |

- 정리: `node scripts/baseline-report.mjs load/results/<이름>/<이름>.json.gz` (저장소 루트에서) → 층별 표와 "N명까지 버팀" 한 줄
- 발생기에 처음 접속할 때 지문을 물으면 `yes`.
- Ctrl+C를 누르거나 인터넷이 끊겨도 시험은 발생기에서 계속 돕니다. 37분이 지난 뒤 `bash run-baseline.sh collect <이름>`으로 결과만 가져옵니다.
- **회차 중간에 destroy하지 않습니다.** 끊으려면 `결과: …`가 나온 뒤에.
- **다른 PC로 옮겨 이어 할 때는 이 PC에서 destroy하고 갑니다**(state가 apply한 PC에만 있음). 새 PC에서는 `terraform.tfvars`의 SSH 허용 IP를 그 장소 IP로 고치고 처음부터 apply합니다.
- `load/results/`는 git에 올라가지 않습니다. 다른 PC에서 돌린 회차는 정리 출력(표)을 기록에 붙이고, 그래프용 원본(`.json.gz`)은 나중에 한곳에 모읍니다.

## 앱을 고쳐서 이미지를 새로 만들 때

```bash
docker login --username yubin05      # 비밀번호 자리에 Docker Hub 개인 액세스 토큰(Repo Read & Write)
cd /c/dev/hotel-booking-aws-v2
git status --short app               # 아무것도 안 나와야 함 (커밋한 코드만 이미지로)
TAG=$(git rev-parse --short HEAD)
docker build -t yubin05/hotel-booking-aws-v2:$TAG app
docker push yubin05/hotel-booking-aws-v2:$TAG
cd infra/legacy && bash start-app.sh yubin05/hotel-booking-aws-v2:$TAG   # 서버가 떠 있으면 컨테이너만 바꿔 다시 배포
```

## 주의

- **Terraform 상태(state)는 apply한 PC에만 있습니다**(저장소에 올리지 않음). 다른 PC는 그 리소스를 모르므로 apply한 PC에서 destroy하세요. PC를 옮기기 전에 서버가 남아 있지 않은지 확인합니다. 남아 있으면 요금이 계속 나가고, 같은 이름의 키 페어가 있어서 새 PC의 apply도 실패합니다.
  ```bash
  aws ec2 describe-instances --region ap-northeast-2 --filters Name=instance-state-name,Values=pending,running \
    --query 'Reservations[].Instances[].Tags[?Key==`Name`].Value' --output text   # 아무것도 안 나와야 함
  ```
- 문제가 생기면 [check-db.sh](check-db.sh)로 DB 서버의 설치 로그와 NAT 대기 횟수를 봅니다.
- 지금까지 겪은 문제와 결과는 [03 진행 계획의 결과 기록](../../docs/03-plan.md#결과-기록)에 있습니다.
