import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import { config } from '../config';
import { isDuplicateKey, pool } from '../db';
import { HttpError } from '../errors';
import { uuidv7 } from '../uuidv7';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// OWASP 권장과 같은 강도의 scrypt 설정(N=2^15, r=8, p=3). 해시 1번에 메모리 약 32MiB
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptKey(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptKey(password, Buffer.from(salt, 'base64'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function issueToken(user: { id: string; email: string; role: string }): string {
  return jwt.sign({ email: user.email, role: user.role }, config.jwtSecret, {
    subject: user.id,
    expiresIn: '1h',
    algorithm: 'HS256',
  });
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, '인증 토큰이 필요합니다.');
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    req.user = { userId: String(payload.sub), email: String(payload.email), role: String(payload.role) };
  } catch {
    throw new HttpError(401, '유효하지 않거나 만료된 토큰입니다.');
  }
  next();
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { email, password, name, phone } = req.body ?? {};
  if (typeof email !== 'string' || email.length > 255 || !EMAIL.test(email)) {
    throw new HttpError(400, '올바른 이메일을 입력해주세요.');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpError(400, '비밀번호는 8자 이상 128자 이하여야 합니다.');
  }
  if (typeof name !== 'string' || !name.trim() || name.length > 100) {
    throw new HttpError(400, '이름을 입력해주세요.');
  }
  if (phone != null && (typeof phone !== 'string' || phone.length > 20)) {
    throw new HttpError(400, '전화번호 형식이 올바르지 않습니다.');
  }

  const user = { id: uuidv7(), email: email.toLowerCase(), name: name.trim(), role: 'user' };
  try {
    await pool.query(
      'INSERT INTO users (id, email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, user.email, await hashPassword(password), user.name, phone ?? null, user.role],
    );
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, '이미 사용 중인 이메일입니다.');
    throw err;
  }
  res.status(201).json({ success: true, message: '회원가입이 완료되었습니다.', data: { token: issueToken(user), user } });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, '이메일과 비밀번호를 입력해주세요.');
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, email, name, role, password_hash FROM users WHERE email = ?',
    [email.toLowerCase()],
  );
  const found = rows[0];
  if (!found || !(await verifyPassword(password, found.password_hash))) {
    throw new HttpError(401, '이메일 또는 비밀번호가 잘못되었습니다.');
  }
  const user = { id: found.id, email: found.email, name: found.name, role: found.role };
  res.json({ success: true, message: '로그인 성공', data: { token: issueToken(user), user } });
});

authRouter.get('/profile', authenticate, async (req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, email, name, phone, role, created_at FROM users WHERE id = ?',
    [req.user!.userId],
  );
  if (!rows[0]) throw new HttpError(404, '사용자를 찾을 수 없습니다.');
  res.json({ success: true, data: rows[0] });
});
