#!/usr/bin/env bash
# 쿠폰 회차의 발급 시간 쪼개기 (쏠림 병목 진단 0단계, docs/experiments/migration.md 3절):
# 앱 로그 coupon_claim_timing(앱 7d487c2~)을 Logs Insights로 모아 결과별로 연결 대기 · 작업 시간 p50 · p95
#   bash load/coupon-timing.sh load/results/coupon-<조건>-<시각>
#   pre = 소진 확인(공용 연결 pool), tx = 발급 트랜잭션(쿠폰 연결 couponPool). *_wait = 빈 연결을 기다린 시간
# 관리자(평소 사용자에겐 로그 검색 권한이 없음). 결과: <폴더>/coupon-timing.json · coupon-timing.txt
set -Eeuo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash가 /ecs/... 로그 그룹 이름을 경로로 바꾸지 않게
dir=${1:?결과 폴더 (load/results/coupon-...)}
id=$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$dir/coupon.txt" | head -1)
[ -n "$id" ] || { echo "쿠폰 id 없음: $dir/coupon.txt" >&2; exit 1; }
# 폴더 이름의 시작 시각(이 PC 시간대) ~ 1시간
stamp=$(basename "$dir" | grep -oE '[0-9]{8}-[0-9]{6}$' | sed -E 's/(....)(..)(..)-(..)(..)(..)/\1-\2-\3 \4:\5:\6/')
start=$(date -d "$stamp" +%s)
end=$((start + 3600))
q="fields outcome, pre_wait_ms, pre_ms, tx_wait_ms, tx_ms
| filter event = \"coupon_claim_timing\" and coupon_id = \"$id\"
| stats count(*) as n, pct(pre_wait_ms, 50) as pre_wait_p50, pct(pre_wait_ms, 95) as pre_wait_p95, pct(pre_ms, 95) as pre_p95,
        pct(tx_wait_ms, 50) as tx_wait_p50, pct(tx_wait_ms, 95) as tx_wait_p95, max(tx_wait_ms) as tx_wait_max, pct(tx_ms, 95) as tx_p95 by outcome"
logs() { AWS_PROFILE=admin aws logs "$@" --region ap-northeast-2; }
qid=$(logs start-query --log-group-name /ecs/hotel-booking-aws-v2 --start-time "$start" --end-time "$end" --query-string "$q" --query queryId --output text)
for _ in $(seq 60); do
  [ "$(logs get-query-results --query-id "$qid" --query status --output text)" = Complete ] && break
  sleep 2
done
logs get-query-results --query-id "$qid" --output json >"$dir/coupon-timing.json"
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (r.status !== "Complete") { console.error("조회가 끝나지 않음:", r.status); process.exit(1); }
const cols = ["outcome", "n", "pre_wait_p50", "pre_wait_p95", "pre_p95", "tx_wait_p50", "tx_wait_p95", "tx_wait_max", "tx_p95"];
console.log("| " + cols.join(" | ") + " |\n|" + cols.map(() => "---").join("|") + "|");
for (const row of r.results) {
  const m = Object.fromEntries(row.map((c) => [c.field, c.value]));
  console.log("| " + cols.map((c) => (c === "outcome" || c === "n" ? m[c] : Math.round(Number(m[c] ?? 0)))).join(" | ") + " |");
}
console.log(`(ms, 쿠폰 ${process.argv[2]}, 로그 ${r.statistics.recordsMatched}줄)`);
' "$dir/coupon-timing.json" "$id" | tee "$dir/coupon-timing.txt"
