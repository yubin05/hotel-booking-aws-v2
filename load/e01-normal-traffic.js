// E-01 평소 트래픽(기준선): 조회 위주(80%) + 일부 예약(20%). 새 실험은 이 파일을 복사해 eNN-이름.js로 만든다 (docs/07-experiments.md)
// 실행: load/run-k6.sh e01-normal-traffic.js   (사용자 수 바꾸기: 뒤에 -e USERS=20)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
const USERS = Number(__ENV.USERS ?? 50);
const bookingsCreated = new Counter('bookings_created');

export const options = {
  stages: [
    { duration: '30s', target: 500 }, // 500명까지
    { duration: '30s', target: 500 }, // 유지 (AWS에서는 5m으로 늘림)
    { duration: '10s', target: 0 },
  ],
  thresholds: { http_req_failed: ['rate<0.01'] },
};

// 409(이미 예약된 날짜)는 정상 거절이라 실패율에서 뺀다
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const isoDate = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);

// 가입은 비밀번호 해시로 느리므로 준비 단계에서만 하고, 부하 구간에서는 재지 않는다
export function setup() {
  const run = Date.now().toString(36);
  const tokens = [];
  for (let i = 0; i < USERS; i++) {
    const res = http.post(
      `${BASE}/api/auth/register`,
      JSON.stringify({ email: `k6-${run}-${i}@example.com`, password: 'k6-password', name: `k6 ${i}` }),
      { headers: JSON_HEADERS },
    );
    if (res.status !== 201) throw new Error(`가입 실패 ${res.status}: ${res.body}`);
    tokens.push(res.json('data.token'));
  }
  const hotels = http.get(`${BASE}/api/hotels?limit=50`).json('data.hotels');
  const roomIds = hotels.flatMap((h) => http.get(`${BASE}/api/hotels/${h.id}`).json('data.rooms').map((r) => r.id));
  console.log(`run=k6-${run} 사용자 ${tokens.length}명, 숙소 ${hotels.length}개, 객실 ${roomIds.length}개`);
  return { run, tokens, roomIds, hotelIds: hotels.map((h) => h.id), cities: [...new Set(hotels.map((h) => h.city))] };
}

export default function (data) {
  if (Math.random() < 0.8) {
    const search = http.get(`${BASE}/api/hotels?city=${encodeURIComponent(pick(data.cities))}`, { tags: { name: 'search' } });
    check(search, { '검색 200': (r) => r.status === 200 });
    const hotel = http.get(`${BASE}/api/hotels/${pick(data.hotelIds)}`, { tags: { name: 'hotel' } });
    check(hotel, { '상세 200': (r) => r.status === 200 });
  } else {
    // 날짜를 30~729일 뒤로 넓게 흩어 겹침(409)을 줄인다. 겹침을 일부러 만드는 건 E-02
    const start = 30 + Math.floor(Math.random() * 700);
    const res = http.post(
      `${BASE}/api/bookings`,
      JSON.stringify({ room_id: pick(data.roomIds), check_in_date: isoDate(start), check_out_date: isoDate(start + 1 + Math.floor(Math.random() * 2)), guests: 1 }),
      {
        headers: {
          ...JSON_HEADERS,
          Authorization: `Bearer ${data.tokens[(__VU - 1) % data.tokens.length]}`,
          'Idempotency-Key': `k6-${data.run}-${__VU}-${__ITER}`,
        },
        tags: { name: 'booking' },
      },
    );
    check(res, { '예약 201 또는 409': (r) => r.status === 201 || r.status === 409 });
    if (res.status === 201) bookingsCreated.add(1);
  }
  // sleep(1);
  sleep(3 + Math.random() * 7); // 실제 사용자처럼 3~10초 쉬었다 다음 행동
}

export function teardown(data) {
  console.log(`정합성 검사에서 k6-${data.run}의 예약 수가 위 bookings_created와 같아야 한다 (scripts/check-consistency.sql)`);
}
