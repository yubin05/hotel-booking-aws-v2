import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { config } from './config';

const options = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  timezone: '+00:00',
  dateStrings: true, // DATE를 'YYYY-MM-DD' 문자열로 받아 시간대 변환 오류를 피한다
  charset: 'utf8mb4',
};

export const pool = mysql.createPool({ ...options, connectionLimit: 10 });

// 쿠폰 발급 전용 (TS-08). 발급은 쿠폰 한 행의 잠금 때문에 어차피 한 건씩 처리되어 연결을 늘려도 빨라지지 않는다.
// 공용 연결을 쓰면 오픈 순간 잠금을 기다리는 요청이 10개를 모두 쥐어 쿠폰과 무관한 조회까지 멈춘다
export const couponPool = mysql.createPool({ ...options, connectionLimit: 2 });

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>, from: Pool = pool): Promise<T> {
  const conn = await from.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// 참조하는 행이 없다 (예: DB 초기화·백업 복원 이전에 받은 토큰의 사용자)
export function isMissingReference(err: unknown): boolean {
  return (err as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2';
}
