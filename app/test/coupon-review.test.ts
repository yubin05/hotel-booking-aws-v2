import { book, call, ctx, newUser, pool, randomDays, useServer } from './helpers';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

useServer();

async function createCoupon(quantity: number, { startsInMinutes = -1, amount = 5000 } = {}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO coupons (id, name, discount_amount, quantity, starts_at, ends_at, expires_at)
     VALUES (?, '테스트 쿠폰', ?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE,
             UTC_TIMESTAMP() + INTERVAL 1 DAY, UTC_TIMESTAMP() + INTERVAL 2 DAY)`,
    [id, amount, quantity, startsInMinutes],
  );
  return id;
}

const claim = (token: string, couponId: string) => call('POST', `/coupons/${couponId}/claim`, { token });

// 지난 숙박은 API로 만들 수 없으니 DB에 직접 넣는다
async function pastBooking(token: string): Promise<string> {
  const userId = String((jwt.decode(token) as jwt.JwtPayload).sub);
  const id = randomUUID();
  await pool.query(
    `INSERT INTO bookings (id, user_id, room_id, check_in_date, check_out_date, guests, total_price, idempotency_key)
     VALUES (?, ?, ?, '2025-01-01', '2025-01-02', 1, 10000, ?)`,
    [id, userId, ctx.roomId, id],
  );
  return id;
}

async function assertHotelRatingMatchesReviews(): Promise<number> {
  const hotel = (await call('GET', `/hotels/${ctx.hotelId}`)).body.data;
  const [[expected]] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS n, ROUND(AVG(rating), 1) AS avg FROM reviews WHERE hotel_id = ?',
    [ctx.hotelId],
  );
  assert.equal(hotel.review_count, expected.n);
  assert.equal(Number(hotel.rating), Number(expected.avg));
  return hotel.review_count;
}

test('선착순: 30명이 동시에 수량 10장 쿠폰을 받으면 정확히 10장만 발급된다', async () => {
  const couponId = await createCoupon(10);
  const tokens = await Promise.all(Array.from({ length: 30 }, () => newUser()));
  const statuses = (await Promise.all(tokens.map((token) => claim(token, couponId)))).map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 201).length, 10, `응답: ${statuses}`);
  assert.equal(statuses.filter((s) => s === 409).length, 20, `응답: ${statuses}`);

  const [[row]] = await pool.query<RowDataPacket[]>(
    'SELECT issued_count, (SELECT COUNT(*) FROM user_coupons WHERE coupon_id = ?) AS owners FROM coupons WHERE id = ?',
    [couponId, couponId],
  );
  assert.equal(row.issued_count, 10);
  assert.equal(row.owners, 10);
});

// 발급 요청들이 쿠폰 행 잠금 앞에 줄을 다 설 때까지 기다린다. 정해진 시간만 기다리면 느린 CI에서 요청이 덜 도착한 채
// 조회가 먼저 연결을 잡아, 발급이 공용 연결을 다 쥐는 버그가 있어도 통과할 수 있다.
// 잠금을 기다리는 발급 쿼리가 2건(발급 전용 연결 수) 이상이고 0.2초 동안 그대로면 다 선 것으로 본다.
// 잠금을 쥔 연결로 묻는다: 공용 연결이 다 차 있어도 막히지 않는다. 쿠폰 id로 거르는 이유: 다른 테스트 파일이 같은 DB에서 동시에 돈다
async function waitForQueuedClaims(conn: PoolConnection, couponId: string): Promise<void> {
  let last = -1;
  let same = 0;
  for (let i = 0; i < 250; i++) {
    const [rows] = await conn.query<RowDataPacket[]>('SHOW FULL PROCESSLIST');
    const waiting = rows.filter((r) => String(r.Info ?? '').startsWith('UPDATE coupons') && r.Info.includes(couponId)).length;
    same = waiting === last ? same + 1 : 0;
    last = waiting;
    if (waiting >= 2 && same >= 10) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`발급 요청이 쿠폰 행 잠금 앞에 줄을 서지 않는다 (기다리는 발급 ${last}건)`);
}

// TS-08: 발급 요청이 쿠폰 행 잠금을 기다리며 DB 연결을 모두 쥐면 쿠폰과 무관한 조회까지 멈췄다
test('쿠폰 발급이 잠금 앞에 줄 서 있어도 숙소 조회는 바로 응답한다', async () => {
  const couponId = await createCoupon(100);
  const tokens = await Promise.all(Array.from({ length: 20 }, () => newUser()));
  // 다른 연결이 쿠폰 행을 잠가 두면, 발급 요청들이 오픈 순간처럼 잠금 앞에 줄을 선다
  const locker = await pool.getConnection();
  await locker.beginTransaction();
  await locker.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [couponId]);
  const claims = Promise.all(tokens.map((token) => claim(token, couponId)));
  await waitForQueuedClaims(locker, couponId);
  const read = await Promise.race([
    call('GET', `/hotels/${ctx.hotelId}`),
    new Promise<null>((resolve) => setTimeout(resolve, 2000, null)),
  ]);
  await locker.rollback();
  locker.release();
  assert.equal(read?.status, 200, '잠금을 기다리는 발급 요청 때문에 조회가 2초 안에 응답하지 못했다');
  const statuses = (await claims).map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 201).length, 20, `응답: ${statuses}`);
});

test('같은 사용자가 동시에 5번 받아도 1장만 발급된다', async () => {
  const token = await newUser();
  const couponId = await createCoupon(100);
  const statuses = (await Promise.all(Array.from({ length: 5 }, () => claim(token, couponId)))).map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 201).length, 1, `응답: ${statuses}`);
  assert.equal(statuses.filter((s) => s === 409).length, 4, `응답: ${statuses}`);
});

test('발급 시작 전 쿠폰은 받을 수 없고 목록에는 오픈 예정으로 보인다', async () => {
  const couponId = await createCoupon(10, { startsInMinutes: 60 });
  assert.equal((await claim(await newUser(), couponId)).status, 400);
  const coupons = (await call('GET', '/coupons')).body.data;
  assert.equal(coupons.find((c: { id: string }) => c.id === couponId).status, 'upcoming');
});

test('쿠폰을 예약에 쓰면 할인되고, 다시 쓸 수 없으며, 예약을 취소하면 돌려받는다', async () => {
  const token = await newUser();
  const userCouponId = (await claim(token, await createCoupon(100, { amount: 5000 }))).body.data.id;
  const day = randomDays();

  const used = await book(token, day(0), day(2), { user_coupon_id: userCouponId });
  assert.equal(used.status, 201);
  assert.equal(used.body.data.discount_amount, 5000);
  assert.equal((await book(token, day(5), day(6), { user_coupon_id: userCouponId })).status, 409, '같은 쿠폰 재사용');

  assert.equal((await call('DELETE', `/bookings/${used.body.data.id}`, { token })).status, 200);
  const mine = (await call('GET', '/coupons/mine', { token })).body.data;
  assert.equal(mine.find((c: { id: string }) => c.id === userCouponId).status, 'available');
});

test('남의 쿠폰은 예약에 쓸 수 없다', async () => {
  const userCouponId = (await claim(await newUser(), await createCoupon(100))).body.data.id;
  const day = randomDays();
  assert.equal((await book(await newUser(), day(0), day(1), { user_coupon_id: userCouponId })).status, 400);
});

test('체크아웃 전 예약에는 리뷰를 쓸 수 없다', async () => {
  const token = await newUser();
  const day = randomDays();
  const created = await book(token, day(0), day(1));
  const body = { booking_id: created.body.data.id, rating: 5, title: '좋아요', content: '아직 묵지 않았지만 써 봅니다.' };
  assert.equal((await call('POST', '/reviews', { token, body })).status, 400);
});

test('체크아웃한 예약에 리뷰를 쓰면 숙소 평점·리뷰 수에 반영되고, 같은 예약에는 두 번 못 쓴다', async () => {
  const token = await newUser();
  const bookingId = await pastBooking(token);
  const listed = (await call('GET', '/bookings', { token })).body.data.bookings[0];
  assert.equal(listed.can_review, true);

  const before = await assertHotelRatingMatchesReviews();
  const body = { booking_id: bookingId, rating: 5, title: '테스트 리뷰', content: '테스트로 작성한 리뷰 내용입니다.' };
  assert.equal((await call('POST', '/reviews', { token, body })).status, 201);
  assert.equal((await call('POST', '/reviews', { token, body })).status, 409);
  assert.equal(await assertHotelRatingMatchesReviews(), before + 1);

  const reviews = (await call('GET', `/reviews?hotel_id=${ctx.hotelId}&limit=50`)).body.data.reviews;
  assert.ok(reviews.some((r: { title: string; author: string }) => r.title === '테스트 리뷰' && r.author === '테*트'));
});

test('같은 숙소에 리뷰 5개가 동시에 저장돼도 모두 성공하고 평점 집계가 맞다', async () => {
  const before = await assertHotelRatingMatchesReviews();
  const writers = await Promise.all(
    Array.from({ length: 5 }, async () => {
      const token = await newUser();
      return { token, bookingId: await pastBooking(token) };
    }),
  );
  const statuses = (
    await Promise.all(
      writers.map(({ token, bookingId }) =>
        call('POST', '/reviews', {
          token,
          body: { booking_id: bookingId, rating: 4, title: '동시 리뷰', content: '동시에 저장되는 리뷰입니다.' },
        }),
      ),
    )
  ).map((r) => r.status);
  assert.deepEqual(statuses, [201, 201, 201, 201, 201]);
  assert.equal(await assertHotelRatingMatchesReviews(), before + 5);
});
