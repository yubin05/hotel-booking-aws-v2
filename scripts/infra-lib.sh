# up.sh · down.sh 공용 (source로 읽음, 첫 인자 = 로그 폴더 이름 up|down)
# 단계마다 plan을 파일로 떠서 확인하고 그 plan 그대로 apply한다 (drill/region.sh tf_apply와 같은 방식)
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT=$PWD
APP=${APP_REPO:-$ROOT/../hotel-booking-app}
OUT=infra/runs/$(date +%Y%m%d-%H%M%S)-$1 # git 제외
mkdir -p "$OUT"
SUMMARY=()
CHANGED=no # 마지막 tf 호출이 실제로 apply했는지

ADD_ONLY='^Plan: [0-9]+ to add, 0 to change, 0 to destroy\.$'
DESTROY_ONLY='^Plan: 0 to add, 0 to change, [0-9]+ to destroy\.$'

win() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; } # Windows terraform에 넘길 경로
dir() { case $1 in legacy) echo "$APP/legacy" ;; iam) echo "$APP/legacy/iam" ;; *) echo "$ROOT/infra/$1" ;; esac; }
log() { echo "$(date +%T) $*" | tee -a "$OUT/steps.log"; }
die() { log "멈춤: $*"; exit 1; }
as() { if [ "$1" = admin ]; then shift; AWS_PROFILE=admin "$@"; else shift; "$@"; fi; } # as admin|normal 명령...

need_login() { # $1 admin|normal
  as "$1" aws sts get-caller-identity >/dev/null 2>&1 ||
    die "$1 세션 없음 → $([ "$1" = admin ] && echo 'aws login --profile admin' || echo 'aws login') 하고 다시"
}

# terraform.tfvars의 한 줄을 쓰거나(값) 지움(값 없음). -var 대신 파일에 남겨 손으로 하는 plan도 같은 값을 씀
tfvar() { # $1 루트, $2 변수 이름, $3 HCL 값(없으면 줄 삭제)
  local f
  f="$(dir "$1")/terraform.tfvars"
  touch "$f"
  sed -i "/^$2[[:space:]]*=/d" "$f"
  if [ -n "${3:-}" ]; then
    [ -s "$f" ] && [ -n "$(tail -c1 "$f")" ] && echo >>"$f" # 끝 줄바꿈이 없으면 두 줄이 붙음 (11-25 legacy)
    echo "$2 = $3" >>"$f"
  fi
}

tf() { # $1 루트, $2 apply|destroy, $3 그대로 apply할 plan 줄(정규식), $4 admin이면 관리자. 바꿀 게 없으면 건너뜀
  local root=$1 mode=$2 want=$3 who=${4:-normal} d plan got ok t0
  d=$(win "$(dir "$root")")
  plan=$(win "$ROOT/$OUT/$root-$mode.tfplan")
  CHANGED=no
  as "$who" terraform -chdir="$d" plan -input=false -no-color -out="$plan" $([ "$mode" = destroy ] && echo -destroy) \
    >"$OUT/$root-$mode-plan.log" 2>&1 || { tail -20 "$OUT/$root-$mode-plan.log" >&2; die "$root plan 실패"; }
  got=$(grep -E '^Plan:|No changes' "$OUT/$root-$mode-plan.log" | head -1 | tr -d '\r')
  if [[ $got == *"No changes"* ]]; then
    log "$root: 바꿀 것 없음 → 건너뜀"
    return
  fi
  if ! [[ $got =~ $want ]]; then # 예상 밖 변경 · 삭제는 사람이 plan 로그를 보고 정함
    echo "$root plan이 예상과 다름: $got → $OUT/$root-$mode-plan.log" >&2
    read -rp "$root $mode 할까요? (yes): " ok || ok=
    [ "$ok" = yes ] || die "$root 사람이 멈춤"
  fi
  t0=$(date +%T)
  log "$root $mode 시작: $got"
  as "$who" terraform -chdir="$d" apply -input=false -no-color "$plan" >"$OUT/$root-$mode-apply.log" 2>&1 ||
    { tail -20 "$OUT/$root-$mode-apply.log" >&2; die "$root apply 실패"; }
  log "$root $mode 끝"
  SUMMARY+=("| $root | $mode | $t0 ~ $(date +%T) | ${got#Plan: } |")
  CHANGED=yes
}

summary() { # 03-plan.md에 옮길 표
  echo
  echo "| 루트 | 작업 | 시각 | plan |"
  echo "|---|---|---|---|"
  printf '%s\n' "${SUMMARY[@]}" | tee -a "$OUT/steps.log"
  echo "로그: $OUT/"
}
