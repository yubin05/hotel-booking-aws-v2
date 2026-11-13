# 부하 시험 (인프라팀)

이관 수행사(우리)가 재는 부하 시험입니다. 1단계 이관 전 기준선과 3단계 이관 후 비교에 **같은 `baseline.js`**를 써서 조건을 고정합니다([ADR-043](../docs/04-decisions.md#adr-043)). 0단계 로컬 실험(E-01~E-06)은 고객사 앱 저장소 [hotel-booking-app](https://github.com/yubin05/hotel-booking-app)의 `load/`에 있습니다.

| 파일 | 하는 일 |
|---|---|
| [baseline.js](baseline.js) | 손님을 500명씩 늘려 3,000명까지 올리는 37분짜리 시나리오 |
| [run-baseline.sh](run-baseline.sh) | 발생기에서 `baseline.js`를 돌리는 동안 서버 3대의 CPU · 메모리를 5초마다 남기고, 끝나면 결과와 정합성 검사를 가져옴 |
| [snap-app.sh](snap-app.sh) · [snap-db.sh](snap-db.sh) | 부하 중 30초마다 앱 입구 · DB 연결 상태를 남김 (`run-baseline.sh`가 서버에 올려 실행) |

서버(이전 환경과 부하 발생기)는 고객사 저장소의 [legacy/](https://github.com/yubin05/hotel-booking-app/tree/main/legacy)에서 올립니다. 부하 발생기는 우리 측정 장비지만 이전 환경의 네트워크를 같이 쓰므로 그 Terraform 안에 있습니다. `run-baseline.sh`는 서버 IP를 그 폴더의 state에서 읽으므로, 두 저장소를 `C:\dev` 아래 나란히 받아 둡니다(다르면 `LEGACY_DIR=<legacy 폴더>`).

## 부하 기준선 시험 날 (과제 3)

손님을 500명씩 늘려 3,000명까지 올리는 37분짜리 시험을 3번 돌립니다. 계획 · 기준 · 예측은 [기준선 문서](../docs/experiments/baseline.md)에 있습니다. 전부 하면 약 3시간이고, 회차 사이에서 끊었다가 다른 날 · 다른 PC에서 이어 해도 됩니다(아래 주의).

```bash
# 서버 올리기 (고객사 저장소, 평소 사용자에게 legacy 권한이 붙어 있어야 함)
cd /c/dev/hotel-booking-app && git pull && cd legacy
aws login; eval "$(ssh-agent -s)"; ssh-add ~/.ssh/hotel-legacy
date; terraform apply -var is_load_test=true   # 19개 추가 (발생기 t3.medium + 보안 그룹 포함)
bash start-db.sh                               # 끝에 hotels 1010
bash start-app.sh yubin05/hotel-booking-aws-v2:<태그>

# 시험 (이 저장소)
cd /c/dev/hotel-booking-aws-v2 && git pull && cd load
bash run-baseline.sh --stage 30s:5 --stage 10s:0   # 1분 시험 실행: 끝에 결과 폴더와 정합성 표가 나오면 스크립트 정상 (이 PC에서 처음일 때만)
bash run-baseline.sh                               # 1회 37분. 회차 사이 2~3분 쉬고 반복

# 지우기 (고객사 저장소)
cd /c/dev/hotel-booking-app/legacy && terraform destroy; date   # 19개 삭제
```

| 때 | 화면에 보이는 것 |
|---|---|
| 시작 | `시작: baseline-<시각> (앱 http://…, 발생기 …)` |
| 진행 중 | `running (12m30s), 1000/3000 VUs …`: 지난 시간 · 지금 손님 수 |
| 끝 | k6 요약 표 → `결과: load/results/<이름>/` → 정합성 검사 표(첫 표의 bad가 모두 0) |

- 결과 폴더의 `app.snap` · `db.snap`: 30초마다 남긴 앱 입구(연결 대기 줄 · 연결 추적 표)와 DB 처리 목록. 무너지는 순간을 지켜보지 않아도 된다
- 정리: `node scripts/baseline-report.mjs load/results/<이름>/<이름>.json.gz` (이 저장소 루트에서) → 층별 표와 "N명까지 버팀" 한 줄
- 발생기에 처음 접속할 때 지문을 물으면 `yes`.
- Ctrl+C를 누르거나 인터넷이 끊겨도 시험은 발생기에서 계속 돕니다. 37분이 지난 뒤 `bash run-baseline.sh collect <이름>`으로 결과만 가져옵니다.
- **회차 중간에 destroy하지 않습니다.** 끊으려면 `결과: …`가 나온 뒤에.
- **다른 PC로 옮겨 이어 할 때는 이 PC에서 destroy하고 갑니다**(legacy state가 apply한 PC에만 있음). 새 PC에서는 고객사 저장소 `legacy/terraform.tfvars`의 SSH 허용 IP를 그 장소 IP로 고치고 처음부터 apply합니다.
- `load/results/`는 git에 올라가지 않습니다. 다른 PC에서 돌린 회차는 정리 출력(표)을 기록에 붙이고, 그래프용 원본(`.json.gz`)은 나중에 한곳에 모읍니다.
