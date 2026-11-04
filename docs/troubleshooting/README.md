# 트러블슈팅 기록

실사용에서 터질 만한 문제를 재현하고, 원인을 찾아 고친 뒤 숫자로 확인한 기록입니다.
TS-08부터는 [로컬 장애·부하 실험](../07-experiments.md)에서 나온 문제를 한 건씩 파일로 남깁니다.

## 목록

| ID | 증상 | 원인 | 해결 | 근거 |
|---|---|---|---|---|
| TS-01 | v1: 같은 객실·날짜에 동시 예약하면 이중 예약 | 조회 후 저장 사이의 경쟁 상태 | 객실·날짜를 기본 키로 둬 DB가 막음. 동시 10건 → 201 1건, 409 9건 | [026d2c2](https://github.com/yubin05/hotel-booking-aws-v2/commit/026d2c2), [결과 0-a](../03-plan.md#결과-기록) |
| TS-02 | 쿠폰 10장 동시 발급에 4장만 발급, 26명 거절 | 받은 기록 INSERT의 외래 키 공유 잠금 + 발급 수 UPDATE가 서로 막는 교착 | 쿠폰 행을 먼저 잠금. 리뷰 저장도 같은 구조라 함께 수정 | [b1461e2](https://github.com/yubin05/hotel-booking-aws-v2/commit/b1461e2), [결과 표](../03-plan.md#결과-기록) |
| TS-03 | 시드 데이터 한글 깨짐 (`그` → `C3AAC2B7C2B8`) | 컨테이너 MySQL 클라이언트 문자셋이 latin1이라 이중 인코딩 | 시드에 `SET NAMES utf8mb4` + 한글 회귀 테스트 | [62ffcbb](https://github.com/yubin05/hotel-booking-aws-v2/commit/62ffcbb), [결과 표](../03-plan.md#결과-기록) |
| TS-04 | 숙소를 누르면 화면 전체가 꺼짐 | `useEffect(() => window.scrollTo(0, 0))`. 최신 Chromium의 scrollTo가 Promise를 반환하고, React가 이를 정리 함수로 호출하다 실패 | effect를 블록으로 감쌈. 재현: [repro-hotel-click.mjs](../../scripts/repro-hotel-click.mjs) | [ddd6fd8](https://github.com/yubin05/hotel-booking-aws-v2/commit/ddd6fd8), [결과 표](../03-plan.md#결과-기록) |
| TS-05 | DB 초기화 뒤 옛 토큰으로 예약하면 500 | 토큰의 사용자가 DB에 없어 외래 키 오류 | 401로 응답 + 화면 자동 로그아웃 (백업 복원 후에도 같은 상황) | [6e4e1a6](https://github.com/yubin05/hotel-booking-aws-v2/commit/6e4e1a6) |
| TS-06 | 변경·취소 마감이 6시간 일찍 막힘 | 마감을 UTC 0시로 계산 | 숙소 체크인 시각을 한국 시간 기준으로 계산 | [e3d5cab](https://github.com/yubin05/hotel-booking-aws-v2/commit/e3d5cab) |
| TS-07 | v1 검색 버그 묶음 | 개수 계산 누락, 편의시설 필터 무시, 유형 2개 이상 선택 시 필터 해제 | 검색 조건 수정 | [ef50eb3](https://github.com/yubin05/hotel-booking-aws-v2/commit/ef50eb3) |
| TS-08 | 쿠폰 오픈 순간 1,000명 요청에 무관한 숙소 조회 p95 3.9ms → 813ms | 잠금을 기다리는 발급 요청이 DB 연결 10개를 모두 점유 | 쿠폰 발급 전용 연결 2개로 분리(벌크헤드) → 133ms, 초과 발급 0 유지 | [e264570](https://github.com/yubin05/hotel-booking-aws-v2/commit/e264570), [TS-08](TS-08-coupon-pool-exhaustion.md) |

TS-01~07은 위 한 줄과 커밋으로 충분합니다. 포트폴리오에서 특히 강조할 건만 아래 틀로 따로 풀어 씁니다.

## 작성 틀

파일 이름은 `TS-08-db-restart.md`처럼 번호 + 짧은 영어 설명으로 짓습니다.

```markdown
# TS-NN 제목 (증상을 한 문장으로)

- 날짜: / 관련 실험: E-0N / 커밋:

## 증상
무엇이 얼마나 잘못됐는지 숫자로 (응답 코드 분포, 건수, 시간)

## 재현
실행한 명령과 테스트 이름. 다른 사람이 그대로 따라 할 수 있게

## 원인 분석
| 가설 | 확인 방법 | 결과 |
|---|---|---|
막혔던 시도도 남긴다. 결론은 근거(로그, SHOW ENGINE INNODB STATUS 등)와 함께 한두 문장

## 해결
무엇을 바꿨는지, 다른 방법을 고르지 않은 이유, 커밋 링크

## 검증
| 항목 | 수정 전 | 수정 후 |
|---|---|---|
이 문제를 지키는 테스트: `app/test/...`의 테스트 이름

## 재발 방지
남긴 테스트·문서·규칙

## 면접 한 줄
"…를 재현해 …가 원인임을 확인하고, …로 바꿔 …을 …에서 …로 줄였습니다."
```
