# bootstrap

한 번 만들어 두고 계속 쓰는 기반 리소스입니다. state 버킷, GitHub OIDC 역할, ECS 실행 역할, 평소 사용자 정책, ECR, 예산, 비밀값 금고가 여기에 있습니다. destroy하지 않습니다([ADR-025](../../docs/04-decisions.md#adr-025)).

**관리자 역할로만 실행합니다.** 평소 사용자는 bootstrap state를 읽지 못합니다(403, [ADR-028](../../docs/04-decisions.md#adr-028)).

## 처음 받은 PC에서 (한 번)

```bash
cd /c/dev/hotel-booking-aws-v2/infra/bootstrap

# 콘솔에서 Administrator-Role로 전환한 상태에서 로그인 (ADR-018)
aws login --profile admin
export AWS_PROFILE=admin
aws sts get-caller-identity      # Arn에 :assumed-role/Administrator-Role/ 이 보여야 관리자

terraform init                   # 공급자 설치 + S3 backend 연결. -migrate-state는 쓰지 않음
terraform state list             # S3의 state를 읽어 리소스 목록이 나오면 준비 끝

# plan·apply를 하려면 (state list에는 필요 없음)
cp terraform.tfvars.example terraform.tfvars   # 값 채우기 (커밋하지 않음)
```

- state는 이미 S3(도쿄 버킷의 `bootstrap/terraform.tfstate`)에 있고, `provider.tf`의 backend 블록이 그곳을 가리킵니다. 그래서 새 PC에서는 `terraform init`만 하면 됩니다. `.terraform/`은 PC마다 생기고 커밋하지 않습니다.
- `-migrate-state`는 state를 **다른 곳으로 옮길 때만** 씁니다(*"The -migrate-state option will attempt to copy existing state to the new backend"*, [terraform init](https://developer.hashicorp.com/terraform/cli/commands/init)).
  - 로컬 → S3: 2026-11-12에 한 번 했습니다([03-plan 2-1](../../docs/03-plan.md)).
  - S3 → 로컬: 프로젝트를 끝낼 때 backend 블록을 지우고 실행합니다([ADR-025](../../docs/04-decisions.md#adr-025)).
- `init`은 여러 번 실행해도 됩니다(*"It is safe to run this command multiple times."*, 같은 문서).

## 바꿀 때

```bash
terraform plan    # 결과 개수(추가·변경·삭제)를 먼저 예측해 보고 비교
terraform apply   # 시각과 비용을 docs/03-plan.md에 기록
```
