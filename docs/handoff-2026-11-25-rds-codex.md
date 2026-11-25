# Codex 인수인계 · RDS Standby / Grafana · 2026-11-25

## 중요한 제한 및 정확한 파일
- `infra/iam/v2-operator-policy.json`: 공백을 제거한 JSON 6,026자. AWS 관리형 정책 6,144자 한도까지 **118자** 남음. RDS 모니터링 관련 `PassRole`을 이 파일에 다시 넣으면 한도를 넘길 수 있다.
- 모니터링 역할 전달 권한은 현재 `infra/iam/edge-operator-policy.json`의 `PassRdsEnhancedMonitoringRole` 문장에 있다. 변경 전후의 정책 크기를 다시 확인할 것. 초기에 v2 관리형 정책 크기 초과로 bootstrap apply가 실패해 edge로 옮긴 이력이 있다.
- 공용 역할: `infra/bootstrap/rds-monitoring.tf`. 서울/도쿄 regional 모듈은 역할 생성하지 않고 ARN만 받는다.
- 대시보드 원본: **`yubin05/cloud-lab/grafana/operations.json`**, Import용: **`yubin05/cloud-lab/public/dashboard-imports/operations.json`**; 공개 주소: https://cloud-lab-theta.vercel.app/dashboard-imports/operations.json
- Standby 패널은 `04B 서울`, `05B 도쿄`. Enhanced Monitoring `RDSOSMetrics` 로그 그룹의 `-secondary` 스트림 조회 패널이다. CloudWatch 일반 RDS 지표가 Standby 개별 CPU/메모리를 대신하지 않는다.

## 미검증 작업 · 차기 Multi-AZ 회차
- **Standby 지표의 실제 유입, Logs Insights 쿼리, Grafana 패널 출력은 다음 Multi-AZ 실험에서 검증**해야 한다.
- `multi_az=true`, `rds_enhanced_monitoring=true`인 관측 전용 회차를 준비하고, IAM/CloudWatch Logs 권한과 AWS 실제 적용 상태를 확인한다. 기본 false이므로 켜지 않으면 Standby CPU 데이터가 나오지 않는다.
- 기존 `drill/region.sh`의 도쿄 Multi-AZ 보강 Plan 기대값은 `Plan: 0 to add, 1 to change, 0 to destroy.`이며 해당 스크립트는 그대로 둔 상태다. AWS 실제 Plan과 같을지는 실행 전 확인 필요하다.
- Multi-AZ 보강 시간 비교에 Enhanced Monitoring 활성화 시간을 섞지 않는다. 보강 성능 회차는 모니터링 OFF, 관측용 회차는 별도로 기록한다.
- 지난 bootstrap AWS 적용 상태는 repo 문서만으로 완전히 확인할 수 없으니 집/학원 PC의 AWS CLI/terraform state에서 재확인한다. **새로운 AWS apply는 이 인수인계 파일에 의해 승인되지 않는다.**
- 작업 브랜치 `main`. Cloud Lab은 GitHub 기본 브랜치가 `stage4-replay`이므로 반드시 `main` 사용.
