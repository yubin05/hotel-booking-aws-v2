#!/usr/bin/env bash
# 5단계 리전 복원 드릴 1회 (docs/experiments/region-drill.md, 02 8 · 9절, ADR-066 Pilot Light): 서울 장애를 선언하고 도쿄 복제본을 승격해 손님을 받은 뒤 서울로 되돌린다
#   bash drill/region.sh standby    도쿄에 서울 DB의 읽기 복제본과 그 네트워크만 만듦(평소 대기 상태, 7개). 회차마다 run 전에
#   bash drill/region.sh run        전환(RTO · RPO) → Enter → 되돌리기. Terraform plan마다 yes 확인 (사람이 확인한 시간은 따로 셈)
#   bash drill/region.sh stop <결과 폴더>   run이 중간에 멈췄을 때: 남은 단계를 손으로 끝낸 뒤 계속 도는 측정기 · DB 상태 기록기를 끝내고 보고서
#   bash drill/region.sh seoul-up   중간에 멈췄을 때 서울 앱을 다시 2 ~ 4로 (global은 terraform apply로 서울에)
# 결과: drill/results/region-<시각>/ writer.log(손님 쪽), marks.log · steps.log(단계 시각), db-state.log(도쿄 DB 상태 10초마다), tokyo-check.txt(승격 DB 확인),
#       lost-in-seoul.txt(대조: 서울에만 있던 쓰기), dump.log · restore.log(되돌리기 체크섬), tf-*.log(plan · apply 출력), report.md
# 필요: 서울 · global이 떠 있고 도쿄는 standby, 평소 사용자 로그인(Terraform · DB 상태 기록) + 관리자 로그인(aws)
set -Eeuo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
source ../migration/lib.sh # admin() · run_task() · CLUSTER · REGION(서울)
SEOUL=ap-northeast-2
TOKYO=ap-northeast-1
INFRA=../infra
BASE=https://hotel.vundle34.cloud
KEY_PARAM=/hotel-booking/migration-key
in_region() { local r=$1; shift; AWS_PROFILE=admin timeout 60 aws --region "$r" "$@" | tr -d '\r'; }
now_ms() { echo $(($(date +%s%N) / 1000000)); }
mark() { echo "$1 $(now_ms) ${2:-}" >>"$OUT/marks.log"; echo "$(date +%T) $*" | tee -a "$OUT/steps.log"; }
code() { curl -s -m 5 -o /dev/null -w '%{http_code}' "$1" || true; }

# 앱 태스크 수: 최소 · 최대(오토스케일링 범위)와 지금 원하는 수. 0이면 그 리전 앱이 멈춤(장애 · 점검 흉내)
scale_app() {
  in_region "$1" application-autoscaling register-scalable-target --service-namespace ecs --resource-id "service/$CLUSTER/app" \
    --scalable-dimension ecs:service:DesiredCount --min-capacity "$2" --max-capacity "$3" >/dev/null
  in_region "$1" ecs update-service --cluster "$CLUSTER" --service app --desired-count "$4" >/dev/null
}
healthy() { # $1 리전
  local tg
  tg=$(in_region "$1" elbv2 describe-target-groups --names "$CLUSTER-app" --query 'TargetGroups[0].TargetGroupArn' --output text)
  in_region "$1" elbv2 describe-target-health --target-group-arn "$tg" --query "length(TargetHealthDescriptions[?TargetHealth.State=='healthy'])" --output text
}
# 손님 쓰기가 $2(리전) 앱에서 성공했는지: 표시 $1 이후 writer.log에서
write_ok_in() { awk -F'\t' -v t="$1" -v r="$2" '$1 > t && $2 == "write" && ($4 == 200 || $4 == 201) && index($6, r) == 1 { found = 1 } END { exit !found }' "$OUT/writer.log"; }
mark_ms() { awk -v n="$1" '$1 == n { print $2 }' "$OUT/marks.log" | tail -1; }
wait_for() { # $1 설명, $2 최대 초, 나머지: 조건
  local what=$1 max=$2 t=$SECONDS; shift 2
  until "$@"; do ((SECONDS - t < max)) || { echo "$what: ${max}초 안에 안 됨" >&2; exit 1; }; sleep 3; done
}

tf_apply() { # $1 루트, $2 이름, 나머지 plan 인자(-target 등. 변수는 terraform.tfvars로). plan → 사람 확인 → 그 plan 그대로 apply
  local root=$1 name=$2 ok t
  shift 2
  mark "${name}_plan"
  # plan 파일은 결과 폴더에(git 제외). -chdir 기준 상대 경로: infra/<루트> → ../../drill/...
  terraform -chdir="$INFRA/$root" plan -input=false -no-color -out="../../drill/$OUT/$name.tfplan" "$@" >"$OUT/tf-$name-plan.log" 2>&1 ||
    { tail -20 "$OUT/tf-$name-plan.log" >&2; exit 1; }
  grep -E '^Plan:|No changes' "$OUT/tf-$name-plan.log" | tee -a "$OUT/steps.log"
  t=$SECONDS
  read -rp "$root apply 할까요? (yes): " ok
  HUMAN=$((HUMAN + SECONDS - t))
  [ "$ok" = yes ] || { echo "멈춤" >&2; exit 1; }
  mark "${name}_apply"
  terraform -chdir="$INFRA/$root" apply -input=false -no-color "../../drill/$OUT/$name.tfplan" >"$OUT/tf-$name-apply.log" 2>&1 ||
    { tail -20 "$OUT/tf-$name-apply.log" >&2; exit 1; }
  mark "${name}_done"
}

# terraform.tfvars의 한 줄을 쓰거나(값) 지움(값 없음). -var 대신 파일에 남겨, 손으로 하는 plan · apply도 같은 값을 쓴다 (infra/README.md 0절)
tfvar() { # $1 루트, $2 변수 이름, $3 HCL 값(따옴표 포함, 없으면 줄 삭제)
  local f="$INFRA/$1/terraform.tfvars"
  touch "$f"
  sed -i "/^$2[[:space:]]*=/d" "$f"
  if [ -n "${3:-}" ]; then echo "$2 = $3" >>"$f"; fi
}

tokyo_db() { in_region "$TOKYO" rds describe-db-instances --db-instance-identifier "$CLUSTER" --query 'DBInstances[0].[DBInstanceStatus,ReadReplicaSourceDBInstanceIdentifier]' --output text 2>/dev/null | tr '\t' ' '; }

standby() { # 도쿄 = 서울 DB의 읽기 복제본 + 그 DB가 놓일 네트워크(7개). 나머지 도쿄 인프라는 장애 선언 뒤 run이 만든다
  local src
  src=$(admin rds describe-db-instances --db-instance-identifier "$CLUSTER" --query 'DBInstances[0].DBInstanceArn' --output text)
  [[ $src == arn:aws:rds:* ]] || { echo "서울 DB가 없음: 서울 apply 먼저" >&2; exit 1; }
  # shortcut: -target으로 DB와 그 의존(VPC · DB 서브넷 · 보안 그룹 · 설정표)만 만든다. Terraform은 평소 쓰지 말라고 경고하지만 대기 상태 한 단계에만 씀. 상시 운영이면 모듈에 standby 변수로 나눔
  tfvar tokyo replica_source_arn "\"$src\""
  date; terraform -chdir="$INFRA/tokyo" apply -target=module.regional.aws_db_instance.this; date
  echo "도쿄 DB (available + 서울 ARN이면 대기 완료): $(tokyo_db)"
}

stop() { # $1 결과 폴더 (drill/results/... 또는 results/...)
  local d=${1:?사용: bash drill/region.sh stop drill/results/region-<시각>}
  d=${d#drill/}
  for f in writer db-state; do
    if [ -s "$d/$f.pid" ]; then kill "$(cat "$d/$f.pid")" 2>/dev/null && echo "$f 멈춤"; rm -f "$d/$f.pid"; fi
  done
  node ../scripts/drill-report.mjs "$d" | tee "$d/report.md"
}

seoul_up() {
  scale_app "$SEOUL" 2 4 2 # autoscaling.tf의 평소 범위
  tfvar global active_region # 기본값(서울)
  echo "서울 앱 2 ~ 4로 되돌림, global terraform.tfvars를 서울로. global이 도쿄면: cd infra/global && terraform apply"
}

run() {
  OUT=results/region-$(date +%Y%m%d-%H%M%S)
  mkdir -p "$OUT"
  HUMAN=0
  local arn lag max= rp t0 run_id name get_url put_url
  arn=$(admin sts get-caller-identity --query Arn --output text)
  [[ "$arn" == *:assumed-role/* ]] || { echo "관리자 역할이 아님: $arn (aws login --profile admin)" >&2; exit 1; }
  local bucket=hotel-booking-aws-v2-migration-$(cut -d: -f5 <<<"$arn")-$SEOUL-an # bootstrap migration.tf

  # 0) 사전: 서울이 손님을 받는 중, 도쿄는 standby(서울 DB의 복제본만)
  [ "$(code "$BASE/api/health/deep")" = 200 ] || { echo "새 주소가 안 뜸: 서울 · global 먼저" >&2; exit 1; }
  [[ "$(tokyo_db)" == "available arn:"* ]] || { echo "도쿄가 대기 상태(복제본 available)가 아님: $(tokyo_db) → bash drill/region.sh standby" >&2; exit 1; }

  # 측정기 · DB 상태 기록기는 스크립트가 멈춰도 계속 돈다(11-21 시도 2 · 3은 스크립트와 함께 꺼져 RTO를 못 잼). 끝은 run 마지막 또는 region.sh stop
  node writer.mjs "$OUT/writer.log" "$BASE" >"$OUT/writer.out" 2>&1 &
  echo $! >"$OUT/writer.pid"
  trap 'echo "멈춤(위 단계). 측정기는 계속 돎 → 남은 단계를 손으로 끝낸 뒤 bash drill/region.sh stop drill/$OUT. 서울로 되돌리기: bash drill/region.sh seoul-up → cd infra/global && terraform apply" >&2' ERR
  sleep 8
  kill -0 "$(cat "$OUT/writer.pid")" 2>/dev/null || { cat "$OUT/writer.out" >&2; exit 1; }
  # 평소 사용자 권한으로 10초마다 도쿄 DB 상태. Terraform 대기와 따로 "DB를 쓸 수 있게 된 시각"(승격 끝 = available + 원본 없음)을 남김
  (
    set +e
    trap - ERR
    written=0
    while :; do
      s=$(timeout 30 aws --region "$TOKYO" rds describe-db-instances --db-instance-identifier "$CLUSTER" --query 'DBInstances[0].[DBInstanceStatus,ReadReplicaSourceDBInstanceIdentifier]' --output text 2>&1 | tr -d '\r' | tr '\t' ' ')
      echo "$(now_ms) $s" >>"$OUT/db-state.log"
      if [ $written = 0 ] && [ "$s" = "available None" ] && grep -q '^t0 ' "$OUT/marks.log"; then mark tokyo_db_writable; written=1; fi
      sleep 10
    done
  ) >/dev/null 2>&1 &
  echo $! >"$OUT/db-state.pid"
  run_id=$(sed -n 's/^# run=\([^ ]*\).*/\1/p' "$OUT/writer.log")
  mark start "writer $run_id"
  # 복제본이 손님 가입 · 첫 쓰기를 받을 시간. 복제 지연은 문서에 숫자가 없어 장애 선언 때의 ReplicaLag로 잰다
  sleep 60

  # ② 장애 선언: 서울 앱을 멈춘다(장애 흉내). 실제 장애면 이 순간 복제가 끊긴다
  mark t0
  scale_app "$SEOUL" 0 0 0
  t0=$(mark_ms t0)
  # 예상 RPO = 장애 선언 때 복제 지연(초). 드릴에선 서울 DB가 살아 있어 선언 뒤에도 복제가 따라와 실제 잃은 쓰기는 0에 가깝게 나온다(한계, region-drill.md)
  lag=$(in_region "$TOKYO" cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name ReplicaLag --dimensions "Name=DBInstanceIdentifier,Value=$CLUSTER" \
    --start-time "$(date -u -d '-5 min' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" --period 60 --statistics Maximum \
    --query 'sort_by(Datapoints, &Timestamp)[-1].Maximum' --output text) || lag=-
  mark replica_lag_s "$lag"
  echo "    예상 RPO(장애 선언 때 복제 지연): ${lag}초"

  # ③ 도쿄 DB 승격: replica_source_arn을 빼면 공급자가 승격하고 도쿄 금고를 붙인다. 이관 태스크 정의가 그 금고 주소를 써서 DB만 먼저(-target)
  #    shortcut: 승격과 금고 붙이기가 한 apply에서 되는지는 첫 드릴에서 확인. 실패하면 같은 명령을 한 번 더(금고만 붙음)
  tfvar tokyo replica_source_arn
  tf_apply tokyo tokyo_promote -target=module.regional.aws_db_instance.this
  # ③' 나머지 도쿄 인프라(ALB · ECS · NAT · 통로 · 태스크 정의)
  tf_apply tokyo tokyo

  # ④ 승격 DB 확인(도쿄 안 sql 태스크): 장애 선언 전 손님 쓰기가 몇 번까지 들어 있나 + 주요 표 행 수
  #    created_at < t0: 되돌리기 전에 다시 셀 때도 도쿄에서 새로 받은 예약이 섞이지 않게 (DB 시각은 UTC)
  cat >"$OUT/check.sql" <<SQL
SELECT COUNT(*) AS drill_bookings, COALESCE(MAX(CAST(SUBSTRING_INDEX(idempotency_key, '-', -1) AS UNSIGNED)), 0) AS max_seq
  FROM bookings WHERE idempotency_key LIKE 'drill-$run_id-%' AND created_at < '$(date -u -d "@$((t0 / 1000))" '+%F %T')';
SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM hotels) AS hotels, (SELECT COUNT(*) FROM bookings) AS bookings;
SQL
  check() {
    REGION=$TOKYO bash ../migration/sql.sh "$OUT/check.sql" | tee "$OUT/tokyo-check.txt" || return 1
    max=$(awk -F'|' '/max_seq/ { getline; getline; gsub(/ /, "", $3); print $3; exit }' "$OUT/tokyo-check.txt")
    [[ "$max" =~ ^[0-9]+$ ]] && mark restored_max_seq "$max"
  }
  mark check_start
  # 확인이 실패해도(11-21 시도 2: 관리자 세션 만료) 손님 복구가 먼저라 전환은 계속하고, 되돌리기 전에 다시 센다
  check || { max=; mark check_failed; echo "확인 SQL 실패 → 전환은 계속, 순번은 되돌리기 전에 다시 셈" >&2; }

  # ⑤ CloudFront 원본을 도쿄로 (ADR-035)
  tfvar global active_region "\"$TOKYO\"" # 전환한 동안 손으로 하는 global apply도 도쿄를 유지
  tf_apply global global_to_tokyo
  # ⑥ 손님 쓰기가 도쿄 앱에서 성공 = 복구 끝
  wait_for "도쿄에서 손님 쓰기 성공" 900 write_ok_in "$t0" "$TOKYO"
  mark rto_end
  mark human_wait_sec "$HUMAN"
  local rto=$((($(mark_ms rto_end) - t0) / 1000))
  echo "    RTO ${rto}초 (사람 확인 ${HUMAN}초 포함, 빼면 $((rto - HUMAN))초)" | tee -a "$OUT/steps.log"

  read -rp "도쿄에서 운영 중. 확인 · 녹화 뒤 Enter로 되돌리기 (관리자 세션은 2시간, 필요하면 콘솔에서 역할을 새로 전환하고 다른 창에서 aws login --profile admin): " _
  [ -n "$max" ] || check || { echo "승격 DB에서 순번을 못 읽음 (tokyo-check.txt)" >&2; exit 1; }

  # 되돌리기 ① 도쿄 쓰기 멈춤(계획된 점검) → 태스크가 모두 내려갈 때까지
  mark failback_start
  scale_app "$TOKYO" 0 0 0
  running_tokyo() { [ "$(in_region "$TOKYO" ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].runningCount' --output text)" = 0 ]; }
  wait_for "도쿄 앱 멈춤" 300 running_tokyo
  mark tokyo_stopped

  # ② 대조: 서울 옛 DB에서 도쿄에 남은 마지막 손님 쓰기 뒤 바뀐 예약을 덮기 전에 뽑아 둠 (= 도쿄가 몰랐던 새 예약 · 날짜 변경 · 취소, 고객사가 처리할 목록)
  rp=$(awk -F'\t' -v s="$max" '$2 == "write" && $3 == s && $4 >= 200 && $4 < 300 { t = $1 } END { print int(t / 1000) }' "$OUT/writer.log")
  ((rp > 0)) || rp=$((t0 / 1000 - 600)) # 남은 쓰기가 하나도 없으면 선언 10분 전부터
  # 취소는 행을 지우지 않고 status를 바꾸며, updated_at은 바뀔 때마다 갱신되고 이 대조용 색인이 있음(앱 db/schema.sql). DB 시각은 UTC
  cat >"$OUT/lost.sql" <<SQL
SELECT IF(created_at > '$(date -u -d "@$rp" '+%F %T')', 'new', 'changed') AS kind, id, user_id, room_id, check_in_date, check_out_date, status, updated_at,
       idempotency_key LIKE 'drill-$run_id-%' AND CAST(SUBSTRING_INDEX(idempotency_key, '-', -1) AS UNSIGNED) > $max AS drill_lost
  FROM bookings WHERE updated_at > '$(date -u -d "@$rp" '+%F %T')' ORDER BY updated_at;
SQL
  bash ../migration/sql.sh "$OUT/lost.sql" | tee "$OUT/lost-in-seoul.txt"
  mark compare_done

  # ③ 도쿄 덤프 → S3(서울 이관 버킷) → 서울 복원. 키는 서울 SSM 한 곳(도쿄 태스크는 전체 ARN으로 읽음)
  admin ssm put-parameter --name "$KEY_PARAM" --type SecureString --overwrite --value "$(openssl rand -base64 48)" >/dev/null
  name=failback-$(date +%m%d-%H%M)
  get_url=$(admin s3 presign "s3://$bucket/$name.sql.gz.enc" --expires-in 900)
  # 관리자 임시 자격 증명으로 PUT 주소 서명. 하위 셸 안에서만 환경 변수로 둠
  put_url=$(eval "$(AWS_PROFILE=admin aws configure export-credentials --format env | tr -d '\r')" && node presign-put.mjs "$get_url" 900)
  mark dump_start
  REGION=$TOKYO run_task dump "{\"containerOverrides\":[{\"name\":\"dump\",\"environment\":[{\"name\":\"DUMP_PUT_URL\",\"value\":\"$put_url\"}]}]}" >"$OUT/dump.log"
  mark restore_start
  run_task restore "{\"containerOverrides\":[{\"name\":\"restore\",\"environment\":[{\"name\":\"DUMP_URL\",\"value\":\"$get_url\"}]}]}" >"$OUT/restore.log"
  grep -E '^(SUM|MARK) ' "$OUT/dump.log" >"$OUT/tokyo.sum"
  grep -E '^(SUM|MARK) ' "$OUT/restore.log" >"$OUT/seoul.sum"
  if ! diff "$OUT/tokyo.sum" "$OUT/seoul.sum"; then mark checksum_mismatch; exit 1; fi
  mark checksum_ok "$(grep -c '^SUM' "$OUT/seoul.sum") tables"
  admin s3 rm --quiet "s3://$bucket/$name.sql.gz.enc"
  admin ssm delete-parameter --name "$KEY_PARAM"

  # ④ 서울 앱 다시 → ⑤ 원본을 서울로 → ⑥ 손님 쓰기가 서울에서 성공
  seoul_up >/dev/null
  healthy_seoul() { [ "$(healthy "$SEOUL")" = 2 ]; }
  wait_for "서울 정상 2" 600 healthy_seoul
  mark seoul_healthy
  tfvar global active_region
  tf_apply global global_to_seoul
  wait_for "서울에서 손님 쓰기 성공" 900 write_ok_in "$(mark_ms failback_start)" "$SEOUL"
  mark failback_end
  echo "    되돌리기 중단 $((($(mark_ms failback_end) - $(mark_ms failback_start)) / 1000))초 (도쿄 멈춤 → 서울에서 쓰기 성공)" | tee -a "$OUT/steps.log"

  sleep 60
  mark end
  trap - ERR
  stop "$OUT"
  echo "결과: drill/$OUT/"
  echo "다음: 도쿄 내리기 cd infra/tokyo && terraform destroy (51개). 다음 회차는 standby부터"
}

case "${1:-}" in
standby) standby ;;
run) run ;;
stop) stop "${2:-}" ;;
seoul-up) seoul_up ;;
*) sed -n '3,6p' "$0" >&2; exit 1 ;;
esac
