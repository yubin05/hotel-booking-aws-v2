import { hostname } from 'node:os';

// 어느 리전·AZ·태스크가 응답했는지 X-Served-By 헤더로 알린다 (장애·리전 전환을 화면 배지로 보여 주는 시연용).
// 내부 배치 정보가 조금 드러나므로, 시연이 필요 없는 운영 환경이라면 헤더를 빼도 된다
let servedBy = `local/${hostname()}`;

// ECS(Fargate)에서는 태스크 메타데이터에서 리전·AZ·태스크 ID를 읽는다. 읽지 못해도 서비스는 계속한다
export async function loadServedBy(): Promise<void> {
  const uri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (!uri) return;
  try {
    const task = (await (await fetch(`${uri}/task`)).json()) as { TaskARN: string; AvailabilityZone: string };
    // arn:aws:ecs:<리전>:<계정>:task/<클러스터>/<태스크 ID>
    const [, , , region, , resource] = task.TaskARN.split(':');
    servedBy = `${region}/${task.AvailabilityZone}/${resource.split('/').pop()?.slice(0, 8)}`;
  } catch (err) {
    console.error('태스크 메타데이터를 읽지 못했습니다', err);
  }
}

export function getServedBy(): string {
  return servedBy;
}
