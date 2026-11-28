#!/usr/bin/env bash
# 리전 드릴 1회차와 같은 순서를 자동으로: standby(plan 7 확인) → run(보강 끝나면 Enter) → Grafana 수집 → destroy(plan 56 확인)
# 단계마다 기준이 다르면 멈춘다(exit 1x). 사용: bash round.sh <회차>
set -Eeuo pipefail
N=${1:?회차}
S=$(cd "$(dirname "$0")" && pwd)/results # 로그 · 제어 파일 (git 제외)
R=/c/dev/hotel-booking-aws-v2
LOG=$S/round$N.log
say() { echo "$(date +%T) [$N회차] $*" | tee -a "$LOG"; }
trap 'say "멈춤(위 단계, exit $?)"' ERR
cd "$R"
TF=infra/tokyo
SRC=arn:aws:rds:ap-northeast-2:248563009287:db:hotel-booking-aws-v2

# 1) standby: region.sh standby와 같은 tfvars, plan이 7 · 0 · 0일 때만 apply. SKIP_STANDBY=<standby 끝 ISO>면 이미 대기 상태라 건너뜀
if [ -n "${SKIP_STANDBY:-}" ]; then SB_END=$SKIP_STANDBY; say "standby 건너뜀(이미 대기, 끝 $SB_END)"; else
sed -i '/^replica_source_arn[[:space:]]*=/d;/^multi_az[[:space:]]*=/d' $TF/terraform.tfvars
echo "replica_source_arn = \"$SRC\"" >>$TF/terraform.tfvars
terraform -chdir=$TF plan -input=false -no-color -target=module.regional.aws_db_instance.this -out=standby.tfplan >"$S/standby$N-plan.log" 2>&1
p=$(grep -E '^Plan:' "$S/standby$N-plan.log" | tr -d '\r')
[ "$p" = "Plan: 7 to add, 0 to change, 0 to destroy." ] || { say "standby plan 다름: $p"; exit 10; }
say "standby_apply $p"
terraform -chdir=$TF apply -input=false -no-color standby.tfplan >"$S/standby$N-apply.log" 2>&1
rm -f $TF/standby.tfplan
SB_END=$(date +%FT%T+09:00)
st=$(aws rds describe-db-instances --region ap-northeast-1 --db-instance-identifier hotel-booking-aws-v2 --query 'DBInstances[0].[DBInstanceStatus,ReadReplicaSourceDBInstanceIdentifier]' --output text | tr -d '\r' | tr '\t' ' ')
[[ $st == "available arn:"* ]] || { say "도쿄 대기 상태 아님: $st"; exit 11; }
say "standby_done $st"
fi

# 2) run: 관리자 세션 확인 → Multi-AZ 보강이 끝나 안내가 나오면 Enter
AWS_PROFILE=admin aws sts get-caller-identity --query Arn --output text | grep -q assumed-role || { say "관리자 세션 없음"; exit 12; }
: >"$S/ctrl$N"
: >"$S/run$N.out"
(for _ in $(seq 1440); do # 최대 2시간. run이 먼저 실패하면 Enter 없이 끝남
  if grep -q '지금 실제 사이트' "$S/run$N.out"; then sleep 2; echo >>"$S/ctrl$N"; echo "$(date +%T) [$N회차] Enter 보냄" >>"$LOG"; break; fi
  sleep 5
done) &
say "run 시작"
bash drill/region.sh run < <(tail -f --pid=$$ "$S/ctrl$N") >"$S/run$N.out" 2>&1 || { say "run 실패 → $S/run$N.out"; exit 13; }
D=drill/$(sed -n 's/^결과: drill\///p' "$S/run$N.out" | tr -d '\r' | sed 's:/$::')
grep -q '^checksum_ok ' "$D/marks.log" || { say "체크섬 표시 없음"; exit 14; }
mv "$S/standby$N-plan.log" "$S/standby$N-apply.log" "$D/" 2>/dev/null || true
say "run_done $D $(grep -E 'RTO\(측정기|RPO:' "$D/report.md" | tr '\n' ' ')"

# 3) Grafana: standby 끝 5분 전 ~ 지금 (최대 240분)
node scripts/collect-grafana-operations.cjs --from "$(date -d "$SB_END -5 min" +%FT%T+09:00)" --to "$(date +%FT%T+09:00)" --out "$D/grafana" 2>&1 | tail -1 | tee -a "$LOG"

# 4) 도쿄 destroy: plan이 56개 삭제일 때만
terraform -chdir=$TF plan -destroy -input=false -no-color -out=destroy.tfplan >"$D/tf-tokyo-destroy-plan.log" 2>&1
p=$(grep -E '^Plan:' "$D/tf-tokyo-destroy-plan.log" | tr -d '\r')
[ "$p" = "Plan: 0 to add, 0 to change, 56 to destroy." ] || { say "destroy plan 다름: $p"; exit 15; }
say "destroy_apply"
terraform -chdir=$TF apply -input=false -no-color destroy.tfplan >"$D/tf-tokyo-destroy.log" 2>&1
rm -f $TF/destroy.tfplan
say "destroy_done 사이트 $(curl -s -o /dev/null -w '%{http_code}' https://hotel.vundle34.cloud/api/health/deep)"
