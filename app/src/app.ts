import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { authRouter } from './auth';
import { bookingRouter } from './booking';
import { couponRouter } from './coupon';
import { pool } from './db';
import { HttpError } from './errors';
import { hotelRouter } from './hotel';
import { reviewRouter } from './review';
import { getServedBy } from './served-by';

export const app = express();
const publicDir = path.join(__dirname, '../../public'); // dist/src 기준으로 app/public (React 빌드 결과)

app.use(express.json({ limit: '10kb' }));
app.use('/api', (_req, res, next) => {
  res.set('X-Served-By', getServedBy());
  next();
});

// ALB 헬스체크용: DB가 잠깐 끊겨도 모든 태스크가 빠지지 않도록 DB는 확인하지 않는다
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 외부 모니터링용: DB 연결까지 확인한다
app.get('/api/health/deep', async (_req, res) => {
  await pool.query({ sql: 'SELECT 1', timeout: 2000 });
  res.json({ status: 'ok', db: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/hotels', hotelRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/coupons', couponRouter);
app.use('/api/reviews', reviewRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: '없는 API입니다.' });
});

// 화면 파일(HTML·CSS·JS)도 같은 컨테이너에서 내보낸다 (ADR-013)
app.use(express.static(publicDir));
// /hotels/:id 같은 화면 주소로 바로 들어와도 React 화면이 뜨도록 나머지 GET은 index.html로 보낸다
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }
  const { code, status } = err as { code?: string; status?: number };
  // 같은 객실·날짜를 동시에 넣다가 InnoDB가 한쪽을 되돌린 경우
  if (code === 'ER_LOCK_DEADLOCK') {
    res.status(409).json({ success: false, message: '동시에 들어온 요청과 충돌했습니다. 다시 시도해주세요.' });
    return;
  }
  // 잘못된 JSON, 너무 큰 본문 등 express.json이 거절한 요청
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ success: false, message: '잘못된 요청입니다.' });
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
});
