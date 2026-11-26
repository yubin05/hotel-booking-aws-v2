#!/usr/bin/env bash
# 한 번에 내리기 (infra/README.md 2절): global → 발생기(legacy) → 서울 → legacy 권한 떼기(관리자)
#   bash scripts/down.sh       떠 있는 루트만 내림. 시험용 tfvars 줄(WAF 예외 IP · is_load_test · legacy 권한)도 원래대로. 약 15분
# global이 서울의 통로 · ALB를 쓰고, legacy를 지우려면 legacy 권한이 있어야 해서 이 순서. 시각 · 로그: infra/runs/<시각>-down/
[ $# = 0 ] || { sed -n 2,4p "$0"; exit 1; }
source "$(dirname "$0")/infra-lib.sh" down

attached=no
grep -qE '^attach_operator_legacy[[:space:]]*=[[:space:]]*true' "$(dir iam)/terraform.tfvars" 2>/dev/null && attached=yes
need_login normal
[ "$attached" = yes ] && need_login admin

tf global destroy "$DESTROY_ONLY"
tfvar global loadtest_ips # 발생기 IP는 반납되므로 WAF 예외 줄도 지움
tf legacy destroy "$DESTROY_ONLY"
tfvar legacy is_load_test
tf seoul destroy "$DESTROY_ONLY"
if [ "$attached" = yes ]; then
  tfvar iam attach_operator_legacy false
  tf iam apply '^Plan: 0 to add, 0 to change, 1 to destroy\.$' admin # 권한 붙이기 1개만 지움
fi

# 남은 비싼 자원 (서울): 실행 중 EC2 · RDS · NAT. 0 0 0이어야 함
left=$(for q in \
  "ec2 describe-instances --filters Name=instance-state-name,Values=running,pending --query length(Reservations)" \
  "rds describe-db-instances --query length(DBInstances)" \
  "ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query length(NatGateways)"; do
  # shellcheck disable=SC2086
  aws --region ap-northeast-2 $q --output text 2>/dev/null | tr -d '\r' || echo '?'
done | tr '\n' ' ')
log "남은 자원 (EC2 · RDS · NAT): $left"
summary
