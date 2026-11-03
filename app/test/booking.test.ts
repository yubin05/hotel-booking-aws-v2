import './env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { changeDeadline } from '../src/booking';
import { pool } from '../src/db';

// 실제 MySQL이 필요하다: docker compose up -d db

let server: Server;
let base: string;
let roomId: string;

interface CallOptions {
  token?: string;
  key?: string;
  body?: unknown;
}

async function call(method: string, path: string, { token, key, body }: CallOptions = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers['idempotency-key'] = key;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

async function newUser(): Promise<string> {
  const res = await call('POST', '/auth/register', {
    body: { email: `t-${randomUUID()}@test.local`, password: 'password123', name: '테스트' },
  });
  assert.equal(res.status, 201);
  return res.body.data.token;
}

// 테스트끼리, 그리고 반복 실행끼리 날짜가 겹치지 않도록 먼 미래의 임의 날짜를 기준으로 쓴다
function randomDays(): (offset: number) => string {
  const start = Date.UTC(2100 + Math.floor(Math.random() * 800), 0, 1) + Math.floor(Math.random() * 300) * 86_400_000;
  return (offset) => new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
}

function book(token: string, checkIn: string, checkOut: string) {
  return call('POST', '/bookings', {
    token,
    key: randomUUID(),
    body: { room_id: roomId, check_in_date: checkIn, check_out_date: checkOut, guests: 1 },
  });
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const list = await call('GET', '/hotels?limit=1');
  const hotel = await call('GET', `/hotels/${list.body.data.hotels[0].id}`);
  roomId = hotel.body.data.rooms[0].id;
});

after(async () => {
  server.close();
  await pool.end();
});

test('화면 파일과 홈 화면의 추천 숙소를 내보낸다', async () => {
  const page = await fetch(base.replace('/api', '/'));
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
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
  const res = await call('POST', '/bookings', {
    token,
    key: randomUUID(),
    body: { room_id: roomId, check_in_date: day(0), check_out_date: day(1), guests: 1 },
  });
  assert.equal(res.status, 401);
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
  const request = { token, key: randomUUID(), body: { room_id: roomId, check_in_date: day(0), check_out_date: day(1), guests: 1 } };
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

test('변경·취소 마감은 숙소 체크인 시각(한국 시간)의 24시간 전이다', () => {
  // 12/20 15:00 체크인 → 12/19 15:00 KST까지 (UTC 0시 기준이면 6시간 이르게 막혔다)
  assert.equal(changeDeadline('2026-12-20', '15:00'), Date.parse('2026-12-19T15:00:00+09:00'));
  assert.equal(changeDeadline('2026-12-20', '14:00'), Date.parse('2026-12-19T14:00:00+09:00'));
  assert.equal(changeDeadline('2026-12-20', '잘못된값'), Date.parse('2026-12-19T15:00:00+09:00'));
});

test('잘못된 입력은 400으로 거절한다', async () => {
  const token = await newUser();
  const day = randomDays();
  const body = { room_id: roomId, check_in_date: day(0), check_out_date: day(1), guests: 1 };
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
