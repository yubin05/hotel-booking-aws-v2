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
const CLAIMERS = Number(__ENV.CLAIMERS ?? 1000);
const READ_SEC = Number(__ENV.READ_SEC ?? 600);
const SOLD_OUT = '쿠폰이 모두 소진되었습니다.';

const issued = new Counter('coupons_issued');
const soldOut = new Counter('coupons_sold_out'); // 다 나간 뒤의 정상 거절
const unexpected = new Counter('claims_unexpected'); // 그 밖의 모든 응답: 400(시작 전), 500, 연결 오류 등
const claimDuration = new Trend('claim_duration', true); // 사용자가 기다린 시간: 연결(blocked) + 서버 응답
const issuedAt = new Trend('coupon_issued_at', true); // T부터 발급 응답까지. max = 마지막 장이 나간 시각
const late = new Counter('claim_late'); // T까지 쿠폰 화면을 못 연 손님. 0이어야 모두 같은 순간에 누른 것

export const options = {
  setupTimeout: '10m', // 손님 가입 (비밀번호 해시가 느림)
  scenarios: {
    // 응답이 느려져도 초당 100건을 그대로 보낸다 (느려진 구간의 표본이 줄어 숨겨지지 않게)
    reads: { executor: 'constant-arrival-rate', exec: 'read', rate: 100, timeUnit: '1s', duration: `${READ_SEC}s`, preAllocatedVUs: 100, maxVUs: 300 },
    claims: { executor: 'per-vu-iterations', exec: 'claim', vus: CLAIMERS, iterations: 1, maxDuration: '30m' },
  },
  thresholds: {
    coupons_issued: [`count==${COUPONS}`], // 정확히 장 수만큼
    claims_unexpected: ['count==0'],
    claim_late: ['count==0'],
  },
};

// 409(소진)는 정상 거절이라 실패율에서 뺀다
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function setup() {
  if (!BASE || !COUPON_ID || !OPEN_AT) throw new Error('BASE_URL · COUPON_ID · OPEN_AT이 필요합니다 (run-coupon.sh로 실행)');
  // T 전이라 '오픈 예정'이고 장 수가 그대로여야 한다
  const coupon = http.get(`${BASE}/api/coupons`).json('data').find((c) => c.id === COUPON_ID);
  if (coupon?.remaining !== COUPONS) throw new Error(`쿠폰이 ${COUPONS}장 남아 있어야 합니다: ${JSON.stringify(coupon)}`);
  const run = Date.now().toString(36);
  // 가입 응답에 토큰이 들어 있어 로그인은 따로 하지 않는다. http.batch는 같은 주소로 동시에 6건씩 보낸다
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
  const left = (OPEN_AT - Date.now()) / 1000;
  console.log(`run=k6-${run} 사용자 ${tokens.length}명, 숙소 ${hotels.length}개, T까지 ${left.toFixed(0)}초`);
  if (left < 15) throw new Error('가입이 T 직전까지 끝나지 않음: T를 더 뒤로 잡고 다시');
  return { tokens, hotelIds: hotels.map((h) => h.id), cities: [...new Set(hotels.map((h) => h.city))] };
}

// 쿠폰과 무관한 조회 (E-03과 같은 검색 · 상세)
export function read(data) {
  const res =
    Math.random() < 0.5
      ? http.get(`${BASE}/api/hotels?city=${encodeURIComponent(pick(data.cities))}`, { tags: { name: 'search' } })
      : http.get(`${BASE}/api/hotels/${pick(data.hotelIds)}`, { tags: { name: 'hotel' } });
  check(res, { '조회 200': (r) => r.status === 200 });
}

// 쿠폰 화면을 열어 둔 채 기다렸다가 T에 한 번 누른다 (사람마다 다른 계정)
export function claim(data) {
  http.get(`${BASE}/api/coupons`, { tags: { name: 'warm' } });
  const wait = OPEN_AT - Date.now();
  late.add(wait < 0 ? 1 : 0);
  sleep(Math.max(0, wait) / 1000);
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
  if (ok) issuedAt.add(Date.now() - OPEN_AT);
}
