#!/usr/bin/env bash
# 측정 · 드릴 날 시작 전 점검 (읽기만, AWS 호출 없음): 도구 · 키 · 설정 파일 · Terraform init · 지금 IP. NG 항목만 고치면 된다
#   bash scripts/preflight.sh
# 고객사 저장소가 C:/dev 아래 나란히 있다고 본다. 다르면 APP_REPO=<경로>
cd "$(dirname "$0")/.."
APP=${APP_REPO:-../hotel-booking-app}
fail=0
chk() { # $1 무엇, $2 고치는 법, 나머지: 확인 명령
  local what=$1 fix=$2
  shift 2
  if "$@" >/dev/null 2>&1; then echo "  OK  $what"; else echo "  NG  $what → $fix"; fail=1; fi
}

echo "[도구]"
for t in git terraform aws node ssh ssh-agent openssl curl timeout; do chk "$t" "설치 · PATH" command -v "$t"; done
tfv=$(terraform version -json 2>/dev/null | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).terraform_version' 2>/dev/null)
chk "terraform 1.11 이상 (지금 ${tfv:-?})" "terraform 업데이트" test "$(printf '%s\n' 1.11.0 "${tfv:-0}" | sort -V | head -1)" = 1.11.0
chk "aws 관리자 프로필 admin" "~/.aws/config에 [profile admin] (infra/README.md 0절)" bash -c 'aws configure list-profiles | tr -d "\r" | grep -qx admin'
chk "aws configure export-credentials (5단계 되돌리기 서명)" "AWS CLI v2 업데이트" aws configure export-credentials help

echo "[키 · 설정 파일]"
chk "SSH 키 ~/.ssh/hotel-legacy" "legacy README 준비물" test -f ~/.ssh/hotel-legacy
chk "~/.hotel-legacy/db.env" "legacy README 준비물" test -f ~/.hotel-legacy/db.env
chk "~/.hotel-legacy/app.env" "legacy README 준비물" test -f ~/.hotel-legacy/app.env
ip=$(curl -s -m 5 https://checkip.amazonaws.com | tr -d '\r\n')
chk "legacy/terraform.tfvars SSH 허용 IP = 지금 IP(${ip:-?})" "web_app_ssh_ingress_cidrs = [\"$ip/32\"] (커밋 안 함)" grep -q "\"$ip/32\"" "$APP/legacy/terraform.tfvars"
# 있으면 좋은 것 (없어도 시험은 됨, NG로 세지 않음): docs/pc-setup.md
opt() { if "${@:3}" >/dev/null 2>&1; then echo "  OK  $1"; else echo "  --  $1 → $2"; fi; }
opt "~/.hotel-legacy/grafana.env 토큰" "없으면 쿠폰 시험의 Grafana 실시간 전송만 꺼짐" grep -q '^K6_PROMETHEUS_RW_PASSWORD=.' ~/.hotel-legacy/grafana.env
opt "infra/bootstrap/terraform.tfvars Grafana 값" "빈 채로 bootstrap apply하면 Grafana 출입증 역할이 지워짐" grep -q '^grafana_account_id *= *"[0-9]' infra/bootstrap/terraform.tfvars

echo "[Terraform init]"
for r in "$APP/legacy" "$APP/legacy/iam" infra/bootstrap infra/seoul infra/global infra/tokyo; do
  chk "$r" "terraform -chdir=$r init" test -d "$r/.terraform"
done

echo "[자체 점검]"
chk "drill/presign-put.mjs 서명 (AWS 문서 예시)" "코드 확인" node drill/presign-put.mjs --self-test
chk "scripts/drill-report.mjs 계산" "코드 확인" node scripts/drill-report.mjs --self-test

echo "[저장소] 커밋 안 한 변경 (legacy/iam 권한 붙이기는 terraform.tfvars라 여기 안 나옴)"
git status --short
git -C "$APP" status --short
[ $fail = 0 ] && echo "모두 OK" || { echo "NG 항목을 고친 뒤 다시"; exit 1; }
