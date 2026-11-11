// 부하 기준선 (1단계 이전 환경 · 3단계 목표 구조 공용): 손님 수를 500명씩 계단처럼 올려 에러율 1%를 처음 넘는 층을 찾는다
// 손님 행동은 E-01(e01-normal-traffic.js)과 같고 바뀐 것은 options뿐이다 (ADR-023). 1·3단계 비교를 위해 행동 부분은 고치지 않는다
// 데이터: scripts/seed-volume.sql (숙소 1,000 · 회원 2만 · 지난 예약 10만). 주소는 BASE_URL로 받는다
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
const USERS = Number(__ENV.USERS ?? 50);
const PASSWORD = 'k6-password';
const bookingsCreated = new Counter('bookings_created');

// 방문 한 번에 일어날 확률 (가정). 숙박 예약 사이트의 예약 전환율은 보통 1~3%
const LOGIN_RATE = 0.1; // 저장된 로그인이 없어 다시 로그인
const BOOKING_RATE = 0.03;
const MY_BOOKINGS_RATE = 0.05;

// 계단: 1분 동안 500명 늘리고 5분 머문다(방문 한 바퀴 약 1분 → 손님마다 4~5바퀴, 3단계 오토스케일링이 반응할 시간).
// 500 → 3,000명 6층, 1회 약 37분. 3,000명에서도 버티면 같은 모양으로 층만 더 얹는다(겹치는 층끼리 1·3단계 비교)
const FLOOR = 500;
const FLOORS = 6;
export const options = {
  stages: [
    ...Array.from({ length: FLOORS }, (_, i) => [
      { duration: '1m', target: FLOOR * (i + 1) },
      { duration: '5m', target: FLOOR * (i + 1) },
    ]).flat(),
    { duration: '1m', target: 0 },
  ],
  // 합격 기준(thresholds)은 두지 않는다: 한계를 넘는 층까지 일부러 올리므로 전체 기준은 실패가 정상이다.
  // 층별 에러율·p95는 끝난 뒤 시각으로 잘라 본다
};

// 409(이미 예약된 날짜)는 정상 거절이라 실패율에서 뺀다
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const isoDate = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);
const think = () => sleep(5 + Math.random() * 15); // 화면을 읽고 다음을 누르기까지 5~20초
// 화면 하나가 동시에 부르는 API 묶음 (http.batch로 브라우저처럼 한꺼번에 보낸다)
const get = (path, name, token) => ({
  method: 'GET',
  url: `${BASE}${path}`,
  params: { tags: { name }, headers: token ? { Authorization: `Bearer ${token}` } : {} },
});
const ok = (r) => r.status === 200;

// 가입은 비밀번호 해시로 느리므로 준비 단계에서만 한다. 로그인은 방문 중 일부(LOGIN_RATE)가 실제로 한다
export function setup() {
  const run = Date.now().toString(36);
  const emails = [];
  const tokens = [];
  for (let i = 0; i < USERS; i++) {
    const email = `k6-${run}-${i}@example.com`;
    const res = http.post(`${BASE}/api/auth/register`, JSON.stringify({ email, password: PASSWORD, name: `k6 ${i}` }), {
      headers: JSON_HEADERS,
    });
    if (res.status !== 201) throw new Error(`가입 실패 ${res.status}: ${res.body}`);
    emails.push(email);
    tokens.push(res.json('data.token'));
  }
  const cities = http.get(`${BASE}/api/hotels/cities`).json('data').map((c) => c.city);
  const total = http.get(`${BASE}/api/hotels?limit=1`).json('data.pagination.total');
  console.log(`run=k6-${run} 사용자 ${tokens.length}명, 도시 ${cities.length}곳, 숙소 ${total}개`);
  return { run, emails, tokens, cities };
}

export default function (data) {
  const user = (__VU - 1) % data.tokens.length;
  let token = data.tokens[user];

  // 1. 홈: 추천 숙소, 도시 목록, 쿠폰 목록
  const home = http.batch([get('/api/hotels/featured', 'featured'), get('/api/hotels/cities', 'cities'), get('/api/coupons', 'coupons')]);
  check(home[0], { '추천 숙소 있음': (r) => ok(r) && r.json('data').length > 0 });
  check(home[1], { '도시 목록 200': ok });
  check(home[2], { '쿠폰 목록 200': ok });
  think();

  if (Math.random() < LOGIN_RATE) {
    const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: data.emails[user], password: PASSWORD }), {
      headers: JSON_HEADERS,
      tags: { name: 'login' },
    });
    check(res, { '로그인 200': (r) => ok(r) && !!r.json('data.token') });
    if (ok(res)) token = res.json('data.token');
    think();
  }

  // 2. 검색: 검색 화면은 결과(12개)와 도시 목록을 함께 부른다
  const city = encodeURIComponent(pick(data.cities));
  const [search] = http.batch([get(`/api/hotels?limit=12&page=1&guests=2&city=${city}`, 'search'), get('/api/hotels/cities', 'cities')]);
  const hotels = ok(search) ? search.json('data.hotels') : [];
  check(search, { '검색 결과 있음': () => hotels.length > 0 });
  think();
  if (hotels.length === 0) return;

  // 3. 검색 결과에서 숙소 1~3곳 보기: 숙소 정보와 리뷰 3개
  let hotelId;
  let rooms = [];
  for (let i = 1 + Math.floor(Math.random() * 3); i > 0; i--) {
    hotelId = pick(hotels).id;
    const [detail, reviews] = http.batch([get(`/api/hotels/${hotelId}`, 'hotel'), get(`/api/reviews?hotel_id=${hotelId}&limit=3`, 'reviews')]);
    rooms = ok(detail) ? detail.json('data.rooms') : [];
    check(detail, { '객실 있음': () => rooms.length > 0 });
    check(reviews, { '리뷰 200': ok });
    think();
  }

  // 4. 일부만 예약: 예약 화면(숙소 정보 + 내 쿠폰) → 예약
  const room = pick(rooms.filter((r) => r.capacity >= 2 && r.is_available));
  if (room && Math.random() < BOOKING_RATE) {
    http.batch([get(`/api/hotels/${hotelId}`, 'hotel'), get('/api/coupons/mine', 'my-coupons', token)]);
    think();
    // 가까운 날짜에 몰린다: 1~90일 뒤, 1~3박
    const start = 1 + Math.floor(Math.random() * 90);
    const res = http.post(
      `${BASE}/api/bookings`,
      JSON.stringify({ room_id: room.id, check_in_date: isoDate(start), check_out_date: isoDate(start + 1 + Math.floor(Math.random() * 3)), guests: 2 }),
      {
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}`, 'Idempotency-Key': `k6-${data.run}-${__VU}-${__ITER}` },
        tags: { name: 'booking' },
      },
    );
    check(res, { '예약 201 또는 409': (r) => r.status === 201 || r.status === 409 });
    if (res.status === 201) bookingsCreated.add(1);
    think();
  }

  // 5. 일부는 내 예약 확인
  if (Math.random() < MY_BOOKINGS_RATE) {
    check(http.get(`${BASE}/api/bookings?limit=50`, { headers: { Authorization: `Bearer ${token}` }, tags: { name: 'my-bookings' } }), {
      '내 예약 200': ok,
    });
    think();
  }
}

export function teardown(data) {
  console.log(`정합성 검사에서 k6-${data.run}의 예약 수가 위 bookings_created와 같아야 한다 (scripts/check-consistency.sql)`);
}
