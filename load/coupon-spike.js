// 3단계 쿠폰 오픈 스파이크 (docs/experiments/migration.md 3절): 정해진 시각 T에 쿠폰이 열리고, 쿠폰 화면을 미리 연 손님들이 T에 함께 누른다
// 같은 때 쿠폰과 무관한 조회가 초당 100건. 규모 · 행동은 로컬 E-03(고객사 저장소 load/e03-coupon-open.js)과 같다
// 다른 점: 쿠폰과 T를 바깥에서 받고(run-coupon.sh가 회차마다 새 쿠폰을 SQL로 만듦), 미리 연결(쿠폰 화면 열어 두기)이 기본
// 환경 변수: BASE_URL, COUPON_ID, OPEN_AT(T, epoch ms), COUPONS(장 수), CLAIMERS(누르는 손님 수), READ_SEC(조회를 이어 갈 초)
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL;
const COUPON_ID = __ENV.COUPON_ID;
const OPEN_AT = Number(__ENV.OPEN_AT);
const COUPONS = Number(__ENV.COUPONS ?? 100);
const EXPECTED_ISSUED = Number(__ENV.EXPECTED_ISSUED ?? COUPONS); // 촬영 회차는 실제 손님 선발급 1장을 제외
if (!Number.isInteger(EXPECTED_ISSUED) || EXPECTED_ISSUED < 1 || EXPECTED_ISSUED > COUPONS) throw new Error('EXPECTED_ISSUED 범위 오류');
const CLAIMERS = Number(__ENV.CLAIMERS ?? 1000);
const READ_SEC = Number(__ENV.READ_SEC ?? 600);
const SOLD_OUT = '쿠폰이 모두 소진되었습니다.';

const issued = new Counter('coupons_issued');
const soldOut = new Counter('coupons_sold_out'); // 다 나간 뒤의 정상 거절
const unexpected = new Counter('claims_unexpected'); // 그 밖의 모든 응답: 400(시작 전), 500, 연결 오류 등
const claimDuration = new Trend('claim_duration', true); // 사용자가 기다린 시간: 연결(blocked) + 서버 응답
const issuedAt = new Trend('coupon_issued_at', true); // T부터 발급 응답까지. max = 마지막 장이 나간 시각
const late = new Counter('claim_late'); // T까지 쿠폰 화면을 못 연 손님. 0이어야 모두 같은 순간에 누른 것
// 쿠폰을 받은 손님은 바로 그 쿠폰으로 예약한다 (2026-11-25 사용자: 실제 이벤트처럼. 받기 전에는 예약하지 않고 기다림)
const couponBooked = new Counter('coupon_bookings_created');
const couponBookFailed = new Counter('coupon_booking_failed'); // 숙소 · 내 쿠폰 · 예약 중 200 · 201 · 409 밖의 응답
const couponBookDuration = new Trend('coupon_booking_duration', true); // 쿠폰을 받은 뒤 예약 응답까지(화면 사이 1 ~ 3초 포함)
const signupFailed = new Counter('signup_failed'); // 3번 시도해도 가입 못 한 손님

const WAIT_MIN = Math.ceil((OPEN_AT - Date.now()) / 60000) || 20; // 시작 ~ T (분)

export const options = {
  scenarios: {
    // 응답이 느려져도 초당 100건을 그대로 보낸다 (느려진 구간의 표본이 줄어 숨겨지지 않게)
    reads: { executor: 'constant-arrival-rate', exec: 'read', rate: 100, timeUnit: '1s', duration: `${READ_SEC}s`, preAllocatedVUs: 100, maxVUs: 300 },
    // T를 넉넉히 뒤로 잡아도 기다리다 잘리지 않게 T + 10분
    claims: { executor: 'per-vu-iterations', exec: 'claim', vus: CLAIMERS, iterations: 1, maxDuration: `${WAIT_MIN + 10}m` },
  },
  thresholds: {
    coupons_issued: [`count==${EXPECTED_ISSUED}`], // 일반 회차는 전체, 촬영 회차는 손님 1장 제외
    claims_unexpected: ['count==0'],
    claim_late: ['count==0'],
    coupon_booking_failed: ['count==0'],
    signup_failed: ['count==0'],
  },
};

// 409(소진)는 정상 거절이라 실패율에서 뺀다
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const isoDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export function setup() {
  if (!BASE || !COUPON_ID || !OPEN_AT) throw new Error('BASE_URL · COUPON_ID · OPEN_AT이 필요합니다 (run-coupon.sh로 실행)');
  // T 전이라 '오픈 예정'이고 장 수가 그대로여야 한다
  const coupon = http.get(`${BASE}/api/coupons`).json('data').find((c) => c.id === COUPON_ID);
  if (coupon?.remaining !== COUPONS) throw new Error(`쿠폰이 ${COUPONS}장 남아 있어야 합니다: ${JSON.stringify(coupon)}`);
  const run = Date.now().toString(36);
  const hotels = http.get(`${BASE}/api/hotels?limit=50`).json('data.hotels');
  const left = (OPEN_AT - Date.now()) / 1000;
  console.log(`run=k6-${run} 손님 ${CLAIMERS}명은 T 2분 전까지 나눠 가입, 숙소 ${hotels.length}개, T까지 ${left.toFixed(0)}초`);
  if (left < 180) throw new Error('T까지 3분도 안 남아 가입을 나눌 시간이 없음: T를 더 뒤로 잡고 다시');
  return { run, hotelIds: hotels.map((h) => h.id), cities: [...new Set(hotels.map((h) => h.city))] };
}

// 가입 (응답에 토큰이 있어 로그인은 따로 안 함). 5xx · 연결 오류는 사람처럼 2초 뒤 다시, 3번까지
function signup(run, i) {
  for (let n = 0; n < 3; n++) {
    const res = http.post(
      `${BASE}/api/auth/register`,
      JSON.stringify({ email: `k6-${run}-${i}@example.com`, password: 'k6-password', name: `k6 ${i}` }),
      { headers: JSON_HEADERS, tags: { name: 'register' } },
    );
    if (res.status === 201) return res.json('data.token');
    if (res.status !== 0 && res.status < 500) break;
    sleep(2);
  }
  return null;
}

// 쿠폰과 무관한 조회 (E-03과 같은 검색 · 상세)
export function read(data) {
  const res =
    Math.random() < 0.5
      ? http.get(`${BASE}/api/hotels?city=${encodeURIComponent(pick(data.cities))}`, { tags: { name: 'search' } })
      : http.get(`${BASE}/api/hotels/${pick(data.hotelIds)}`, { tags: { name: 'hotel' } });
  check(res, { '조회 200': (r) => r.status === 200 });
}

// 촬영(run-coupon.sh VIDEO_DEMO=1): 가입은 T-6분까지 끝내고(화면 밖), T-5분 ~ T-2분에 걸쳐 손님이 몰려와
// T까지 10초쯤마다 숙소를 둘러본다 → 관제 화면에 손님 · 요청 · 서버 수가 늘어나는 장면. 성능 검증 회차에는 쓰지 않음
const VIDEO_BROWSE = __ENV.VIDEO_BROWSE === '1';
function browseBeforeOpen(data, i) {
  sleep(Math.max(0, OPEN_AT - 300000 + (i / CLAIMERS) * 180000 - Date.now()) / 1000);
  http.get(`${BASE}/api/coupons`, { tags: { name: 'warm' } });
  while (Date.now() < OPEN_AT - 3000) {
    sleep(8 + Math.random() * 4);
    if (Date.now() >= OPEN_AT - 3000) break;
    http.get(`${BASE}/api/hotels/${pick(data.hotelIds)}`, { tags: { name: 'browse' } });
  }
}

// 오픈 전에 하나둘 가입해 두고, 쿠폰 화면을 열어 둔 채 기다렸다가 T에 한 번 누른다 (사람마다 다른 계정)
// 가입은 시작 ~ T 2분 전에 고르게 나눈다. setup에서 한꺼번에 하면 3,000명에 약 17분(초당 3명)이라 시간 초과(11-25)
export function claim(data) {
  const i = exec.scenario.iterationInTest;
  sleep(((i / CLAIMERS) * Math.max(0, OPEN_AT - Date.now() - (VIDEO_BROWSE ? 360000 : 120000))) / 1000);
  const token = signup(data.run, i);
  signupFailed.add(token ? 0 : 1);
  if (!token) return;
  if (VIDEO_BROWSE) browseBeforeOpen(data, i);
  else http.get(`${BASE}/api/coupons`, { tags: { name: 'warm' } });
  const wait = OPEN_AT - Date.now();
  late.add(wait < 0 ? 1 : 0);
  sleep(Math.max(0, wait) / 1000);
  const res = http.post(`${BASE}/api/coupons/${COUPON_ID}/claim`, null, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'claim' },
  });
  const ok = res.status === 201;
  const gone = res.status === 409 && (res.body ?? '').includes(SOLD_OUT);
  // 0도 넣어야 한 건도 없을 때 요약에 0으로 나온다
  issued.add(ok ? 1 : 0);
  soldOut.add(gone ? 1 : 0);
  unexpected.add(ok || gone ? 0 : 1);
  claimDuration.add(res.timings.blocked + res.timings.duration);
  if (ok) issuedAt.add(Date.now() - OPEN_AT);
  if (ok) bookWithCoupon(data, token, res.json('data.id')); // 못 받은 손님은 떠남(가정)
}

// 숙소 보기(빈 객실 찾기, 최대 3곳) → 예약 화면(내 쿠폰) → 그 쿠폰으로 예약
function bookWithCoupon(data, token, userCouponId) {
  const t0 = Date.now();
  const auth = { Authorization: `Bearer ${token}` };
  let room;
  for (let i = 0; i < 3 && !room; i++) {
    const detail = http.get(`${BASE}/api/hotels/${pick(data.hotelIds)}`, { tags: { name: 'hotel' } });
    if (detail.status !== 200) return couponBookFailed.add(1);
    room = pick(detail.json('data.rooms').filter((r) => r.capacity >= 2 && r.is_available));
    sleep(1 + Math.random() * 2);
  }
  if (!room) return; // 빈 객실을 못 찾고 떠남(실패로 세지 않음)
  const mine = http.get(`${BASE}/api/coupons/mine`, { headers: auth, tags: { name: 'my-coupons' } });
  if (mine.status !== 200) return couponBookFailed.add(1);
  sleep(1 + Math.random() * 2);
  const start = 30 + Math.floor(Math.random() * 335);
  const res = http.post(
    `${BASE}/api/bookings`,
    JSON.stringify({ room_id: room.id, check_in_date: isoDate(start), check_out_date: isoDate(start + 1), guests: 2, user_coupon_id: userCouponId }),
    { headers: { ...JSON_HEADERS, ...auth, 'Idempotency-Key': `k6-c${data.run}-${__VU}` }, tags: { name: 'booking' } },
  );
  couponBooked.add(res.status === 201 ? 1 : 0);
  couponBookFailed.add(res.status === 201 || res.status === 409 ? 0 : 1);
  couponBookDuration.add(Date.now() - t0);
}
