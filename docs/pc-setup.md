# 새 PC 설정: git에 안 올리는 키 · 토큰 파일 (학원 · 집)

비밀값과 PC마다 다른 값은 저장소에 없습니다. 새 PC나 오래 안 쓴 PC에서는 아래 파일을 채운 뒤 `bash scripts/preflight.sh`로 확인합니다. 이 문서에는 값을 적지 않고 **어디서 찾는지만** 적습니다. 값은 각 서비스 화면에서 다시 확인해 넣고, 파일을 메신저나 공개된 곳으로 옮기지 않습니다.

## 1. 저장소

```bash
cd /c/dev
git clone https://github.com/yubin05/hotel-booking-aws-v2   # 이미 있으면 그 폴더에서 git pull
git clone https://github.com/yubin05/hotel-booking-app
```

## 2. 채울 파일

| 파일 | 무엇 | 값을 찾는 곳 | 없으면 |
|---|---|---|---|
| `~/.aws/config`의 `[profile admin]` | 관리자 로그인 | [인프라 런북](../infra/README.md) 0절 | 관리자 apply · 이관 · `cw-metrics` 안 됨 |
| `~/.ssh/hotel-legacy` | 옛 환경 · k6 발생기 SSH 키(암호 있음) | [옛 환경 README "처음 한 번"](https://github.com/yubin05/hotel-booking-app/blob/main/legacy/README.md#처음-한-번-새-pc-준비) | 옛 DB · 앱 띄우기, k6 안 됨 |
| `~/.hotel-legacy/db.env` · `app.env` | 옛 환경 DB 비밀번호 · JWT | 같은 곳 | 옛 DB · 앱 안 뜸 |
| `hotel-booking-app/legacy/terraform.tfvars` | SSH 허용 IP = **지금 PC의 IP** | `curl -s https://checkip.amazonaws.com` | **장소가 바뀌면 다시** (학원 ↔ 집). SSH가 막힘 |
| `~/.hotel-legacy/grafana.env` | Grafana Cloud로 k6 지표 보내기: 주소 · 사용자 · 쓰기 토큰 | grafana.com Cloud Portal → 스택의 Prometheus **"Details"** (토큰은 "Password / API Token"에서 `metrics:write`) | 쿠폰 시험의 Grafana 실시간 전송만 꺼짐 |
| `hotel-booking-aws-v2/infra/bootstrap/terraform.tfvars` | 예산 알림 이메일, Grafana 계정 ID · 외부 ID | 이메일은 본인, Grafana 값은 Grafana → Connections → CloudWatch 데이터 소스 → Settings 탭 "How to create an IAM role for grafana to assume" | ⚠ Grafana 값이 빈 채로 bootstrap apply를 하면 **Grafana 출입증 역할이 지워짐**(plan에 destroy가 보이면 멈추기) |
| `hotel-booking-app/.env` | 토스 결제 · 카카오톡 예약 알림 · SES 키 | [결제 · 알림 로컬 설정](https://github.com/yubin05/hotel-booking-app/blob/main/docs/local-integrations.md) 표 | 로컬에서 결제 없이 바로 확정, 카카오 버튼 숨김 (2026-11-20 학원 PC에서 겪음) |

## 3. 만드는 법 (Git Bash)

```bash
# Grafana: = 뒤에 값만 (따옴표 · 공백 없이)
[ -f ~/.hotel-legacy/grafana.env ] || cat > ~/.hotel-legacy/grafana.env <<'EOF'   # 이미 있으면 덮어쓰지 않음
K6_PROMETHEUS_RW_SERVER_URL=
K6_PROMETHEUS_RW_USERNAME=
K6_PROMETHEUS_RW_PASSWORD=
EOF
chmod 600 ~/.hotel-legacy/grafana.env
code ~/.hotel-legacy/grafana.env

# bootstrap: 예시를 복사해 채움 (여기는 값을 "따옴표 안에")
cd /c/dev/hotel-booking-aws-v2/infra/bootstrap
[ -f terraform.tfvars ] || cp terraform.tfvars.example terraform.tfvars; code terraform.tfvars

# 옛 환경: 예시를 복사해 지금 IP를 넣음
cd /c/dev/hotel-booking-app/legacy
[ -f terraform.tfvars ] || cp terraform.tfvars.example terraform.tfvars; code terraform.tfvars

# 결제 · 알림: 키를 넣은 뒤, 로컬 DB에 새 테이블과 --build까지 (결제 · 알림 로컬 설정 문서의 "PC마다 할 일" 1 ~ 3)
cd /c/dev/hotel-booking-app
[ -f .env ] || cp .env.example .env; code .env
```

## 4. Terraform init (폴더마다 처음 한 번)

```bash
cd /c/dev/hotel-booking-aws-v2
for r in infra/bootstrap infra/seoul infra/global infra/tokyo ../hotel-booking-app/legacy ../hotel-booking-app/legacy/iam; do terraform -chdir=$r init; done
```

## 5. 확인

```bash
cd /c/dev/hotel-booking-aws-v2
bash scripts/preflight.sh     # "모두 OK"면 끝. Grafana 줄은 "--"여도 시험은 됨(실시간 전송만 꺼짐)
```

로컬 결제 · 알림은 http://localhost:3000 에서 예약 → 토스 결제창 → 카카오톡 "나와의 채팅방" 알림까지 보면 끝입니다([확인 순서](https://github.com/yubin05/hotel-booking-app/blob/main/docs/local-integrations.md#확인)).
