import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../db';
import { HttpError } from '../errors';

const ORDER_BY: Record<string, string> = {
  price_asc: 'min_price ASC',
  price_desc: 'min_price DESC',
  rating: 'h.rating DESC',
  popular: 'h.review_count DESC, h.rating DESC',
};

// DECIMAL은 문자열로 오므로 숫자로 바꿔 할인가를 계산한다 (원 단위 소수 둘째 자리까지)
export function nightlyPrice(room: { price_per_night: string | number; discount_rate: string | number }): number {
  return Math.round(Number(room.price_per_night) * (100 - Number(room.discount_rate))) / 100;
}

function toHotel(row: RowDataPacket) {
  return { ...row, is_active: Boolean(row.is_active) };
}

function toRoom(row: RowDataPacket) {
  const discounted_price = nightlyPrice({ price_per_night: row.price_per_night, discount_rate: row.discount_rate });
  return { ...row, is_available: Boolean(row.is_available), discounted_price };
}

// 예약 모듈이 HTTP 대신 직접 호출한다 (v1의 /internal/hotels/:id/rooms/:id 대체)
export async function findBookableRoom(conn: PoolConnection, roomId: string) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT r.id, r.capacity, r.price_per_night, r.discount_rate
       FROM rooms r JOIN hotels h ON h.id = r.hotel_id
      WHERE r.id = ? AND r.is_available = 1 AND h.is_active = 1`,
    [roomId],
  );
  return rows[0] as { id: string; capacity: number; price_per_night: string; discount_rate: string } | undefined;
}

export const hotelRouter = Router();

hotelRouter.get(['/', '/search'], async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(q.limit) || 10));

  const where = ['h.is_active = 1'];
  const having: string[] = [];
  const params: (string | number | string[])[] = [];
  // 여러 값은 쉼표로 받는다: category=hotel,resort / amenities=수영장,스파
  const list = (value?: string) => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean).slice(0, 10);
  if (q.city) { where.push('h.city LIKE ?'); params.push(`%${q.city}%`); }
  if (q.region) { where.push('h.region LIKE ?'); params.push(`%${q.region}%`); }
  const categories = list(q.category);
  if (categories.length) { where.push('h.category IN (?)'); params.push(categories); }
  // 고른 편의시설을 모두 갖춘 숙소만 (v1은 화면에 체크박스만 있고 서버에서 거르지 않았다)
  for (const amenity of list(q.amenities)) {
    where.push('JSON_CONTAINS(h.amenities, JSON_QUOTE(?))');
    params.push(amenity);
  }
  if (q.guests) {
    where.push('h.id IN (SELECT hotel_id FROM rooms WHERE capacity >= ? AND is_available = 1)');
    params.push(Number(q.guests));
  }
  if (q.min_price) { having.push('min_price >= ?'); params.push(Number(q.min_price)); }
  if (q.max_price) { having.push('min_price <= ?'); params.push(Number(q.max_price)); }

  const base = `
    SELECT h.*, MIN(r.price_per_night * (1 - r.discount_rate / 100)) AS min_price
      FROM hotels h LEFT JOIN rooms r ON r.hotel_id = h.id AND r.is_available = 1
     WHERE ${where.join(' AND ')}
     GROUP BY h.id
     ${having.length ? `HAVING ${having.join(' AND ')}` : ''}`;
  const order = ORDER_BY[q.sort_by ?? ''] ?? ORDER_BY.popular;

  const [rows] = await pool.query<RowDataPacket[]>(`${base} ORDER BY ${order} LIMIT ? OFFSET ?`, [
    ...params,
    limit,
    (page - 1) * limit,
  ]);
  // 목록과 같은 조건으로 개수를 센다 (v1은 인원·가격 조건을 빼고 세서 페이지 수가 틀렸다)
  const [[{ total }]] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM (${base}) t`, params);

  res.json({
    success: true,
    data: {
      hotels: rows.map(toHotel),
      pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
    },
  });
});

// 검색창 자동 완성과 홈 화면 지역 칩: 숙소가 있는 도시와 숙소 수
hotelRouter.get('/cities', async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT city, COUNT(*) AS count FROM hotels WHERE is_active = 1 GROUP BY city ORDER BY count DESC, city',
  );
  res.json({ success: true, data: rows });
});

// 홈 화면의 추천 숙소: 평점순 8개 (v1과 같은 기준)
hotelRouter.get('/featured', async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT h.*, MIN(r.price_per_night * (1 - r.discount_rate / 100)) AS min_price
      FROM hotels h LEFT JOIN rooms r ON r.hotel_id = h.id AND r.is_available = 1
     WHERE h.is_active = 1
     GROUP BY h.id
     ORDER BY h.rating DESC, h.review_count DESC
     LIMIT 8`);
  res.json({ success: true, data: rows.map(toHotel) });
});

hotelRouter.get('/:id', async (req, res) => {
  const [hotels] = await pool.query<RowDataPacket[]>('SELECT * FROM hotels WHERE id = ? AND is_active = 1', [
    req.params.id,
  ]);
  if (!hotels[0]) throw new HttpError(404, '숙소를 찾을 수 없습니다.');
  const [rooms] = await pool.query<RowDataPacket[]>('SELECT * FROM rooms WHERE hotel_id = ?', [req.params.id]);
  res.json({ success: true, data: { ...toHotel(hotels[0]), rooms: rooms.map(toRoom) } });
});

hotelRouter.get('/:hotelId/rooms/:roomId', async (req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM rooms WHERE id = ? AND hotel_id = ?', [
    req.params.roomId,
    req.params.hotelId,
  ]);
  if (!rows[0]) throw new HttpError(404, '객실을 찾을 수 없습니다.');
  res.json({ success: true, data: toRoom(rows[0]) });
});
