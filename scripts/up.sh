#!/usr/bin/env bash
# 한 번에 올리기 (infra/README.md 1절 · 5-5 준비): 서울 → CD → global, load를 붙이면 부하 시험 준비까지
#   bash scripts/up.sh          매일: 서울 → CD(migrate · 배포) → global → 사이트 확인. 약 20분(Multi-AZ면 약 30분)
#   bash scripts/up.sh load     부하 시험 날: legacy 권한(관리자) → 발생기 → 서울 → CD → 발생기 호스트 키 → global(발생기 WAF 예외) → 확인
# 단계마다 plan이 순수 추가면 그대로 apply, 아니면 물어봄. 이미 올라간 루트는 건너뜀. 시각 · 로그: infra/runs/<시각>-up/
mode=${1:-daily}
[[ $mode == daily || $mode == load ]] || { sed -n 2,5p "$0"; exit 1; }
source "$(dirname "$0")/infra-lib.sh" up
APP_GH=yubin05/hotel-booking-app

cd_deploy() { # 새 RDS에 스키마 · 데이터를 넣는 migrate + 배포. global 전에 해야 DR 판단 알림이 거짓으로 안 울림 (ADR-079)
  local since id i
  since=$(date -u -d '-30 sec' +%Y-%m-%dT%H:%M:%SZ)
  for i in 1 2 3; do # GitHub가 가끔 HTTP 500 (11-25)
    gh workflow run cd.yml -R "$APP_GH" --ref main && break
    [ "$i" = 3 ] && die "CD 시작 실패"
    sleep 10
  done
  for _ in $(seq 30); do
    id=$(gh run list -R "$APP_GH" --workflow cd.yml --limit 1 --json databaseId,createdAt --jq ".[] | select(.createdAt >= \"$since\") | .databaseId")
    [ -n "$id" ] && break
    sleep 4
  done
  [ -n "$id" ] || die "방금 시작한 CD 실행을 못 찾음 (gh run list -R $APP_GH --workflow cd.yml)"
  log "CD 시작 (실행 $id, 약 5분)"
  gh run watch "$id" -R "$APP_GH" --exit-status --interval 15 >/dev/null || die "CD 실패 → gh run view $id -R $APP_GH --log-failed"
  log "CD 끝"
  SUMMARY+=("| CD | 배포 · migrate | $(date +%T) 끝 | 실행 $id |")
}

trust_host() { # 발생기 SSH 호스트 키: 콘솔 출력에 찍힌 지문과 실제 서버 키가 같을 때만 known_hosts에 넣음
  local ip=$1 id fp scan
  id=$(aws ec2 describe-instances --region ap-northeast-2 --filters "Name=ip-address,Values=$ip" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text | tr -d '\r')
  for _ in $(seq 30); do # 콘솔 출력은 부팅 몇 분 뒤에 나옴
    fp=$(AWS_PROFILE=admin aws ec2 get-console-output --region ap-northeast-2 --instance-id "$id" --latest --output text --query Output 2>/dev/null |
      grep -E 'ECDSA|ED25519' | grep -oE 'SHA256:[A-Za-z0-9+/]+' | sort -u || true)
    [ -n "$fp" ] && break
    sleep 10
  done
  ssh-keyscan -T 10 -t ecdsa,ed25519 "$ip" 2>/dev/null >"$OUT/keyscan.txt" || true
  scan=$(ssh-keygen -lf "$OUT/keyscan.txt" 2>/dev/null | grep -oE 'SHA256:[A-Za-z0-9+/]+' | sort -u || true)
  if [ -n "$fp" ] && [ "$fp" = "$scan" ]; then
    ssh-keygen -R "$ip" >/dev/null 2>&1 || true # 같은 IP를 예전 발생기가 썼을 수 있음
    cat "$OUT/keyscan.txt" >>~/.ssh/known_hosts
    log "발생기 $ip 호스트 키: 콘솔 지문과 같음 → known_hosts에 넣음"
  else
    log "발생기 $ip 호스트 키를 확인 못 함(콘솔 지문 없음 또는 다름) → known_hosts에 안 넣음. 회차 전에 직접 확인"
  fi
}

need_login normal
[ "$mode" = load ] && need_login admin
command -v gh >/dev/null || die "gh 없음 (CD를 돌림)"

if [ "$mode" = load ]; then
  tfvar iam attach_operator_legacy true # 평소 사용자에게 legacy 권한. 내릴 때 down.sh가 뗌
  tf iam apply "$ADD_ONLY" admin
  tfvar legacy is_load_test true
  tf legacy apply "$ADD_ONLY"
fi

tf seoul apply "$ADD_ONLY"
if [ "$CHANGED" = yes ]; then cd_deploy; else log "서울이 이미 떠 있어 CD 건너뜀 (필요하면 gh workflow run cd.yml -R $APP_GH)"; fi

if [ "$mode" = load ]; then
  ip=$(terraform -chdir="$(win "$(dir legacy)")" output -raw load_test_instance_1_public_ip | tr -d '\r')
  tfvar global loadtest_ips "[\"$ip/32\"]" # 발생기 IP만 WAF 요청 수 한도에서 뺌
  trust_host "$ip"
fi

tf global apply "$ADD_ONLY"

url=$(terraform -chdir="$(win "$(dir global)")" output -raw app_url | tr -d '\r')
ok=no
for _ in $(seq 36); do # CloudFront가 막 생겼으면 잠깐 안 될 수 있어 3분까지
  [ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$url/api/health/deep" || true)" = 200 ] && { ok=yes; break; }
  sleep 5
done
if [ "$ok" = yes ]; then log "사이트 확인: $url/api/health/deep 200"; else log "사이트가 3분 안에 200을 안 줌 → 런북 1절 확인"; fi
summary
