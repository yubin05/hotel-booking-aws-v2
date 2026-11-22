# 인수인계 2026-11-22 (Claude → Codex): 포트폴리오 · Cloud Lab 갱신

2026-11-22부터 포트폴리오(`yubin05/portfolio`)와 Cloud Lab(`yubin05/cloud-lab`) 작업은 Codex가 맡습니다. Claude는 이 저장소(v2)의 실험 · 설계 문서와 README를 갱신하고, 바뀐 내용을 이런 안내문으로 넘깁니다.

## 0. 작업 규칙 (사용자)

- 두 저장소 모두 **main에 바로 커밋 · push**(PR 만들지 않음). 작업 전 `git pull`, 로컬 클론이 다른 브랜치면 main으로
  - 포트폴리오: `C:\dev\portfolio` → push 전 `npm run build` → https://yubin05-portfolio.vercel.app/projects/hotel-booking-aws-v2 반영 확인
  - Cloud Lab: `C:\dev\cloud-lab` → https://cloud-lab-theta.vercel.app/adventure/ 반영 확인
- 커밋은 Conventional Commits, 설명은 한국어
- **측정된 숫자만** 씁니다. 아직 재지 않은 값(5단계 Pilot Light의 RTO · RPO)은 숫자로 쓰지 않습니다
- 글은 결론 먼저, 쉬운 말 + IT 용어를 함께(예: "출입구(ALB 노드)"). 포트폴리오 v2 페이지의 공통 섹션은 v2 `README.md`와 같은 글로 맞추고 링크만 플랫폼별(포트폴리오는 GitHub 절대 주소)
- v3 보안 운영 착수일 2026-11-23(월)은 그대로

## 1. 오늘 바뀐 사실 (근거는 v2 저장소 main)

| 주제 | 내용 | 근거 |
|---|---|---|
| 4단계 AZ 장애 원인 | ALB는 막힌 AZ의 태스크를 피했지만, 막힌 AZ의 **출입구(ALB 노드) IP가 DNS에 남아** CloudFront 요청 일부가 시간 초과. 막힌 노드 요청 0건 · 대상 연결 오류 0(CloudWatch AZ별 지표) | `docs/experiments/faults.md` "원인 분석 (2026-11-22)" |
| 4단계 보완 · 재측정 | ALB **zonal shift**(그 AZ 노드를 DNS에서 빼는 기능)를 켜고 차단 +60초에 실행. 3회: 차단 중 손님 실패 **중앙 1.1%**(0.8 · 1.1 · 1.4%, 11-21 기준선 중앙 14.6%), shift 뒤 손님 정상화 **22.0 · 34.6 · 28.6초(중앙 28.6초)**, 그 뒤 실패 0, 중복 예약 0. 남은 실패는 shift 전 약 63초(감지 · 판단 흉내)와 DB 장애 조치 몫 | `faults.md` "AZ 장애 + zonal shift 결과", ADR-067 |
| 5단계 리전 DR 방식 | Backup & Restore 3회 시도(RPO 10분 5.6초 1회 실측, DB 복원 7분 vs 94분 넘게 미완료, RTO 미측정) → **Pilot Light**(도쿄 RDS 읽기 복제본 → 승격)로 전환, 목표 RTO 30분 · RPO 1분. **드릴은 아직**(실측 전) | `docs/experiments/region-drill.md` 맨 위 "Pilot Light로 바꾼 이유", ADR-066 |
| DB 관리자 비밀번호 | RDS가 관리하던 금고 → bootstrap 금고(서울 원본 + 도쿄 복제). RDS 관리 금고면 MySQL 읽기 복제본을 못 만들어서. 값은 state에 없음 | ADR-069 |
| 월 고정비(설계 · 상시) | **$679 → $227(−67%)**. 도쿄 DB 복제본 $21 + 관리자 금고 $0.8 포함. 작업 시간 기준 v2 $61 | `docs/09-cost-estimate.md` |
| 알림 | 장애 알림은 아직 없음(예산 메일뿐). Slack으로 정했고 v3 첫 작업 | ADR-061 |
| 서울 읽기 복제본 | 두지 않음(실측 병목이 앱 CPU · 쿠폰 쓰기). 조건이 되면 다시 | ADR-068 |

## 2. 이미 반영된 것 (Claude, 11-22)

- 포트폴리오: `28f28a0`(PR #8, zonal shift · Pilot Light 전환 · $226), `4c59416`(AZ 3회 결과 1.1%), `src/content/projects/hotel-booking-aws-v2.md` · `src/components/V2CaseStudy.astro` · `ProjectJourney.astro`
- Cloud Lab: PR #4(챕터 3 AZ 원인 확정, 챕터 4에 B&R 3회 결과와 Pilot Light 전환 표시, 챕터 0 도쿄 DR 설명)
- GitHub 프로필 `yubin05/yubin05` README(EKS 섹션 제거, 숙박 예약 ①②③, toolkit은 SKT-ALEPH 교육 과정 · 비공개)

## 3. 할 일

1. **포트폴리오 월 고정비 $226 → $227**: `hotel-booking-aws-v2.md`(summary · highlights · v1 비교 표), `V2CaseStudy.astro`(비용 카드), `ProjectJourney.astro`(비용 줄). 절감률 67%는 그대로. v2 README와 같은 문구로
2. **Cloud Lab 챕터 3 AZ 장면에 zonal shift 결과 넣기**(`public/adventure/fault-story.js`의 `az` 단계): 지금은 "보완: zonal shift 후 재측정"으로 끝남 → 차단 → (약 60초) zonal shift로 막힌 출입구 제외 → 손님 정상화(약 22 ~ 35초) → 차단 해제 · shift 취소 흐름과 위 1절의 3회 숫자. 꾸밈 연출과 실측을 구분하는 기존 표기(“교육용 연출 ≠ 실측”)는 유지
   - 원본(git 밖, 이 PC): `C:\dev\hotel-booking-aws-v2\drill\results\fault-az-20261122-171205` · `-173328` · `-175202`(각 `writer.log` · `marks.log` · `state.log` · `cw.json` · `cw-1s.json` · `report.md`), 11-21 기준선 `fault-az-20261121-010729` · `-012549` · `-015010`, AZ별 ALB 지표 `fault-az-alb-by-az-20261121.json`
   - 재생 데이터로 만들 경우 기존 `scripts/replay-data.mjs`(v2) 방식을 참고. 공개 저장소에는 변환한 값만
3. (선택) 포트폴리오 v2 페이지의 "찾은 문제와 보완" · 검증 기록 줄은 이미 README와 같음 → README가 바뀌면 따라 맞춤
4. **하지 않을 것**: Pilot Light RTO · RPO 숫자(드릴 전), Cloud Lab 챕터 4를 Pilot Light 장면으로 다시 그리기(드릴 결과가 나온 뒤 Claude가 다음 안내문으로 넘김)

## 4. 다음 안내문 예정

- 5단계 Pilot Light 드릴 3회 결과(RTO · RPO · 단계별 시간) → README · region-drill.md 갱신 뒤 `docs/handoff-<날짜>-portfolio.md`로 넘김
