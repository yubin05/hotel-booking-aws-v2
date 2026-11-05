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

// 외부 모니터링용: DB 연결까지 확인한다. 시간 상한은 db.ts가 건다
// (쿼리 timeout은 빈 연결을 기다리는 시간에는 안 걸리고, 시간이 지나도 멈춘 연결을 풀에 돌려놓는다: TS-09)
app.get('/api/health/deep', async (_req, res) => {
  await pool.query('SELECT 1');
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
// 캐시: 이름에 해시가 붙은 빌드 파일(assets/)은 내용이 바뀌면 이름도 바뀌므로 1년 보관하고,
// 그 이름을 알려 주는 index.html은 매번 확인하게 한다. 지정하지 않으면 Express 기본값 max-age=0이라 CloudFront가 1초만 보관한다
const NO_CACHE = 'no-cache';
app.use(
  express.static(publicDir, {
    setHeaders: (res, file) =>
      res.setHeader('Cache-Control', path.basename(path.dirname(file)) === 'assets' ? 'public, max-age=31536000, immutable' : NO_CACHE),
  }),
);
// /hotels/:id 같은 화면 주소로 바로 들어와도 React 화면이 뜨도록 나머지 GET은 index.html로 보낸다
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  res.setHeader('Cache-Control', NO_CACHE);
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
