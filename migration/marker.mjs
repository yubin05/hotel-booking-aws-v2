// 이관 표지 손님 (docs/experiments/migration.md 1절)
//   node migration/marker.mjs register <옛 주소> <이메일>  ③ 점검 직전 옛 사이트에 한글 이름으로 가입 (마지막 쓰기 · 한글이 옮겨졌는지 보는 표지)
//   node migration/marker.mjs book <새 주소> <이메일>      ⑩ 새 사이트에서 같은 계정으로 로그인 · 예약. 201이면 종료 코드 0 = 중단 끝
import assert from 'node:assert/strict';

const [cmd, base, email] = process.argv.slice(2);
assert.ok(['register', 'book'].includes(cmd) && base && email, '사용: node migration/marker.mjs register|book <주소> <이메일>');
const PASSWORD = 'migration-check-1'; // 시험용 계정 (k6 계정과 같은 취급)
const NAME = '이관 확인 손님';

async function call(method, path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(path === '/api/bookings' && { 'Idempotency-Key': `migration-${Date.now()}-${Math.random()}` }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

if (cmd === 'register') {
  const r = await call('POST', '/api/auth/register', { email, password: PASSWORD, name: NAME });
  console.log(`가입 ${r.status} ${email} (${NAME})`);
  process.exit(r.status === 201 ? 0 : 1);
}

const login = await call('POST', '/api/auth/login', { email, password: PASSWORD });
console.log(`로그인 ${login.status}`);
assert.equal(login.status, 200, '새 사이트에서 표지 손님 로그인 실패 (회원 데이터가 안 옮겨졌거나 app 계정 없음)');
const token = login.json.data.token;
const hotels = (await call('GET', '/api/hotels?limit=12&guests=2')).json.data.hotels;
const isoDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
// 같은 날짜가 이미 차 있으면 409라 다른 숙소 · 날짜로 몇 번 더
for (let i = 0; i < 5; i++) {
  const hotel = hotels[Math.floor(Math.random() * hotels.length)];
  const rooms = (await call('GET', `/api/hotels/${hotel.id}`)).json.data.rooms.filter((r) => r.capacity >= 2 && r.is_available);
  if (rooms.length === 0) continue;
  const start = 30 + Math.floor(Math.random() * 300);
  const r = await call('POST', '/api/bookings', { room_id: rooms[0].id, check_in_date: isoDate(start), check_out_date: isoDate(start + 1), guests: 2 }, token);
  console.log(`예약 ${r.status} ${hotel.name} ${isoDate(start)}`);
  if (r.status === 201) process.exit(0);
  if (r.status !== 409) process.exit(1);
}
process.exit(1);
