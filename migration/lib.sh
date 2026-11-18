# migration/ 스크립트 공용 (source로 읽음): 관리자 aws 호출, 서울 ECS 일회성 태스크 실행
REGION=ap-northeast-2
CLUSTER=hotel-booking-aws-v2 # ECS 클러스터 · 태스크 정의 패밀리 앞부분 (ADR-030)
LOG_GROUP=/ecs/hotel-booking-aws-v2

# 관리자 권한은 명령 앞에만. 윈도 aws.exe 출력의 \r을 지움(키 끝에 \r이 붙으면 PC와 태스크의 키가 달라짐)
admin() { AWS_PROFILE=admin aws --region "$REGION" "$@" | tr -d '\r'; }

# 일회성 태스크를 앱 서비스와 같은 서브넷 · 보안 그룹으로 띄워 끝날 때까지 기다리고 로그를 출력. 종료 코드가 0이 아니면 실패
run_task() { # $1 컨테이너 이름 = 패밀리 뒷부분(restore · migrate · sql), $2 덮어쓰기 JSON
  local net task exit_code logs
  net=$(admin ecs describe-services --cluster "$CLUSTER" --services app --query 'services[0].networkConfiguration' --output json)
  task=$(admin ecs run-task --cluster "$CLUSTER" --task-definition "$CLUSTER-$1" --launch-type FARGATE \
    --network-configuration "$net" --overrides "$2" --query 'tasks[0].taskArn' --output text)
  admin ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task"
  exit_code=$(admin ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text)
  for _ in $(seq 10); do # 로그가 몇 초 늦게 올 수 있음
    logs=$(admin logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "$1/$1/${task##*/}" --start-from-head \
      --query 'events[*].[message]' --output text 2>/dev/null || true)
    [ -n "$logs" ] && break
    sleep 3
  done
  echo "$logs"
  [ "${exit_code%%[[:space:]]*}" = 0 ] || { echo "$1 태스크 실패: $exit_code" >&2; return 1; }
}
