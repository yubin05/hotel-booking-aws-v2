// 손님 여정: 접속(첫 화면)부터 예약까지 손님이 실제로 기다린 시간 (2026-11-24 사용자 요청, migration.md 2절)
// baseline.js 부하(3,000명까지)와 같은 발생기에서 따로 띄운 k6로 손님 몇 명(PROBES)만 처음부터 끝까지 반복한다.
// baseline.js는 1 · 3단계 비교 때문에 고치지 않는다(ADR-023). baseline.js는 /api/*만 불러 첫 화면(HTML · JS · CSS)을 재지 않았다
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
// 20명: 3,000명 층(여정 1회 약 2분)에서도 층마다 여정 약 50번. 늘릴수록 표본은 늘지만 매 여정 로그인이라 낮은 층 부하가 커진다
const PROBES = Number(__ENV.PROBES ?? 20);
const PASSWORD = 'k6-password';
// 화면 사이 5 ~ 20초는 baseline.js와 같은 "실제 손님" 간격. 기다린 시간에는 넣지 않는다 (2초로 쉬면 측정 손님이 로그인 부하를 크게 늘림)
const think = () => sleep(5 + Math.random() * 15);

const wait = new Trend('journey_wait', true); // 성공한 여정의 화면 6개 기다린 시간 합
const screen = new Trend('journey_screen', true); // 화면마다 (tags.screen)
const done = new Rate('journey_ok'); // 예약 응답(201 · 409)까지 모두 성공
const failAt = new Counter('journey_fail'); // 멈춘 화면 (tags.screen)
const booked = new Counter('journey_booked');

export const options = {
  scenarios: { journey: { executor: 'constant-vus', vus: PROBES, duration: __ENV.DURATION ?? '37m' } },
};
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const isoDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const get = (path, name, token) => ({
  method: 'GET',
  url: `${BASE}${path}`,
  params: { tags: { name }, headers: token ? { Authorization: `Bearer ${token}` } : {} },
});
const ok = (r) => r.status === 200;

export function setup() {
  const run = Date.now().toString(36);
  const emails = [];
  for (let i = 0; i < PROBES; i++) {
    const email = `j-${run}-${i}@example.com`;
    const res = http.post(`${BASE}/api/auth/register`, JSON.stringify({ email, password: PASSWORD, name: `journey ${i}` }), { headers: JSON_HEADERS });
    if (res.status !== 201) throw new Error(`가입 실패 ${res.status}: ${res.body}`);
    emails.push(email);
  }
  return { run, emails };
}

// 화면 하나: 브라우저처럼 차례로 부르고 걸린 시간을 남긴다. fn이 거짓을 돌려주면 그 화면에서 멈춘 것으로 센다
function step(name, fn) {
  const t0 = Date.now();
  const result = fn();
  const ms = Date.now() - t0;
  screen.add(ms, { screen: name });
  if (!result) failAt.add(1, { screen: name });
  return result ? { ms, result } : null;
}

export default function (data) {
  const email = data.emails[(__VU - 1) % data.emails.length];
  let total = 0;
  const run = (name, fn) => {
    const s = step(name, fn);
    if (s) total += s.ms;
    return s && s.result;
  };
  const finish = (success) => {
    done.add(success);
    if (success) wait.add(total);
  };

  // 1. 첫 화면: HTML(no-cache라 매번 서버) → HTML이 가리키는 JS · CSS → 화면이 부르는 API 3개
  const cities = run('home', () => {
    const page = http.get(`${BASE}/`, { tags: { name: 'page' } });
    if (!ok(page)) return false;
    const assets = [...page.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => get(m[1], 'asset'));
    const files = assets.length ? http.batch(assets) : [];
    const api = http.batch([get('/api/hotels/featured', 'featured'), get('/api/hotels/cities', 'cities'), get('/api/coupons', 'coupons')]);
    return check(null, { '첫 화면': () => assets.length > 0 && files.every(ok) && api.every(ok) }) && api[1].json('data').map((c) => c.city);
  });
  if (!cities) return finish(false);
  think();

  // 2. 검색
  const hotels = run('search', () => {
    const [res] = http.batch([get(`/api/hotels?limit=12&page=1&guests=2&city=${encodeURIComponent(pick(cities))}`, 'search'), get('/api/hotels/cities', 'cities')]);
    const list = ok(res) ? res.json('data.hotels') : [];
    return check(res, { '검색 결과': () => list.length > 0 }) && list;
  });
  if (!hotels) return finish(false);
  think();

  // 3. 숙소 보기: 숙소 정보 + 리뷰
  const target = run('hotel', () => {
    const id = pick(hotels).id;
    const [detail, reviews] = http.batch([get(`/api/hotels/${id}`, 'hotel'), get(`/api/reviews?hotel_id=${id}&limit=3`, 'reviews')]);
    const room = ok(detail) && pick(detail.json('data.rooms').filter((r) => r.capacity >= 2 && r.is_available));
    return check(reviews, { '숙소 · 객실': (r) => ok(r) && !!room }) && { id, room };
  });
  if (!target) return finish(false);
  think();

  // 4. 예약 버튼 → 로그인 (저장된 로그인이 없는 손님)
  const token = run('login', () => {
    const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: PASSWORD }), { headers: JSON_HEADERS, tags: { name: 'login' } });
    return check(res, { 로그인: (r) => ok(r) && !!r.json('data.token') }) && res.json('data.token');
  });
  if (!token) return finish(false);
  think();

  // 5. 예약 화면: 숙소 정보 + 내 쿠폰
  const form = run('booking-page', () => {
    const res = http.batch([get(`/api/hotels/${target.id}`, 'hotel'), get('/api/coupons/mine', 'my-coupons', token)]);
    return check(null, { '예약 화면': () => res.every(ok) });
  });
  if (!form) return finish(false);
  think();

  // 6. 예약: 겹치는 날짜(409)를 줄이려 30 ~ 365일 뒤 1박. 409도 "응답을 받음"으로 센다
  const res = run('booking', () => {
    const start = 30 + Math.floor(Math.random() * 335);
    const r = http.post(
      `${BASE}/api/bookings`,
      JSON.stringify({ room_id: target.room.id, check_in_date: isoDate(start), check_out_date: isoDate(start + 1), guests: 2 }),
      { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}`, 'Idempotency-Key': `j-${data.run}-${__VU}-${__ITER}` }, tags: { name: 'booking' } },
    );
    return check(r, { '예약 201 또는 409': () => r.status === 201 || r.status === 409 }) && r;
  });
  if (!res) return finish(false);
  if (res.status === 201) booked.add(1);
  finish(true);
  think();
}
