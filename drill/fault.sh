#!/usr/bin/env bash
# 4단계 장애 테스트 1회 (docs/experiments/faults.md): 손님 역할(writer)을 2분 돌린 뒤 장애를 넣고, 회복까지 상태를 기록한다
#   bash drill/fault.sh task       앱 태스크 1개 강제 종료 → 대체 태스크가 뜨고 대상 그룹에서 정상 2가 될 때까지
#   bash drill/fault.sh rds        RDS 강제 장애 조치(재부팅 + failover) → 장애 조치 완료 이벤트 · available까지 (서울 -var multi_az=true)
#   bash drill/fault.sh deploy     일부러 깨진 버전(뜨자마자 종료) 배포 → circuit breaker가 실패로 보고 이전 버전으로 돌아갈 때까지
#   bash drill/fault.sh az [AZ]    한 AZ(기본: RDS 주 DB가 있는 AZ)의 서브넷을 빈 네트워크 ACL로 10분 막고, 그 AZ의 DB면 강제 장애 조치 (multi_az=true)
#   bash drill/fault.sh az-undo <결과 폴더>   az가 중간에 끊겼을 때 서브넷을 원래 ACL로 되돌림
# 결과: drill/results/fault-<종류>-<시각>/ writer.log(손님 쪽), marks.log · steps.log(주입 · 감지 · 회복 시각), state.log(2 ~ 5초마다 태스크 · 대상 · DB),
#       events.txt(ECS 서비스 · RDS 이벤트), report.md(scripts/drill-report.mjs)
# 필요: 서울 · global이 떠 있음, 관리자 로그인(AWS_PROFILE=admin), 태스크 2 · 정상 2(회차 사이 회복된 뒤)
set -Eeuo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1 # 로그 그룹 · file:// 경로를 Git Bash가 윈도 경로로 바꾸지 않게
source ../migration/lib.sh # admin() · CLUSTER · REGION(서울)
BASE=https://hotel.vundle34.cloud
BASELINE=${BASELINE:-120} # 주입 전 평소 구간(초)
TAIL=${TAIL:-120}         # 회복 뒤 더 지켜보는 구간(초)
HOLD_AZ=${HOLD_AZ:-600}   # AZ를 막아 두는 시간: 잠정 목표 10분(ADR-036)을 넘겨야 그 안에 회복하는지 보임
MAX_WAIT=${MAX_WAIT:-1200}

kind=${1:-}
case "$kind" in task | rds | deploy | az | az-undo) ;; *) sed -n '3,8p' "$0" >&2; exit 1 ;; esac
aws_t() { AWS_PROFILE=admin timeout 30 aws --region "$REGION" "$@" | tr -d '\r'; } # 드물게 멈추는 aws 호출이 기록을 막지 않게
now_ms() { echo $(($(date +%s%N) / 1000000)); }
mark() { echo "$1 $(now_ms) ${2:-}" >>"$OUT/marks.log"; echo "$(date +%T) $*" | tee -a "$OUT/steps.log"; }

undo_az() { # $1 결과 폴더
  [ -s "$1/nacl-blocked.tsv" ] || return 0
  while read -r subnet orig assoc; do
    admin ec2 replace-network-acl-association --association-id "$assoc" --network-acl-id "$orig" >/dev/null && echo "되돌림 $subnet → $orig"
  done <"$1/nacl-blocked.tsv"
  mv "$1/nacl-blocked.tsv" "$1/nacl-undone.tsv"
  admin ec2 delete-network-acl --network-acl-id "$(cat "$1/nacl-deny.txt")" && echo "막는 ACL 지움"
}
if [ "$kind" = az-undo ]; then undo_az "${2:?사용: bash drill/fault.sh az-undo <결과 폴더>}"; exit 0; fi

ARN=$(admin sts get-caller-identity --query Arn --output text)
[[ "$ARN" == *:assumed-role/* ]] || { echo "관리자 역할이 아님: $ARN (aws login --profile admin)" >&2; exit 1; }
TG=$(admin elbv2 describe-target-groups --names "$CLUSTER-app" --query 'TargetGroups[0].TargetGroupArn' --output text)
healthy() { aws_t elbv2 describe-target-health --target-group-arn "$TG" --query "length(TargetHealthDescriptions[?TargetHealth.State=='healthy'])" --output text; }
running() { aws_t ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].runningCount' --output text; }
db() { aws_t rds describe-db-instances --db-instance-identifier "$CLUSTER" --query "DBInstances[0].$1" --output text; }

# 앞 회차 직후엔 대체된 태스크가 정리 중일 수 있어 준비될 때까지 기다림(5초마다, 최대 5분). 측정은 준비된 뒤부터 (11-20 연속 실행이 여기서 멈춤)
for _ in $(seq 60); do [ "$(running)" = 2 ] && [ "$(healthy)" = 2 ] && break; echo "$(date +%T) 태스크 2 · 정상 2를 기다림"; sleep 5; done
[ "$(running)" = 2 ] && [ "$(healthy)" = 2 ] || { echo "5분 기다려도 태스크 2 · 정상 2가 아님" >&2; exit 1; }
if [[ $kind == rds || $kind == az ]]; then
  [ "$(db MultiAZ)" = True ] || { echo "RDS가 Multi-AZ가 아님: 서울 apply -var multi_az=true 먼저" >&2; exit 1; }
fi

OUT=results/fault-$kind-$(date +%Y%m%d-%H%M%S)
mkdir -p "$OUT"
node writer.mjs "$OUT/writer.log" "$BASE" >"$OUT/writer.out" 2>&1 &
WRITER_PID=$!
# 2 ~ 5초마다 상태 한 줄: 시각 · 실행 중 · 원하는 수 · 배포 수 · 첫 배포 상태 · 정상 대상 수 · (DB 상태 · 주 AZ · 대기 AZ)
while :; do
  set +e # 한 번 늦거나 실패해도 기록은 계속
  line="$(now_ms) $(aws_t ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].[runningCount,desiredCount,length(deployments),deployments[0].rolloutState]' --output text | tr '\t' ' ') healthy=$(healthy)"
  [[ $kind == rds || $kind == az ]] && line+=" db=$(db '[DBInstanceStatus,AvailabilityZone,SecondaryAvailabilityZone]' | tr '\t' ',')"
  echo "$line"
  sleep 2
done >>"$OUT/state.log" 2>/dev/null &
STATE_PID=$!
BLOCKED=0
trap 'kill $WRITER_PID $STATE_PID 2>/dev/null; [ $BLOCKED = 1 ] && undo_az "$OUT"' EXIT

sleep 8
kill -0 $WRITER_PID 2>/dev/null || { cat "$OUT/writer.out" >&2; echo "손님 역할(writer)이 시작하지 못함" >&2; exit 1; }
mark start "평소 구간 ${BASELINE}초"
sleep "$BASELINE"
t_inject=$SECONDS

wait_until() { # $1 이름(marks.log), 나머지: 참이 될 때까지 3초마다 확인. MAX_WAIT 넘으면 timeout 표시
  local name=$1; shift
  until "$@"; do
    ((SECONDS - t_inject < MAX_WAIT)) || { mark "timeout_$name"; return 0; }
    sleep 3
  done
  mark "$name"
}

case "$kind" in
task)
  before=$(admin ecs list-tasks --cluster "$CLUSTER" --service-name app --desired-status RUNNING --query 'taskArns' --output text)
  victim=$(awk '{print $1}' <<<"$before")
  mark inject "${victim##*/}"
  admin ecs stop-task --cluster "$CLUSTER" --task "$victim" --reason "4단계 드릴: 태스크 강제 종료" >/dev/null
  dropped() { [ "$(healthy)" -lt 2 ]; }
  replaced() {
    local now
    now=$(aws_t ecs list-tasks --cluster "$CLUSTER" --service-name app --desired-status RUNNING --query 'taskArns' --output text)
    [ -n "$(tr '\t' '\n' <<<"$now" | grep -vxF -f <(tr '\t' '\n' <<<"$before") || true)" ] && [ "$(healthy)" = 2 ]
  }
  wait_until capacity_drop dropped
  wait_until recovered replaced
  ;;
rds)
  primary=$(db AvailabilityZone)
  since=$(date -u +%FT%TZ)
  mark inject "주 DB $primary"
  admin rds reboot-db-instance --db-instance-identifier "$CLUSTER" --force-failover >/dev/null
  # 장애 조치 이벤트(RDS 문서): 0013 시작, 0015 · 0049 완료
  event() { aws_t rds describe-events --source-identifier "$CLUSTER" --source-type db-instance --start-time "$since" --query 'Events[].Message' --output text | grep -qiE "$1"; }
  wait_until failover_started event 'failover started'
  wait_until failover_completed event 'failover completed|failover to standby complete'
  available() { [ "$(db DBInstanceStatus)" = available ]; }
  wait_until recovered available
  mark new_primary "$(db AvailabilityZone)"
  ;;
deploy)
  current=$(admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].taskDefinition' --output text)
  admin ecs describe-task-definition --task-definition "$current" --query taskDefinition --output json >"$OUT/td.json"
  # 같은 레시피에서 명령만 "바로 종료"로: 이미지 · 비밀값 · 로그는 그대로라 원인은 앱이 뜨지 않는 것 하나
  node -e '
    const td = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const k of ["taskDefinitionArn", "revision", "status", "requiresAttributes", "compatibilities", "registeredAt", "registeredBy", "deregisteredAt"]) delete td[k];
    td.containerDefinitions[0].command = ["node", "-e", "process.exit(1)"];
    console.log(JSON.stringify(td));' "$OUT/td.json" >"$OUT/td-broken.json"
  broken=$(admin ecs register-task-definition --cli-input-json "file://$OUT/td-broken.json" --query taskDefinition.taskDefinitionArn --output text)
  trap 'kill $WRITER_PID $STATE_PID 2>/dev/null; admin ecs deregister-task-definition --task-definition "$broken" >/dev/null 2>&1 || true' EXIT
  mark inject "${broken##*/}"
  admin ecs update-service --cluster "$CLUSTER" --service app --task-definition "$broken" >/dev/null
  deployments() { aws_t ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].deployments[].[status,taskDefinition,rolloutState]' --output text; }
  failed() { deployments | grep -q FAILED; }
  rolled_back() { local d; d=$(deployments); [ "$(wc -l <<<"$d")" = 1 ] && grep -q "PRIMARY.*$current.*COMPLETED" <<<"$d"; }
  wait_until breaker_failed failed
  wait_until recovered rolled_back
  ;;
az)
  az=${2:-$(db AvailabilityZone)}
  vpc=$(admin ec2 describe-subnets --subnet-ids "$(admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].networkConfiguration.awsvpcConfiguration.subnets[0]' --output text)" --query 'Subnets[0].VpcId' --output text)
  for s in $(admin ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc" "Name=availability-zone,Values=$az" --query 'Subnets[].SubnetId' --output text); do
    echo "$s $(admin ec2 describe-network-acls --filters "Name=association.subnet-id,Values=$s" --query "NetworkAcls[0].[NetworkAclId, Associations[?SubnetId=='$s'] | [0].NetworkAclAssociationId]" --output text)"
  done | tr '\t' ' ' >"$OUT/nacl-orig.tsv"
  [ -s "$OUT/nacl-orig.tsv" ] || { echo "$az 서브넷을 못 찾음" >&2; exit 1; }
  # 새로 만든 네트워크 ACL은 규칙이 없어 들어오고 나가는 것을 모두 막는다(VPC 문서)
  deny=$(admin ec2 create-network-acl --vpc-id "$vpc" --tag-specifications 'ResourceType=network-acl,Tags=[{Key=Name,Value=drill-az-block}]' --query NetworkAcl.NetworkAclId --output text)
  echo "$deny" >"$OUT/nacl-deny.txt"
  mark inject "$az 서브넷 $(wc -l <"$OUT/nacl-orig.tsv")개"
  BLOCKED=1
  while read -r subnet orig assoc; do
    echo "$subnet $orig $(admin ec2 replace-network-acl-association --association-id "$assoc" --network-acl-id "$deny" --query NewAssociationId --output text)"
  done <"$OUT/nacl-orig.tsv" >"$OUT/nacl-blocked.tsv"
  # 네트워크만 막으면 RDS는 장애로 보지 않을 수 있어, FIS AZ 시나리오처럼 그 AZ의 주 DB를 장애 조치로 넘김
  if [ "$(db AvailabilityZone)" = "$az" ]; then
    admin rds reboot-db-instance --db-instance-identifier "$CLUSTER" --force-failover >/dev/null
    mark db_failover
  fi
  dropped() { [ "$(healthy)" -lt 2 ]; }
  wait_until capacity_drop dropped
  restored() { [ "$(healthy)" -ge 2 ] || ((SECONDS - t_inject >= HOLD_AZ)); }
  wait_until capacity_check restored # 막힌 동안 다른 AZ에서 정상 2가 되면 그 시각, 아니면 막는 시간이 끝난 시각
  sleep $((HOLD_AZ - (SECONDS - t_inject) > 0 ? HOLD_AZ - (SECONDS - t_inject) : 0))
  mark undo
  undo_az "$OUT"
  BLOCKED=0
  all_ok() { [ "$(healthy)" = 2 ] && [ "$(db DBInstanceStatus)" = available ]; }
  wait_until recovered all_ok
  ;;
esac

sleep "$TAIL"
mark end
kill $WRITER_PID $STATE_PID 2>/dev/null || true
since=$(date -u -d "@$(($(date +%s) - BASELINE - TAIL - (SECONDS - t_inject) - 300))" +%FT%TZ)
{
  echo "## ECS 서비스 이벤트 (최근 30개)"
  admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].events[:30].[createdAt,message]' --output text
  echo "## RDS 이벤트"
  admin rds describe-events --source-identifier "$CLUSTER" --source-type db-instance --start-time "$since" --query 'Events[].[Date,Message]' --output text
} >"$OUT/events.txt" 2>&1 || true
node ../scripts/drill-report.mjs "$OUT" | tee "$OUT/report.md"
echo "결과: drill/$OUT/"
