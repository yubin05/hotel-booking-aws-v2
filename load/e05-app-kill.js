// E-05 앱 강제 종료 후 재시도: 예약을 일정한 속도로 보내는 중에 앱을 강제 종료(SIGKILL)했다가 다시 띄운다 (docs/07-experiments.md)
// 실패한 예약은 사용자가 다시 누르듯 같은 Idempotency-Key·같은 본문으로 1초 뒤 다시 보낸다
// 실행: load/e05-app-kill.sh  (이 스크립트를 돌리면서 부하 시작 15초 뒤 앱을 죽이고 5초 뒤 다시 띄운다)
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
const USERS = 50;
const RATE = 10; // 초당 예약 시도 (E-04와 같음)
const RETRY_GAP = 1; // 다시 누르기까지 (초)
const MAX_ATTEMPTS = 20; // 앱이 죽어 있는 5초 + 뜨는 시간보다 넉넉히. 넘으면 '실패로 끝남'으로 센다

// 키(사용자가 누른 예약 버튼 한 번)마다 마지막에 받은 답
const created = new Counter('bookings_created'); // 201
const replayed = new Counter('bookings_replayed'); // 200 '이미 처리된 요청입니다.' (앞 시도가 이미 저장됨)
const conflict = new Counter('bookings_conflict'); // 409 (날짜 겹침, 정상 거절)
const unresolved = new Counter('bookings_unresolved'); // 다시 보내도 끝내 실패
const retried = new Counter('bookings_retried'); // 한 번 이상 다시 보낸 키
// 분석용: 사용자가 받은 예약 번호를 키와 함께 남겨 DB의 그 키 예약과 맞춰 본다
const answer = new Counter('booking_answer');
// 시도 하나에서 사용자가 기다린 시간 (보낸 순간 → 답, 스크립트 시계). k6 타이밍은 연결 실패(상태 0) 때 모두 0이라
// 보낸 시각·기다린 시간을 잃는다 (스모크 점검에서 확인). 분석은 이 기록의 key·attempt·status 태그로 한다
const attemptWait = new Trend('booking_wait', true);
const totalWait = new Trend('booking_total_wait', true); // 첫 시도 → 마지막 답 (다시 누른 시간 포함)

export const options = {
  scenarios: {
    // 죽어 있는 동안 VU가 재시도로 묶이므로 넉넉히 미리 만든다 (E-04: 모자라면 dropped_iterations)
    bookings: { executor: 'constant-arrival-rate', exec: 'book', rate: RATE, timeUnit: '1s', duration: '60s', preAllocatedVUs: 200, maxVUs: 700 },
    // 앱이 다시 받기 시작한 시각을 1초 단위로 본다 (재시도하지 않음)
    health: { executor: 'constant-arrival-rate', exec: 'health', rate: 1, timeUnit: '1s', duration: '60s', preAllocatedVUs: 20, maxVUs: 70 },
  },
  // 앱 주소를 캐시하지 않는다: 다시 뜬 컨테이너의 IP가 바뀌어도 따라간다 (기본 5분 캐시)
  dns: { ttl: '0' },
  thresholds: { dropped_iterations: ['count==0'] },
};

http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const isoDate = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);
const reason = (res) => {
  if (res.status === 0) return res.error;
  try {
    return res.json('message');
  } catch {
    return String(res.body).slice(0, 80);
  }
};
const failed = (s) => s === 0 || s >= 500; // 사용자가 다시 누를 응답 (끊김·서버 오류)

export function setup() {
  const run = Date.now().toString(36);
  const regs = http.batch(
    Array.from({ length: USERS }, (_, i) => [
      'POST',
      `${BASE}/api/auth/register`,
      JSON.stringify({ email: `k6-${run}-${i}@example.com`, password: 'k6-password', name: `k6 ${i}` }),
      { headers: JSON_HEADERS },
    ]),
  );
  const tokens = regs.map((r) => {
    if (r.status !== 201) throw new Error(`가입 실패 ${r.status}: ${r.body}`);
    return r.json('data.token');
  });
  const hotels = http.get(`${BASE}/api/hotels?limit=50`).json('data.hotels');
  const roomIds = hotels.flatMap((h) => http.get(`${BASE}/api/hotels/${h.id}`).json('data.rooms').map((r) => r.id));
  // load/e05-app-kill.sh가 이 줄을 보고 부하 시작을 안다
  console.log(`run=k6-${run} 사용자 ${tokens.length}명, 객실 ${roomIds.length}개`);
  return { run, tokens, roomIds };
}

export function book(data) {
  const i = exec.scenario.iterationInTest;
  const key = `k6-${data.run}-${i}`;
  const start = 30 + Math.floor(Math.random() * 700);
  // 다시 보낼 때도 같은 본문 (앱은 같은 키면 본문이 달라도 처음 예약을 돌려주므로 본문을 바꾸면 다른 실험이 된다)
  const body = JSON.stringify({ room_id: pick(data.roomIds), check_in_date: isoDate(start), check_out_date: isoDate(start + 1 + Math.floor(Math.random() * 2)), guests: 1 });
  const headers = { ...JSON_HEADERS, Authorization: `Bearer ${data.tokens[i % USERS]}`, 'Idempotency-Key': key };
  const first = Date.now();
  let res;
  let attempt = 0;
  do {
    if (attempt) sleep(RETRY_GAP);
    attempt++;
    const sent = Date.now();
    res = http.post(`${BASE}/api/bookings`, body, { headers, tags: { name: 'booking' } });
    attemptWait.add(Date.now() - sent, { key, attempt: String(attempt), status: String(res.status) });
    if (failed(res.status)) check(res, { [`실패 ${res.status} ${reason(res)}`]: () => false });
  } while (failed(res.status) && attempt < MAX_ATTEMPTS);

  const s = res.status;
  // 0도 넣어야 한 건도 없을 때 요약에 0으로 나온다
  created.add(s === 201 ? 1 : 0);
  replayed.add(s === 200 ? 1 : 0);
  conflict.add(s === 409 ? 1 : 0);
  unresolved.add(s === 200 || s === 201 || s === 409 ? 0 : 1);
  retried.add(attempt > 1 ? 1 : 0);
  totalWait.add(Date.now() - first);
  answer.add(1, { key, attempts: String(attempt), booking: s === 200 || s === 201 ? res.json('data.id') : '' });
}

export function health() {
  const res = http.get(`${BASE}/api/health/deep`, { tags: { name: 'health' } });
  check(res, { '헬스 200': (r) => r.status === 200 });
}
