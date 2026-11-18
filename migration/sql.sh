#!/usr/bin/env bash
# 서울 RDS에 SQL 파일을 관리자 계정으로 돌린다 (3단계 정합성 검사 · 쿠폰 발급 확인, docs/experiments/migration.md 2 · 3절)
# RDS는 비공개라 PC에서 바로 못 붙는다 → 서울 안의 일회성 태스크(sql)가 받아 돌리고 결과를 로그로 남김. 관리자 로그인 필요
#   bash migration/sql.sh scripts/check-consistency.sql
set -Eeuo pipefail
file=$(realpath "${1:?사용: bash migration/sql.sh <SQL 파일>}")
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
source lib.sh

b64=$(base64 -w0 "$file") # 따옴표 · 줄바꿈을 JSON에 그대로 넣지 않으려고
[ ${#b64} -lt 7000 ] || { echo "SQL이 너무 큼: RunTask 덮어쓰기는 8KB 한도" >&2; exit 1; }
run_task sql "{\"containerOverrides\":[{\"name\":\"sql\",\"environment\":[{\"name\":\"SQL_B64\",\"value\":\"$b64\"}]}]}"
