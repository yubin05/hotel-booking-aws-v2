import { book, call, ctx, newUser, pool, randomDays, useServer } from './helpers';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import { changeDeadline } from '../src/booking';

useServer();

test('화면 주소로 바로 들어와도 React 화면(index.html)을 내보낸다', async (t) => {
  // dist/test 기준 app/public. CI는 화면을 먼저 빌드하므로 항상 확인한다
  if (!existsSync(join(__dirname, '../../public/index.html'))) {
    t.skip('화면 빌드 결과가 없다: npm --prefix web run build');
    return;
  }
  for (const path of ['/', '/hotels/some-id', '/me/bookings']) {
    const page = await fetch(ctx.base.replace('/api', path));
    assert.equal(page.status, 200, path);
    assert.match(page.headers.get('content-type') ?? '', /text\/html/, path);
  }
  assert.equal((await fetch(`${ctx.base}/no-such-api`)).status, 404);
});

test('API 응답은 응답한 서버를 X-Served-By 헤더로 알리고, 지역 목록과 추천 숙소를 내보낸다', async () => {
  const res = await fetch(`${ctx.base}/health`);
  assert.match(res.headers.get('x-served-by') ?? '', /^local\//);
  const cities = await call('GET', '/hotels/cities');
  assert.ok(cities.body.data.some((c: { city: string }) => c.city === '제주'));
  const featured = await call('GET', '/hotels/featured');
  assert.equal(featured.status, 200);
  assert.ok(featured.body.data.length > 0);
  assert.match(featured.body.data[0].name, /[가-힣]/, '시드의 한글이 깨지지 않아야 한다');
});

test('편의시설은 고른 것을 모두 갖춘 숙소만, 숙소 유형은 고른 것 중 하나인 숙소를 찾는다', async () => {
  const all = (await call('GET', '/hotels?limit=50')).body.data.hotels;
  const picked = ['수영장', '조식포함'];
  const byAmenity = await call('GET', `/hotels?limit=50&amenities=${encodeURIComponent(picked.join(','))}`);
  const expected = all.filter((h: { amenities: string[] }) => picked.every((a) => h.amenities.includes(a)));
  assert.ok(expected.length < all.length, '필터가 실제로 걸러야 의미 있는 테스트다');
  assert.equal(byAmenity.body.data.pagination.total, expected.length);

  const categories = ['hotel', 'resort'];
  const byCategory = await call('GET', `/hotels?limit=50&category=${categories.join(',')}`);
  const expectedCategory = all.filter((h: { category: string }) => categories.includes(h.category));
  assert.equal(byCategory.body.data.pagination.total, expectedCategory.length);
});

test('회원가입 후 로그인하고, 틀린 비밀번호와 중복 이메일은 거절한다', async () => {
  const email = `t-${randomUUID()}@test.local`;
  assert.equal((await call('POST', '/auth/register', { body: { email, password: 'password123', name: '가' } })).status, 201);
  assert.equal((await call('POST', '/auth/register', { body: { email, password: 'password123', name: '가' } })).status, 409);
  const login = await call('POST', '/auth/login', { body: { email, password: 'password123' } });
  assert.equal(login.status, 200);
  assert.equal((await call('GET', '/auth/profile', { token: login.body.data.token })).body.data.email, email);
  assert.equal((await call('POST', '/auth/login', { body: { email, password: 'wrong-password' } })).status, 401);
});

test('토큰 없이 예약하면 401', async () => {
  assert.equal((await call('POST', '/bookings', { key: randomUUID(), body: {} })).status, 401);
});

test('지워진 사용자의 토큰으로 예약하면 서버 오류(500)가 아니라 401', async () => {
  const token = jwt.sign({ email: 'gone@test.local', role: 'user' }, process.env.JWT_SECRET!, {
    subject: randomUUID(),
    expiresIn: '1h',
  });
  const day = randomDays();
  assert.equal((await book(token, day(0), day(1))).status, 401);
});

test('같은 객실·날짜에 동시에 10건을 예약하면 1건만 성공한다', async () => {
  const token = await newUser();
  const day = randomDays();
  const results = await Promise.all(Array.from({ length: 10 }, () => book(token, day(0), day(2))));
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 201).length, 1, `응답: ${statuses}`);
  assert.equal(statuses.filter((s) => s === 409).length, 9, `응답: ${statuses}`);
});

test('같은 멱등키로 다시 보내면 새로 만들지 않고 처음 예약을 돌려준다', async () => {
  const token = await newUser();
  const day = randomDays();
  const request = {
    token,
    key: randomUUID(),
    body: { room_id: ctx.roomId, check_in_date: day(0), check_out_date: day(1), guests: 1 },
  };
  const first = await call('POST', '/bookings', request);
  const second = await call('POST', '/bookings', request);
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal((await call('GET', '/bookings', { token })).body.data.pagination.total, 1);
});

test('예약 변경: 다른 예약과 겹치면 거절하고, 비어 있으면 옮긴 뒤 이전 날짜를 풀어 준다', async () => {
  const token = await newUser();
  const day = randomDays();
  const a = await book(token, day(0), day(2));
  assert.equal((await book(token, day(5), day(7))).status, 201);

  const blocked = await call('PATCH', `/bookings/${a.body.data.id}`, {
    token,
    body: { check_in_date: day(5), check_out_date: day(6) },
  });
  assert.equal(blocked.status, 409);

  const moved = await call('PATCH', `/bookings/${a.body.data.id}`, {
    token,
    body: { check_in_date: day(2), check_out_date: day(4) },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.nights, 2);
  assert.equal((await book(await newUser(), day(0), day(2))).status, 201, '이전 날짜가 풀려야 한다');
});

test('취소하면 행은 남고 상태만 바뀌며, 같은 날짜를 다시 예약할 수 있다', async () => {
  const token = await newUser();
  const day = randomDays();
  const created = await book(token, day(0), day(3));
  assert.equal((await call('DELETE', `/bookings/${created.body.data.id}`, { token })).status, 200);
  assert.equal((await call('GET', `/bookings/${created.body.data.id}`, { token })).body.data.status, 'cancelled');
  assert.equal((await book(token, day(0), day(3))).status, 201);
});

// 같은 계정의 연결은 권한 없이 보인다. 날짜로 거르는 이유: 다른 테스트 파일이 같은 DB에서 동시에 돈다
async function waitForBlockedInserts(stayDate: string, count: number): Promise<void> {
  for (let i = 0; i < 250; i++) {
    const [rows] = await pool.query<RowDataPacket[]>('SHOW FULL PROCESSLIST');
    const waiting = rows.filter((r) => String(r.Info ?? '').startsWith('INSERT INTO booking_nights') && r.Info.includes(stayDate));
    if (waiting.length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`${stayDate} 예약 ${count}건이 취소의 잠금을 기다리지 않는다`);
}

// E-02 보강: 취소가 확정(커밋)되는 순간 그 날짜를 기다리던 예약들이 한꺼번에 풀려나면 서로 교착할 수 있다
// (중복 키 검사의 공유 잠금, MySQL 문서의 INSERT 잠금 예시). 진 쪽도 서버 오류가 아니라 409를 받아야 한다
test('취소가 확정되는 순간 같은 날짜를 기다리던 예약 2건은 1건 성공, 1건 409를 받는다', async () => {
  const day = randomDays();
  const created = await book(await newUser(), day(0), day(2));
  assert.equal(created.status, 201);
  const [b, c] = await Promise.all([newUser(), newUser()]);
  // 취소 API는 순식간에 끝나 끼어들 틈이 없으므로, 취소와 같은 쿼리를 직접 열어 둔 채 두 예약을 기다리게 한다
  const cancel = await pool.getConnection();
  try {
    await cancel.beginTransaction();
    await cancel.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [created.body.data.id]);
    await cancel.query('DELETE FROM booking_nights WHERE booking_id = ?', [created.body.data.id]);
    const racing = Promise.all([book(b, day(0), day(2)), book(c, day(0), day(2))]);
    await waitForBlockedInserts(day(0), 2);
    await cancel.commit();
    const statuses = (await racing).map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409]);
  } finally {
    await cancel.rollback(); // 중간에 실패해도 잠금을 남기지 않는다 (커밋한 뒤에는 아무 일도 안 한다)
    cancel.release();
  }
});

test('변경·취소 마감은 숙소 체크인 시각(한국 시간)의 24시간 전이다', () => {
  // 12/20 15:00 체크인 → 12/19 15:00 KST까지 (UTC 0시 기준이면 6시간 이르게 막혔다)
  assert.equal(changeDeadline('2026-12-20', '15:00'), Date.parse('2026-12-19T15:00:00+09:00'));
  assert.equal(changeDeadline('2026-12-20', '14:00'), Date.parse('2026-12-19T14:00:00+09:00'));
  assert.equal(changeDeadline('2026-12-20', '잘못된값'), Date.parse('2026-12-19T15:00:00+09:00'));
});

test('잘못된 입력은 400으로 거절한다', async () => {
  const token = await newUser();
  const day = randomDays();
  const body = { room_id: ctx.roomId, check_in_date: day(0), check_out_date: day(1), guests: 1 };
  assert.equal((await call('POST', '/bookings', { token, body })).status, 400, '멱등키 없음');
  const cases = [
    { ...body, check_out_date: day(0) }, // 체크아웃이 체크인과 같음
    { ...body, check_out_date: day(31) }, // 30박 초과
    { ...body, check_in_date: '2999-02-30', check_out_date: '2999-03-02' }, // 없는 날짜
    { ...body, guests: 0 },
  ];
  for (const bad of cases) {
    assert.equal((await call('POST', '/bookings', { token, key: randomUUID(), body: bad })).status, 400, JSON.stringify(bad));
  }
});
