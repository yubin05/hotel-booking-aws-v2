import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { authenticate } from '../auth';
import { isDuplicateKey, pool, withTransaction } from '../db';
import { HttpError } from '../errors';
import { findBookableRoom, nightlyPrice } from '../hotel';
import { uuidv7 } from '../uuidv7';

const DAY_MS = 86_400_000;
const MAX_NIGHTS = 30; // 한 요청이 만드는 날짜 행 수를 제한해 과도한 요청을 막는다
const CHANGE_DEADLINE_HOURS = 24;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// shortcut: 한국 숙소만 있다고 보고 날짜·시각을 KST(+09:00)로 계산한다. 해외 숙소가 생기면 숙소별 시간대를 저장한다
const KST_OFFSET_MS = 9 * 3_600_000;

function kstToday(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 변경·취소 마감: 숙소 체크인 시각(한국 시간)의 24시간 전. 시각 형식이 이상하면 15:00으로 본다
export function changeDeadline(checkInDate: string, checkInTime: string): number {
  const time = /^\d{2}:\d{2}$/.test(checkInTime) ? checkInTime : '15:00';
  return Date.parse(`${checkInDate}T${time}:00+09:00`) - CHANGE_DEADLINE_HOURS * 3_600_000;
}

const BOOKING_VIEW = `
  SELECT b.id, b.room_id, b.check_in_date, b.check_out_date, b.guests, b.total_price, b.status,
         b.special_requests, b.created_at, b.updated_at,
         r.name AS room_name, r.type AS room_type,
         h.id AS hotel_id, h.name AS hotel_name, h.address AS hotel_address, h.images AS hotel_images
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    JOIN hotels h ON h.id = r.hotel_id`;

interface LockedBooking {
  id: string;
  room_id: string;
  check_in_date: string;
  check_out_date: string;
  guests: number;
  status: string;
  check_in_time: string;
}

function toUtcMs(date: unknown): number {
  if (typeof date !== 'string' || !DATE.test(date)) throw new HttpError(400, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const ms = Date.parse(`${date}T00:00:00Z`);
  // 2030-02-30처럼 달력에 없는 날짜를 거른다
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, '존재하지 않는 날짜입니다.');
  }
  return ms;
}

// 체크인부터 체크아웃 전날까지, 숙박하는 날짜 목록
function stayNights(checkIn: unknown, checkOut: unknown): string[] {
  const start = toUtcMs(checkIn);
  const end = toUtcMs(checkOut);
  if (end <= start) throw new HttpError(400, '체크아웃 날짜는 체크인 날짜보다 나중이어야 합니다.');
  if (start < toUtcMs(kstToday())) {
    throw new HttpError(400, '체크인 날짜는 오늘 이후여야 합니다.');
  }
  const count = (end - start) / DAY_MS;
  if (count > MAX_NIGHTS) throw new HttpError(400, `최대 ${MAX_NIGHTS}박까지 예약할 수 있습니다.`);
  return Array.from({ length: count }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10));
}

function parseGuests(value: unknown, capacity: number): number {
  const guests = Number(value);
  if (!Number.isInteger(guests) || guests < 1) throw new HttpError(400, '인원은 1명 이상이어야 합니다.');
  if (guests > capacity) throw new HttpError(400, `해당 객실의 최대 수용 인원은 ${capacity}명입니다.`);
  return guests;
}

// 객실·날짜마다 한 행을 넣는다. 기본 키(room_id, stay_date)가 겹치면 DB가 거부하므로
// 동시에 요청이 몰려도 이중 예약이 생기지 않는다 (v1은 조회 후 저장이라 경쟁 상태가 있었다)
async function reserveNights(conn: PoolConnection, roomId: string, bookingId: string, nights: string[]) {
  try {
    await conn.query('INSERT INTO booking_nights (room_id, stay_date, booking_id) VALUES ?', [
      nights.map((night) => [roomId, night, bookingId]),
    ]);
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, '해당 날짜에 이미 예약이 있습니다.');
    throw err;
  }
}

async function lockOwnBooking(conn: PoolConnection, id: string, userId: string): Promise<LockedBooking> {
  // FOR UPDATE OF b: 예약 행만 잠근다 (객실·숙소 행까지 잠그면 같은 숙소의 취소가 줄을 선다)
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT b.id, b.room_id, b.check_in_date, b.check_out_date, b.guests, b.status, h.check_in_time
       FROM bookings b
       JOIN rooms r ON r.id = b.room_id
       JOIN hotels h ON h.id = r.hotel_id
      WHERE b.id = ? AND b.user_id = ?
        FOR UPDATE OF b`,
    [id, userId],
  );
  if (!rows[0]) throw new HttpError(404, '예약을 찾을 수 없습니다.');
  return rows[0] as LockedBooking;
}

function assertChangeable(booking: LockedBooking): void {
  if (booking.status !== 'confirmed') throw new HttpError(400, '확정된 예약만 변경하거나 취소할 수 있습니다.');
  if (Date.now() > changeDeadline(booking.check_in_date, booking.check_in_time)) {
    throw new HttpError(400, `체크인 ${CHANGE_DEADLINE_HOURS}시간 전부터는 변경하거나 취소할 수 없습니다.`);
  }
}

export const bookingRouter = Router();

bookingRouter.use(authenticate);

bookingRouter.post('/', async (req, res) => {
  const userId = req.user!.userId;
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 100) throw new HttpError(400, 'Idempotency-Key 헤더가 필요합니다.');
  const { room_id, check_in_date, check_out_date, guests, special_requests } = req.body ?? {};
  if (typeof room_id !== 'string') throw new HttpError(400, '객실을 선택해주세요.');
  if (special_requests != null && (typeof special_requests !== 'string' || special_requests.length > 1000)) {
    throw new HttpError(400, '요청 사항은 1000자 이하여야 합니다.');
  }
  const nights = stayNights(check_in_date, check_out_date);
  const id = uuidv7();

  const created = await withTransaction(async (conn) => {
    const room = await findBookableRoom(conn, room_id);
    if (!room) throw new HttpError(404, '객실을 찾을 수 없습니다.');
    const guestCount = parseGuests(guests, room.capacity);
    const totalPrice = nightlyPrice(room) * nights.length;
    try {
      await conn.query(
        `INSERT INTO bookings (id, user_id, room_id, check_in_date, check_out_date, guests, total_price,
                               special_requests, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, room_id, check_in_date, check_out_date, guestCount, totalPrice, special_requests ?? null, key],
      );
    } catch (err) {
      if (isDuplicateKey(err)) return null; // 같은 멱등키로 이미 만든 예약이 있다
      // 토큰은 유효하지만 사용자가 없다: DB 초기화나 백업 복원 이전에 받은 토큰
      if ((err as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2') {
        throw new HttpError(401, '로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.');
      }
      throw err;
    }
    await reserveNights(conn, room_id, id, nights);
    return { id, total_price: totalPrice, nights: nights.length, status: 'confirmed' };
  });

  if (created) {
    res.status(201).json({ success: true, message: '예약이 완료되었습니다.', data: created });
    return;
  }

  // shortcut: 같은 키로 내용이 다른 요청이 와도 처음 예약을 돌려준다. 요청 본문 비교는 필요해지면 추가
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, total_price, check_in_date, check_out_date, status
       FROM bookings WHERE user_id = ? AND idempotency_key = ?`,
    [userId, key],
  );
  const existing = rows[0];
  res.status(200).json({
    success: true,
    message: '이미 처리된 요청입니다.',
    data: {
      id: existing.id,
      total_price: Number(existing.total_price),
      nights: (toUtcMs(existing.check_out_date) - toUtcMs(existing.check_in_date)) / DAY_MS,
      status: existing.status,
    },
  });
});

bookingRouter.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const where = status ? 'WHERE b.user_id = ? AND b.status = ?' : 'WHERE b.user_id = ?';
  const params = status ? [req.user!.userId, status] : [req.user!.userId];

  // id가 UUIDv7이라 id 역순이 곧 최신순이다
  const [rows] = await pool.query<RowDataPacket[]>(`${BOOKING_VIEW} ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`, [
    ...params,
    limit,
    (page - 1) * limit,
  ]);
  const [[{ total }]] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM bookings b ${where}`, params);

  res.json({
    success: true,
    data: { bookings: rows, pagination: { total, page, limit, total_pages: Math.ceil(total / limit) } },
  });
});

bookingRouter.get('/:id', async (req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(`${BOOKING_VIEW} WHERE b.id = ? AND b.user_id = ?`, [
    req.params.id,
    req.user!.userId,
  ]);
  if (!rows[0]) throw new HttpError(404, '예약을 찾을 수 없습니다.');
  res.json({ success: true, data: rows[0] });
});

// 날짜·인원 변경: 기존 날짜 행을 지우고 새 날짜 행을 넣는다. 다른 예약과 겹치면 전체를 되돌린다
bookingRouter.patch('/:id', async (req, res) => {
  const data = await withTransaction(async (conn) => {
    const booking = await lockOwnBooking(conn, String(req.params.id), req.user!.userId);
    assertChangeable(booking);
    const checkIn = req.body?.check_in_date ?? booking.check_in_date;
    const checkOut = req.body?.check_out_date ?? booking.check_out_date;
    const nights = stayNights(checkIn, checkOut);
    const room = await findBookableRoom(conn, booking.room_id);
    if (!room) throw new HttpError(409, '이 객실은 더 이상 예약할 수 없습니다.');
    const guests = parseGuests(req.body?.guests ?? booking.guests, room.capacity);
    const totalPrice = nightlyPrice(room) * nights.length;

    await conn.query('DELETE FROM booking_nights WHERE booking_id = ?', [booking.id]);
    await reserveNights(conn, booking.room_id, booking.id, nights);
    await conn.query(
      'UPDATE bookings SET check_in_date = ?, check_out_date = ?, guests = ?, total_price = ? WHERE id = ?',
      [checkIn, checkOut, guests, totalPrice, booking.id],
    );
    return { id: booking.id, check_in_date: checkIn, check_out_date: checkOut, guests, total_price: totalPrice, nights: nights.length };
  });
  res.json({ success: true, message: '예약이 변경되었습니다.', data });
});

// v1 프론트와 맞추려고 DELETE를 쓰지만, 행은 지우지 않고 상태만 바꾼다 (변경분 대조용)
bookingRouter.delete('/:id', async (req, res) => {
  await withTransaction(async (conn) => {
    const booking = await lockOwnBooking(conn, String(req.params.id), req.user!.userId);
    assertChangeable(booking);
    await conn.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [booking.id]);
    await conn.query('DELETE FROM booking_nights WHERE booking_id = ?', [booking.id]);
  });
  res.json({ success: true, message: '예약이 취소되었습니다.' });
});
