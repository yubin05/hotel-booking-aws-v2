// E-03 쿠폰 오픈 순간 쏠림: 100장 쿠폰에 1,000명이 같은 순간 발급 요청 + 그 앞뒤로 쿠폰과 무관한 조회 (docs/07-experiments.md)
// 준비: docs/07의 E-03 메모대로 DB를 새로 띄우고 시드의 '주말 특가 10,000원 할인' 쿠폰을 지금 연다
// 실행: load/run-k6.sh e03-coupon-open.js
// 미리 연결: load/run-k6.sh e03-coupon-open.js -e WARM=1 (실제 사용자처럼 쿠폰 화면을 먼저 열어 연결을 만들어 두고 누른다)
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
const COUPON_ID = '55555555-0000-0000-0000-000000000003'; // 시드의 '주말 특가 10,000원 할인' (100장)
const CLAIMERS = 1000;
const SOLD_OUT = '쿠폰이 모두 소진되었습니다.';
// 미리 연결할 때 모두 함께 누르는 시각 (시나리오 시작 3초 뒤). Node는 쉬는 연결을 5초 뒤 닫으므로 그 안이어야 한다
const WARM_MS = __ENV.WARM === '1' ? 3000 : 0;

const issued = new Counter('coupons_issued');
const soldOut = new Counter('coupons_sold_out'); // 다 나간 뒤의 정상 거절
const unexpected = new Counter('claims_unexpected'); // 그 밖의 모든 응답: 500, 연결 오류, 남았는데 거절 등
const claimDuration = new Trend('claim_duration', true); // 사용자가 기다린 시간: 연결(blocked, 연결 시간 포함) + 서버 응답
const warmLate = new Counter('warm_late'); // 미리 연결이 누를 시각까지 안 끝난 사용자. 0이어야 같은 순간에 누른 것
const issuedAt = new Trend('coupon_issued_at', true); // 다 함께 누른 시각부터 발급 응답까지. max = 100장이 다 나간 시각

export const options = {
  setupTimeout: '10m', // 1,000명 가입 (비밀번호 해시가 느림)
  scenarios: {
    // 응답이 느려져도 초당 100건을 그대로 보낸다 (느려진 만큼 덜 보내면 느려진 구간의 표본이 줄어 숨겨진다)
    reads: { executor: 'constant-arrival-rate', exec: 'read', rate: 100, timeUnit: '1s', duration: '30s', preAllocatedVUs: 100, maxVUs: 300 },
    claims: { executor: 'per-vu-iterations', exec: 'claim', vus: CLAIMERS, iterations: 1, startTime: '10s' },
  },
  thresholds: {
    coupons_issued: ['count==100'], // 정확히 100장
    claims_unexpected: ['count==0'],
    ...(WARM_MS ? { warm_late: ['count==0'] } : {}),
  },
};

// 409(소진)는 정상 거절이라 실패율에서 뺀다
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function setup() {
  // 쿠폰이 안 열려 있으면 1,000명 가입을 기다리기 전에 멈춘다
  const coupon = http.get(`${BASE}/api/coupons`).json('data').find((c) => c.id === COUPON_ID);
  if (coupon?.status !== 'open' || coupon.remaining !== 100) {
    throw new Error(`쿠폰이 열려 있고 100장 남아 있어야 합니다 (docs/07의 E-03 준비): ${JSON.stringify(coupon)}`);
  }
  const run = Date.now().toString(36);
  // 가입 응답에 토큰이 들어 있어 로그인은 따로 하지 않는다. http.batch는 동시에 6건씩 보낸다
  const regs = http.batch(
    Array.from({ length: CLAIMERS }, (_, i) => [
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
  console.log(`run=k6-${run} 사용자 ${tokens.length}명, 숙소 ${hotels.length}개`);
  return { tokens, hotelIds: hotels.map((h) => h.id), cities: [...new Set(hotels.map((h) => h.city))] };
}

// 쿠폰과 무관한 조회 (E-01과 같은 검색·상세)
export function read(data) {
  const res =
    Math.random() < 0.5
      ? http.get(`${BASE}/api/hotels?city=${encodeURIComponent(pick(data.cities))}`, { tags: { name: 'search' } })
      : http.get(`${BASE}/api/hotels/${pick(data.hotelIds)}`, { tags: { name: 'hotel' } });
  check(res, { '조회 200': (r) => r.status === 200 });
}

// 1,000명이 같은 순간에 한 번씩 누른다 (사람마다 다른 계정)
export function claim(data) {
  const burstAt = exec.scenario.startTime + WARM_MS;
  if (WARM_MS) {
    http.get(`${BASE}/api/coupons`, { tags: { name: 'warm' } });
    const wait = burstAt - Date.now();
    warmLate.add(wait < 0 ? 1 : 0);
    sleep(Math.max(0, wait) / 1000);
  }
  const res = http.post(`${BASE}/api/coupons/${COUPON_ID}/claim`, null, {
    headers: { Authorization: `Bearer ${data.tokens[exec.scenario.iterationInTest]}` },
    tags: { name: 'claim' },
  });
  const ok = res.status === 201;
  const gone = res.status === 409 && (res.body ?? '').includes(SOLD_OUT);
  // 0도 넣어야 한 건도 없을 때 요약에 0으로 나온다
  issued.add(ok ? 1 : 0);
  soldOut.add(gone ? 1 : 0);
  unexpected.add(ok || gone ? 0 : 1);
  claimDuration.add(res.timings.blocked + res.timings.duration);
  if (ok) issuedAt.add(Date.now() - burstAt);
}
