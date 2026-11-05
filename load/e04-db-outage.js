// E-04 예약 도중 DB 장애: 예약을 일정한 속도로 보내는 중에 DB를 재시작하거나 멈춘다 (docs/07-experiments.md)
// 실행: load/e04-db-outage.sh restart|pause  (이 스크립트를 돌리면서 부하 시작 15초 뒤 장애를 넣는다)
// k6 요청 제한 시간(기본 60초)은 일부러 그대로 둔다 (얼마나 매달리는지 잰다)
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
const USERS = 50;
const RATE = 10; // 초당 예약 시도. E-01 500명일 때 약 12건/초

const created = new Counter('bookings_created'); // 201
const conflict = new Counter('bookings_conflict'); // 409 (날짜 겹침, 정상 거절)
const serverError = new Counter('bookings_5xx');
const noResponse = new Counter('bookings_no_response'); // 상태 0: k6 시간 초과·연결 끊김 (앱이 죽었을 때 등)
const other = new Counter('bookings_other');
const bookingWait = new Trend('booking_wait', true); // 사용자가 기다린 시간: 연결(blocked, 연결 시간 포함) + 서버 응답

export const options = {
  scenarios: {
    // 응답이 느려져도 보내는 양은 그대로 (매달린 요청이 VU를 쥐고 있으므로 VU를 넉넉히: 초당 10건 × 최대 60초).
    // 부하 중에 VU를 새로 만들면 그사이 보낼 요청을 놓치므로(dropped, 첫 시도에서 2.6초 매달리자 4건) 멈춤 15초분 이상을 미리 만든다
    bookings: { executor: 'constant-arrival-rate', exec: 'book', rate: RATE, timeUnit: '1s', duration: '60s', preAllocatedVUs: 200, maxVUs: 700 },
    // DB까지 확인하는 헬스 체크를 1초에 1번 (앱 쪽에서 본 DB 회복 시각)
    health: { executor: 'constant-arrival-rate', exec: 'health', rate: 1, timeUnit: '1s', duration: '60s', preAllocatedVUs: 20, maxVUs: 70 },
  },
  // VU가 모자라 못 보낸 요청이 있으면 같은 조건이 아니다
  thresholds: { dropped_iterations: ['count==0'] },
};

// 409(이미 예약된 날짜)는 정상 거절이라 실패율에서 뺀다
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const isoDate = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);
// 사용자가 받은 메시지. JSON이 아닌 응답(앱 밖에서 만든 오류 화면 등)도 앞부분을 남긴다
const reason = (res) => {
  if (res.status === 0) return res.error;
  try {
    return res.json('message');
  } catch {
    return String(res.body).slice(0, 80);
  }
};

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
  // load/e04-db-outage.sh가 이 줄을 보고 부하 시작을 안다
  console.log(`run=k6-${run} 사용자 ${tokens.length}명, 객실 ${roomIds.length}개`);
  return { run, tokens, roomIds };
}

export function book(data) {
  const i = exec.scenario.iterationInTest;
  const key = `k6-${data.run}-${i}`;
  // 날짜를 30~729일 뒤로 넓게 흩어 겹침(409)을 줄인다 (E-01과 같음)
  const start = 30 + Math.floor(Math.random() * 700);
  const res = http.post(
    `${BASE}/api/bookings`,
    JSON.stringify({ room_id: pick(data.roomIds), check_in_date: isoDate(start), check_out_date: isoDate(start + 1 + Math.floor(Math.random() * 2)), guests: 1 }),
    // key 태그: 분석에서 201을 받은 키가 DB에 모두 있는지 키 단위로 맞춰 본다 (개수만 비교하면 유실 1건 + 응답 못 받은 예약 1건이 서로 가려진다)
    { headers: { ...JSON_HEADERS, Authorization: `Bearer ${data.tokens[i % USERS]}`, 'Idempotency-Key': key }, tags: { name: 'booking', key } },
  );
  const s = res.status;
  // 0도 넣어야 한 건도 없을 때 요약에 0으로 나온다
  created.add(s === 201 ? 1 : 0);
  conflict.add(s === 409 ? 1 : 0);
  serverError.add(s >= 500 ? 1 : 0);
  noResponse.add(s === 0 ? 1 : 0);
  other.add(s === 201 || s === 409 || s === 0 || s >= 500 ? 0 : 1);
  bookingWait.add(res.timings.blocked + res.timings.duration);
  // 사용자가 받은 상태 코드·메시지 종류별 개수를 요약의 checks에 남긴다 (분석은 요청별 기록의 check 태그로 센다)
  if (s !== 201 && s !== 409) check(res, { [`실패 ${s} ${reason(res)}`]: () => false });
}

export function health() {
  const res = http.get(`${BASE}/api/health/deep`, { tags: { name: 'health' } });
  check(res, { '헬스 200': (r) => r.status === 200 });
}
