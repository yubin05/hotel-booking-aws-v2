# bootstrap

한 번 만들어 두고 계속 쓰는 기반 리소스입니다. state 버킷, GitHub OIDC 역할, ECS 실행 역할, 평소 사용자 정책, ECR, 예산, 비밀값 금고, 숙소 사진 창고(서울 → 도쿄 복제, [ADR-055](../../docs/04-decisions.md#adr-055))가 여기에 있습니다. destroy하지 않습니다([ADR-025](../../docs/04-decisions.md#adr-025)).

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

## RDS Enhanced Monitoring IAM 역할 · 관리자 1회 작업 (2026-11-25)

- `rds-monitoring.tf`가 계정 전역 서비스 역할 **`hotel-booking-aws-v2-rds-enhanced-monitoring` 하나**를 만들고 AWS 관리 정책 `AmazonRDSEnhancedMonitoringRole`을 연결합니다. 역할의 신뢰 주체는 `monitoring.rds.amazonaws.com`, SourceAccount와 서울/도쿄 DB SourceArn 두 개로 범위를 제한합니다.
- **관리자 Bootstrap Terraform**에서 `plan` 검토 → `apply`해야 실제 IAM 역할 및 `infra/iam/v2-operator-policy.json` 수정이 운영자 정책에 반영됩니다. 기존 운영자에게 IAM 역할 생성/정책 연결 권한을 추가하지 않습니다.
- 운영자에게는 **이 역할 하나에만** `iam:PassRole`을 추가합니다. `iam:PassedToService`는 `monitoring.rds.amazonaws.com`, `rds.amazonaws.com`으로 제한하며 실제 서비스 전달 조건은 AWS에서 적용 전 확인합니다.
- 서울/도쿄 regional 모듈은 IAM 역할을 생성하지 않고, Bootstrap이 만든 역할의 ARN만 받습니다. `rds_enhanced_monitoring=false` 또는 `multi_az=false`면 MonitoringInterval=0, MonitoringRoleArn=null이라 기본 상태에서는 사용하지 않습니다.
- 기존 `drill/region.sh`에서 도쿄 ② 보강 기대 Plan은 **0 add, 1 change, 0 destroy**입니다. 관리 리소스가 추가되지 않도록 변경했지만, 실제 Terraform plan에서 반드시 확인해야 합니다.
- ⚠️ `rds_enhanced_monitoring=true`를 ② Multi-AZ 보강과 한 번에 켜면 한 RDS 인스턴스의 두 설정이 함께 수정돼 보강 시간에 모니터링 켜는 시간이 섞입니다. 타이밍 비교 회차는 false로 유지하고, **Standby 관측 실험은 별도 회차로 분리**하세요.
- Terraform 코드만 변경했습니다. **AWS Terraform plan/apply나 실계정 IAM 정책 변경은 수행하지 않았습니다.**
