import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { authenticate } from '../auth';
import { isDuplicateKey, pool, withTransaction } from '../db';
import { HttpError } from '../errors';
import { kstToday } from '../time';
import { uuidv7 } from '../uuidv7';

// 작성자 이름 가운데를 가린다: 박지호 → 박*호, 김민 → 김*
function maskName(name: string): string {
  const chars = [...name];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

export const reviewRouter = Router();

reviewRouter.get('/', async (req, res) => {
  const hotelId = typeof req.query.hotel_id === 'string' ? req.query.hotel_id : '';
  if (!hotelId) throw new HttpError(400, 'hotel_id가 필요합니다.');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT rv.id, rv.rating, rv.title, rv.content, rv.created_at, u.name AS author
       FROM reviews rv JOIN users u ON u.id = rv.user_id
      WHERE rv.hotel_id = ?
      ORDER BY rv.created_at DESC, rv.id DESC
      LIMIT ? OFFSET ?`,
    [hotelId, limit, (page - 1) * limit],
  );
  const [[{ total }]] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM reviews WHERE hotel_id = ?', [
    hotelId,
  ]);
  res.json({
    success: true,
    data: {
      reviews: rows.map((r) => ({ ...r, author: maskName(r.author) })),
      pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
    },
  });
});

// 체크아웃을 마친 본인 예약에만, 예약당 한 번 쓸 수 있다
reviewRouter.post('/', authenticate, async (req, res) => {
  const { booking_id, rating, title, content } = req.body ?? {};
  if (typeof booking_id !== 'string') throw new HttpError(400, '예약을 선택해주세요.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, '별점은 1~5점이어야 합니다.');
  if (typeof title !== 'string' || !title.trim() || title.length > 100) {
    throw new HttpError(400, '제목은 1~100자로 입력해주세요.');
  }
  if (typeof content !== 'string' || content.trim().length < 10 || content.length > 1000) {
    throw new HttpError(400, '내용은 10~1000자로 입력해주세요.');
  }

  const id = uuidv7();
  await withTransaction(async (conn) => {
    // 잠금 읽기(FOR SHARE)로 읽어 일반 읽기의 스냅샷이 아래 숙소 잠금 뒤에 만들어지게 한다 (평점 집계가 최신 리뷰를 보도록)
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT b.status, b.check_out_date, r.hotel_id
         FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE b.id = ? AND b.user_id = ?
          FOR SHARE OF b`,
      [booking_id, req.user!.userId],
    );
    const booking = rows[0];
    if (!booking) throw new HttpError(404, '예약을 찾을 수 없습니다.');
    if (booking.status === 'cancelled') throw new HttpError(400, '취소한 예약에는 리뷰를 쓸 수 없습니다.');
    if (booking.check_out_date > kstToday()) throw new HttpError(400, '체크아웃한 뒤에 리뷰를 쓸 수 있습니다.');

    // 숙소 행을 먼저 잠근다: 리뷰 INSERT의 외래 키 검사(공유 잠금) 뒤에 평점 UPDATE(배타 잠금)를 하면
    // 같은 숙소의 동시 리뷰끼리 교착이 난다 (쿠폰 발급과 같은 문제)
    await conn.query('SELECT id FROM hotels WHERE id = ? FOR UPDATE', [booking.hotel_id]);
    try {
      await conn.query(
        'INSERT INTO reviews (id, booking_id, user_id, hotel_id, rating, title, content) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, booking_id, req.user!.userId, booking.hotel_id, rating, title.trim(), content.trim()],
      );
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, '이미 리뷰를 쓴 예약입니다.');
      throw err;
    }
    await conn.query(
      `UPDATE hotels
          SET review_count = (SELECT COUNT(*) FROM reviews WHERE hotel_id = ?),
              rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE hotel_id = ?), 0)
        WHERE id = ?`,
      [booking.hotel_id, booking.hotel_id, booking.hotel_id],
    );
  });
  res.status(201).json({ success: true, message: '리뷰를 등록했습니다.', data: { id } });
});
