// 드릴 중 손님 역할 (4단계 장애 · 5단계 리전 복원, docs/experiments/faults.md · region-drill.md)
//   node drill/writer.mjs <기록 파일> [주소]      Ctrl+C · kill로 멈춤 (줄마다 바로 파일에 써서 잃지 않음)
// 1초마다 순번 예약 1건(재전송 키 drill-<run>-<순번>), 0.25초마다 숙소 목록 조회 1건. 요청마다 한 줄(탭 구분):
//   epoch_ms  kind(write|read)  seq  status(응답 없음은 0)  ms(손님이 기다린 시간, 연결 포함)  served_by  booking_id
// 쓰기가 응답 없음 · 5xx면 같은 순번 · 같은 키로 다시 보냄 → 앞 요청이 사실 들어갔다면 200(이미 있는 예약)이 와야 함(멱등성, 02 9절)
// 요청 수: 초당 5건 = 5분 1,500건 → WAF all-rate-limit(IP당 5분 2,000건) 안. 로그인은 처음 한 번(+토큰 만료 때)이라 auth 한도(100건) 안
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';

const [out, base = 'https://hotel.vundle34.cloud'] = process.argv.slice(2);
assert.ok(out, '사용: node drill/writer.mjs <기록 파일> [주소]');
const WRITE_MS = Number(process.env.WRITE_MS ?? 1000);
const READ_MS = Number(process.env.READ_MS ?? 250);
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const run = `${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const email = `drill-${run}@example.com`;
const PASSWORD = 'drill-check-1'; // 시험용 계정 (marker.mjs와 같은 취급)

async function call(method, path, body, headers = {}) {
  const t = Date.now();
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ms: Date.now() - t, servedBy: res.headers.get('x-served-by') ?? '-', json };
  } catch {
    return { status: 0, ms: Date.now() - t, servedBy: '-', json: {} };
  }
}
const log = (kind, seq, r, id = '-') => appendFileSync(out, `${Date.now()}\t${kind}\t${seq}\t${r.status}\t${r.ms}\t${r.servedBy}\t${id}\n`);

// 준비: 가입 → 로그인 → 2인 객실 목록. 여기서 실패하면 드릴 시작 전이라 멈춤
const reg = await call('POST', '/api/auth/register', { email, password: PASSWORD, name: '드릴 손님' });
assert.equal(reg.status, 201, `가입 실패 ${reg.status}`);
let token;
let lastLogin = 0;
async function login() {
  if (Date.now() - lastLogin < 30_000) return false; // 401이 이어져도 auth 한도(IP당 5분 100건)를 넘지 않게
  lastLogin = Date.now();
  const r = await call('POST', '/api/auth/login', { email, password: PASSWORD });
  if (r.status === 200) token = r.json.data.token;
  return r.status === 200;
}
assert.ok(await login(), '로그인 실패');
const rooms = [];
for (const hotel of (await call('GET', '/api/hotels?limit=12&guests=2')).json.data?.hotels ?? []) {
  const r = await call('GET', `/api/hotels/${hotel.id}`);
  rooms.push(...(r.json.data?.rooms ?? []).filter((x) => x.capacity >= 2 && x.is_available).map((x) => x.id));
  if (rooms.length >= 20) break;
}
assert.ok(rooms.length > 0, '예약할 객실을 못 찾음');
appendFileSync(out, `# run=${run} start=${now.toISOString()} base=${base} rooms=${rooms.length}\n`);
console.log(`드릴 손님 ${email}, 객실 ${rooms.length}개, 기록 ${out}`);

// 순번마다 다른 객실 · 날짜(400일 뒤부터, k6 · 표지 손님 날짜와 안 겹치게)라 409는 원래 없어야 함
const isoDate = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 1;
async function writeLoop() {
  for (;;) {
    const t = Date.now();
    const day = 400 + Math.floor(seq / rooms.length);
    const r = await call('POST', '/api/bookings',
      { room_id: rooms[seq % rooms.length], check_in_date: isoDate(day), check_out_date: isoDate(day + 1), guests: 2, special_requests: `drill ${run} #${seq}` },
      { Authorization: `Bearer ${token}`, 'Idempotency-Key': `drill-${run}-${seq}` });
    log('write', seq, r, r.json.data?.id);
    if (r.status === 401) await login(); // 토큰 만료 · 다른 리전 DB에 계정이 없을 때 → 같은 순번 다시
    else if (r.status !== 0 && r.status < 500) seq++; // 201 · 200(재전송) · 409는 다음 순번, 응답 없음 · 5xx는 같은 순번 다시
    await sleep(Math.max(0, WRITE_MS - (Date.now() - t)));
  }
}
async function readLoop() {
  for (;;) {
    const t = Date.now();
    log('read', '-', await call('GET', '/api/hotels?limit=12&guests=2'));
    await sleep(Math.max(0, READ_MS - (Date.now() - t)));
  }
}
await Promise.all([writeLoop(), readLoop()]);
