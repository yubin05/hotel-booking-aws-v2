#!/usr/bin/env bash
# 5단계 리전 복원 드릴 1회 (docs/experiments/region-drill.md, 02 8 · 9절, ADR-062): 서울 장애를 선언하고 도쿄에서 복원한 뒤 서울로 되돌린다
#   bash drill/region.sh run        전환(RTO · RPO) → Enter → 되돌리기. Terraform plan마다 yes 확인 (사람이 확인한 시간은 따로 셈)
#   bash drill/region.sh cleanup    도쿄에 남은 복제 백업 지우기 (서울 -var backup_replication 없이 apply 또는 서울 destroy 뒤, 남으면 요금)
#   bash drill/region.sh seoul-up   중간에 멈췄을 때 서울 앱을 다시 2 ~ 4로 (global은 terraform apply로 서울에)
# 결과: drill/results/region-<시각>/ writer.log(손님 쪽), marks.log · steps.log(단계 시각), tokyo-check.txt(복원 DB 확인),
#       lost-in-seoul.txt(대조: 서울에만 있던 쓰기), dump.log · restore.log(되돌리기 체크섬), tf-*.log(plan · apply 출력), report.md
# 필요: 서울(-var backup_replication=true, 복제가 도는 중) · global이 떠 있고 도쿄는 비어 있음, 평소 사용자 로그인(Terraform) + 관리자 로그인(aws)
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

tf_apply() { # $1 루트, $2 이름, 나머지 -var. plan → 사람 확인 → 그 plan 그대로 apply
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

cleanup() {
  local arns
  arns=$(in_region "$TOKYO" rds describe-db-instance-automated-backups --query "DBInstanceAutomatedBackups[?Status=='retained'].DBInstanceAutomatedBackupsArn" --output text)
  for a in $arns; do in_region "$TOKYO" rds delete-db-instance-automated-backup --db-instance-automated-backups-arn "$a" >/dev/null && echo "지움 $a"; done
  echo "도쿄에 남은 자동 백업 (비어 있어야 함. replicating이면 서울 복제가 아직 켜져 있음):"
  in_region "$TOKYO" rds describe-db-instance-automated-backups --query 'DBInstanceAutomatedBackups[].[DBInstanceIdentifier,Status,DBInstanceAutomatedBackupsArn]' --output text
}

seoul_up() {
  scale_app "$SEOUL" 2 4 2 # autoscaling.tf의 평소 범위
  echo "서울 앱 2 ~ 4로 되돌림. global이 도쿄면: cd infra/global && terraform apply (-var 없이 = 서울)"
}

run() {
  OUT=results/region-$(date +%Y%m%d-%H%M%S)
  mkdir -p "$OUT"
  HUMAN=0
  local arn dbi backup_arn lt lt0 restore_time max t0 run_id name get_url put_url
  arn=$(admin sts get-caller-identity --query Arn --output text)
  [[ "$arn" == *:assumed-role/* ]] || { echo "관리자 역할이 아님: $arn (aws login --profile admin)" >&2; exit 1; }
  local bucket=hotel-booking-aws-v2-migration-$(cut -d: -f5 <<<"$arn")-$SEOUL-an # bootstrap migration.tf

  # 0) 사전: 서울이 손님을 받는 중, 도쿄는 비어 있음, 서울 백업이 도쿄로 복제 중
  [ "$(code "$BASE/api/health/deep")" = 200 ] || { echo "새 주소가 안 뜸: 서울 · global 먼저" >&2; exit 1; }
  local tokyo_state
  tokyo_state=$(terraform -chdir="$INFRA/tokyo" state list) || { echo "도쿄 state를 못 읽음: terraform -chdir=infra/tokyo init · aws login" >&2; exit 1; }
  [ -z "$tokyo_state" ] || { echo "도쿄가 이미 있음: 지난 회차 뒤 terraform destroy" >&2; exit 1; }
  dbi=$(admin rds describe-db-instances --db-instance-identifier "$CLUSTER" --query 'DBInstances[0].DbiResourceId' --output text)
  backup_arn=$(in_region "$TOKYO" rds describe-db-instance-automated-backups --dbi-resource-id "$dbi" --query 'DBInstanceAutomatedBackups[0].DBInstanceAutomatedBackupsArn' --output text)
  [[ "$backup_arn" == arn:* ]] || { echo "도쿄에 복제된 백업이 없음: 서울 apply -var backup_replication=true 먼저" >&2; exit 1; }
  latest() { in_region "$TOKYO" rds describe-db-instance-automated-backups --db-instance-automated-backups-arn "$backup_arn" --query 'DBInstanceAutomatedBackups[0].RestoreWindow.LatestTime' --output text; }

  node writer.mjs "$OUT/writer.log" "$BASE" >"$OUT/writer.out" 2>&1 &
  WRITER_PID=$!
  trap 'kill $WRITER_PID 2>/dev/null' EXIT
  trap 'echo "멈춤(위 단계). 서울로 되돌리기: bash drill/region.sh seoul-up → global terraform apply(-var 없이)" >&2' ERR
  sleep 8
  kill -0 $WRITER_PID 2>/dev/null || { cat "$OUT/writer.out" >&2; exit 1; }
  run_id=$(sed -n 's/^# run=\([^ ]*\).*/\1/p' "$OUT/writer.log")
  mark start "writer $run_id"
  # 복원 가능 시각이 손님 가입 + 1분을 넘을 때까지: 그래야 복원한 도쿄에 손님 계정과 쓰기가 있다 (복제 지연을 여기서 봄)
  local w0=$(($(date +%s) - 8))
  until lt=$(latest) && [ "$(date -d "$lt" +%s 2>/dev/null || echo 0)" -ge $((w0 + 60)) ]; do
    echo "$(date +%T) 도쿄 복원 가능 시각 $lt (복제 기다리는 중)"
    sleep 30
  done

  # ② 장애 선언: 이 순간 도쿄에서 복원할 수 있는 가장 최근 시각으로 복원한다(실제 장애면 그 뒤 복제가 끊김)
  lt0=$(latest)
  mark t0 "$lt0"
  scale_app "$SEOUL" 0 0 0
  t0=$(mark_ms t0)
  echo "    예상 RPO(장애 선언 − 복원 가능 시각): $((t0 / 1000 - $(date -d "$lt0" +%s)))초"
  restore_time=$(date -u -d "$lt0" +%Y-%m-%dT%H:%M:%SZ) # 초 아래는 버림(복원 가능 시각보다 늦으면 안 됨)

  # ③ 도쿄 인프라 + 복제된 백업으로 RDS 시점 복원 (apply 한 번)
  tf_apply tokyo tokyo -var "restore_backup_arn=$backup_arn" -var "restore_time=$restore_time"

  # ④ 복원 DB 확인(도쿄 안 sql 태스크): 손님 쓰기가 몇 번까지 들어 있나 + 주요 표 행 수
  cat >"$OUT/check.sql" <<SQL
SELECT COUNT(*) AS drill_bookings, COALESCE(MAX(CAST(SUBSTRING_INDEX(idempotency_key, '-', -1) AS UNSIGNED)), 0) AS max_seq
  FROM bookings WHERE idempotency_key LIKE 'drill-$run_id-%';
SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM hotels) AS hotels, (SELECT COUNT(*) FROM bookings) AS bookings;
SQL
  mark check_start
  REGION=$TOKYO bash ../migration/sql.sh "$OUT/check.sql" | tee "$OUT/tokyo-check.txt"
  max=$(awk -F'|' '/max_seq/ { getline; getline; gsub(/ /, "", $3); print $3; exit }' "$OUT/tokyo-check.txt")
  [[ "$max" =~ ^[0-9]+$ ]] || { echo "복원 DB에서 순번을 못 읽음 (tokyo-check.txt)" >&2; exit 1; }
  mark restored_max_seq "$max"

  # ⑤ CloudFront 원본을 도쿄로 (ADR-035)
  tf_apply global global_to_tokyo -var "active_region=$TOKYO"
  # ⑥ 손님 쓰기가 도쿄 앱에서 성공 = 복구 끝
  wait_for "도쿄에서 손님 쓰기 성공" 900 write_ok_in "$t0" "$TOKYO"
  mark rto_end
  mark human_wait_sec "$HUMAN"
  local rto=$((($(mark_ms rto_end) - t0) / 1000))
  echo "    RTO ${rto}초 (사람 확인 ${HUMAN}초 포함, 빼면 $((rto - HUMAN))초)" | tee -a "$OUT/steps.log"

  read -rp "도쿄에서 운영 중. 확인 · 녹화 뒤 Enter로 되돌리기 (관리자 세션이 1시간이라 필요하면 다른 창에서 aws login --profile admin): " _

  # 되돌리기 ① 도쿄 쓰기 멈춤(계획된 점검) → 태스크가 모두 내려갈 때까지
  mark failback_start
  scale_app "$TOKYO" 0 0 0
  running_tokyo() { [ "$(in_region "$TOKYO" ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].runningCount' --output text)" = 0 ]; }
  wait_for "도쿄 앱 멈춤" 300 running_tokyo
  mark tokyo_stopped

  # ② 대조: 서울 옛 DB에서 복원 시점 뒤 바뀐 예약을 덮기 전에 뽑아 둠 (= 도쿄가 몰랐던 새 예약 · 날짜 변경 · 취소, 고객사가 처리할 목록)
  # 취소는 행을 지우지 않고 status를 바꾸며, updated_at은 바뀔 때마다 갱신되고 이 대조용 색인이 있음(앱 db/schema.sql). DB 시각은 UTC
  cat >"$OUT/lost.sql" <<SQL
SELECT IF(created_at > '$(date -u -d "$lt0" '+%F %T')', 'new', 'changed') AS kind, id, user_id, room_id, check_in_date, check_out_date, status, updated_at,
       idempotency_key LIKE 'drill-$run_id-%' AND CAST(SUBSTRING_INDEX(idempotency_key, '-', -1) AS UNSIGNED) > $max AS drill_lost
  FROM bookings WHERE updated_at > '$(date -u -d "$lt0" '+%F %T')' ORDER BY updated_at;
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
  tf_apply global global_to_seoul
  wait_for "서울에서 손님 쓰기 성공" 900 write_ok_in "$(mark_ms failback_start)" "$SEOUL"
  mark failback_end
  echo "    되돌리기 중단 $((($(mark_ms failback_end) - $(mark_ms failback_start)) / 1000))초 (도쿄 멈춤 → 서울에서 쓰기 성공)" | tee -a "$OUT/steps.log"

  sleep 60
  mark end
  trap - ERR
  kill $WRITER_PID 2>/dev/null || true
  node ../scripts/drill-report.mjs "$OUT" | tee "$OUT/report.md"
  echo "결과: drill/$OUT/"
  echo "다음: 도쿄 내리기 cd infra/tokyo && terraform destroy (50개 안팎). 다음 회차는 도쿄가 빈 뒤 다시 run"
}

case "${1:-}" in
run) run ;;
cleanup) cleanup ;;
seoul-up) seoul_up ;;
*) sed -n '3,5p' "$0" >&2; exit 1 ;;
esac
