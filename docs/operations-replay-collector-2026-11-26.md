# 2026-11-26 · 서울/도쿄 운영 관제 REPLAY 실측 수집

## 목적

공개 Grafana LIVE 대시보드에 이미 있는 **01~06 서울·도쿄 운영 관제 패널**을 읽어 실측 시계열 원본을 로컬로 보존합니다. 07/08 쿠폰·장애 실험은 제외합니다.

현재 ChatGPT 연결 도구에서는 공개 Grafana의 **패널 조회 POST**를 직접 실행할 수 없어서 원본 시계열 수집을 끝내지 못했습니다. 공개 Grafana 화면에서는 서울 ECS(AZ 2a/2c), ALB, 서울 RDS Primary 그래프가 보였고, 서울/도쿄 Standby 및 도쿄 RDS Replica는 No Data 상태였습니다. **No Data는 정상 또는 리소스 없음의 증거가 아닙니다.**

## 집 PC (Windows CMD)에서 실행

```cmd
cd C:\dev\hotel-booking-aws-v2
git pull --ff-only origin main
node scripts\collect-grafana-operations.cjs --list
node scripts\collect-grafana-operations.cjs --minutes 60
```

저장소가 다른 폴더에 있으면 `cd` 경로만 해당 경로로 변경합니다. Node.js 18+가 필요합니다. **AWS 로그인, 자격 증명, 환경변수, Terraform apply는 필요하지 않습니다.**

명령을 실행한 시점을 종료점으로 최근 60분을 조회합니다. 더 길게 하려면 `--minutes 120` (최대 240)을 사용합니다. 공개 Grafana API에 읽기 전용 HTTP POST 요청만 수행하며, AWS 리소스를 켜거나 끄지 않습니다. CloudWatch/Logs Insights 백엔드 조회에 과금이나 쿼리 제한이 적용될 수 있으니 필요한 회차에만 실행합니다.

## 결과

`load/results/grafana-operations-<UTC타임스탬프>/` (gitignore 적용, 원격 자동 push 없음)

- `manifest.json`: 패널별 관측 `observed`, 미수집 `no_data`, 조회 실패 `error`와 조회 UTC 시각
- `panel-<패널ID>.json`: 공개 Grafana 패널 API가 반환한 **원본 응답** (포렌식/쿼리 검증용)
- `replay-rows.json`: 실제 값이 있는 시리즈만 `id, label, unit, source, duration, measuredAt, points` 형태로 변환한 REPLAY 시계열

**주의:** `replay-rows.json`에는 TaskId/Target Group 이름 등 실제 리소스 식별자가 들어갈 수 있으므로 그대로 공개 사이트에 올리지 마세요. 포트폴리오 게시 전 익명화, 개인/계정 식별자 제거, 테스트 값 검증이 필요합니다.

실제 Grafana API 호출 성공 여부 및 각 패널 반환 구조는 **집 PC 실행으로 확인해야 합니다**. API가 403/429를 반환해도 값을 조작하지 않고 `manifest.json`에 오류로 기록합니다. 실제 AWS CloudWatch에 직접 로그인해 수집하는 대체 경로도 가능합니다.

## 수집 상태 판단

- 서울 ECS 태스크 CPU/메모리: LIVE 공개 화면에서 그래프 시각 확인, 원본 JSON 수집 전
- 서울 ALB AZ별 요청/정상 대상 및 서울 RDS Primary CPU/연결/메모리/스토리지/I/O: 그래프 시각 확인, 원본 JSON 수집 전
- 서울/도쿄 Standby, 도쿄 RDS Replica: 수집값 없음. Multi-AZ 여부, CloudWatch 로그·권한·리전·차원 필터를 추가 검증
- 도쿄 ECS: 일부 태스크 수 지표만 표시, 나머지는 미관측

한 회차의 `replay-rows.json`를 확인한 다음 Grafana REPLAY의 Infinity 데이터 소스에 연결합니다. 실제 11/26 실측을 확인하기 전 기존 11/25 회차 데이터를 덮어쓰지 않습니다.
