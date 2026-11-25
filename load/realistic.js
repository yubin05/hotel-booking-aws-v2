// 실제 손님 행동 한계점 시험 (ADR-074 ①②③): 500명씩 계단을 올려 손님 기준이 무너지는 층을 찾는다
// baseline.js(1 · 3단계 비교용, 고치지 않음)와 다른 점 — 2026-11-25 사용자 결정 "단순 api 호출만 하면 안 됨":
//   - 방문마다 HTML(no-cache라 매번 서버까지), JS · CSS는 그 손님이 처음 올 때만(브라우저 캐시를 흉내)
//   - 로그인은 예약 · 내 예약이 필요할 때 한 번 하고 유지(방문마다 10% 다시 로그인하던 가정을 버림). 토큰 1시간 > 시험 49분
//   - 예약은 방문당 3%(업계 호텔 웹사이트 전환율 2 ~ 3% 확인, migration.md 2절)
// 판정은 같이 도는 측정 손님(journey.js) · 층별 표(baseline-report.mjs · journey-report.mjs)로 한다
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
const ACCOUNTS = Number(__ENV.ACCOUNTS ?? 100); // 준비에서 가입(1번 약 0.6초)하는 계정 수. 손님 여럿이 계정을 나눠 씀
const FLOOR = Number(__ENV.FLOOR ?? 500); // 계단 한 칸. ② DB 한계 시험은 1,000 × 6층 = 6,000명(37분)
const FLOORS = Number(__ENV.FLOORS ?? 8); // 무너질 때까지: 기본 4,000명(8층, 49분)
const PASSWORD = 'k6-password';
const bookingsCreated = new Counter('bookings_created');

// 스모크(run-baseline.sh에 k6 옵션을 붙인 짧은 실행 → SMOKE=1)는 로그인 · 예약 · 내 예약 경로를 반드시 타게 100% · 생각 1초.
// 11-25 첫 스모크는 3% · 5 ~ 20초라 40초 동안 이 경로를 한 번도 안 탔다
const SMOKE = __ENV.SMOKE === '1';
const BOOKING_RATE = SMOKE ? 1 : 0.03;
const MY_BOOKINGS_RATE = SMOKE ? 1 : 0.05;

export const options = {
  stages: [
    ...Array.from({ length: FLOORS }, (_, i) => [
      { duration: '1m', target: FLOOR * (i + 1) },
      { duration: '5m', target: FLOOR * (i + 1) },
    ]).flat(),
    { duration: '1m', target: 0 },
  ],
  // 계정 100개 가입(1번 약 0.6초, 측정 손님과 CPU를 나눠 쓰면 더 느림)이 기본 60초를 넘어 11-25 스모크가 멈췄다
  setupTimeout: '5m',
};

// 409(이미 예약된 날짜)는 정상 거절이라 실패율에서 뺀다
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const isoDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const think = () => sleep(SMOKE ? 1 : 5 + Math.random() * 15); // 화면을 읽고 다음을 누르기까지 5 ~ 20초 (baseline.js와 같음)
const get = (path, name, token) => ({
  method: 'GET',
  url: `${BASE}${path}`,
  params: { tags: { name }, headers: token ? { Authorization: `Bearer ${token}` } : {} },
});
const ok = (r) => r.status === 200;

export function setup() {
  const run = Date.now().toString(36);
  const emails = [];
  for (let i = 0; i < ACCOUNTS; i++) {
    const email = `r-${run}-${i}@example.com`;
    const res = http.post(`${BASE}/api/auth/register`, JSON.stringify({ email, password: PASSWORD, name: `real ${i}` }), { headers: JSON_HEADERS });
    if (res.status !== 201) throw new Error(`가입 실패 ${res.status}: ${res.body}`);
    emails.push(email);
  }
  console.log(`run=r-${run} 계정 ${emails.length}개, 계단 ${FLOORS}층(최대 ${FLOOR * FLOORS}명)`);
  return { run, emails };
}

// 손님(VU)마다 따로 남는 값: 브라우저 캐시와 저장된 로그인
let assetsCached = false;
let token = null;

function login(email) {
  const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: PASSWORD }), { headers: JSON_HEADERS, tags: { name: 'login' } });
  check(res, { '로그인 200': (r) => ok(r) && !!r.json('data.token') });
  if (ok(res)) token = res.json('data.token');
  return token;
}

export default function (data) {
  const email = data.emails[(__VU - 1) % data.emails.length];

  // 1. 첫 화면: HTML → (처음 온 손님만) JS · CSS → 화면 API 3개
  const page = http.get(`${BASE}/`, { tags: { name: 'page' } });
  check(page, { 'HTML 200': ok });
  if (!assetsCached && ok(page)) {
    const assets = [...page.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => ({ method: 'GET', url: `${BASE}${m[1]}`, params: { tags: { name: 'asset' }, responseType: 'none' } })); // 내용은 안 씀: 버려야 발생기 메모리가 버틴다(11-25 2,000명 근처 메모리 부족)
    const files = http.batch(assets);
    assetsCached = check(null, { 'JS · CSS 200': () => assets.length > 0 && files.every(ok) });
  }
  const home = http.batch([get('/api/hotels/featured', 'featured'), get('/api/hotels/cities', 'cities'), get('/api/coupons', 'coupons')]);
  check(home[0], { '추천 숙소 있음': (r) => ok(r) && r.json('data').length > 0 });
  check(home[1], { '도시 목록 200': ok });
  check(home[2], { '쿠폰 목록 200': ok });
  const cities = ok(home[1]) ? home[1].json('data').map((c) => c.city) : [];
  think();
  if (cities.length === 0) return;

  // 2. 검색: 결과(12개)와 도시 목록
  const [search] = http.batch([get(`/api/hotels?limit=12&page=1&guests=2&city=${encodeURIComponent(pick(cities))}`, 'search'), get('/api/hotels/cities', 'cities')]);
  const hotels = ok(search) ? search.json('data.hotels') : [];
  check(search, { '검색 결과 있음': () => hotels.length > 0 });
  think();
  if (hotels.length === 0) return;

  // 3. 숙소 1 ~ 3곳 보기: 숙소 정보와 리뷰 3개
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

  // 4. 일부만 예약: 로그인이 없으면 이때 로그인 → 예약 화면(숙소 정보 + 내 쿠폰) → 예약
  const room = pick(rooms.filter((r) => r.capacity >= 2 && r.is_available));
  if (room && Math.random() < BOOKING_RATE && (token || login(email))) {
    http.batch([get(`/api/hotels/${hotelId}`, 'hotel'), get('/api/coupons/mine', 'my-coupons', token)]);
    think();
    const start = 1 + Math.floor(Math.random() * 90); // 가까운 날짜에 몰린다: 1 ~ 90일 뒤, 1 ~ 3박
    const res = http.post(
      `${BASE}/api/bookings`,
      JSON.stringify({ room_id: room.id, check_in_date: isoDate(start), check_out_date: isoDate(start + 1 + Math.floor(Math.random() * 3)), guests: 2 }),
      { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}`, 'Idempotency-Key': `k6-r${data.run}-${__VU}-${__ITER}` }, tags: { name: 'booking' } },
    );
    check(res, { '예약 201 또는 409': (r) => r.status === 201 || r.status === 409 });
    if (res.status === 201) bookingsCreated.add(1);
    think();
  }

  // 5. 일부는 내 예약 확인 (로그인이 없으면 이때 로그인)
  if (Math.random() < MY_BOOKINGS_RATE && (token || login(email))) {
    check(http.get(`${BASE}/api/bookings?limit=50`, { headers: { Authorization: `Bearer ${token}` }, tags: { name: 'my-bookings' } }), { '내 예약 200': ok });
    think();
  }
}

export function teardown(data) {
  // 예약 키를 k6-로 시작해야 check-consistency.sql의 "실행별 예약 수"에 잡힌다
  console.log(`정합성 검사에서 k6-r${data.run}의 예약 수가 위 bookings_created와 같아야 한다 (scripts/check-consistency.sql)`);
}
