import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { config } from './config';
import { HttpError } from './errors';

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

// DB 작업 하나(빈 연결 기다리기 + 쿼리)의 시간 상한 (TS-09). DB가 답하지 않을 때(멈춤·장애 조치) 요청이 끝없이 매달리지 않게 한다.
// 평소 DB 작업은 수십 ms이고, 쿠폰 오픈 쏠림(E-03)에서 가장 오래 기다린 발급도 1.3초다
const DB_TIMEOUT_MS = 3000;

// mysql2는 빈 연결을 기다리는 시간에 제한이 없고, 쿼리 timeout은 promise만 실패시킬 뿐 연결을 닫지 않아
// 멈춘 연결이 풀로 돌아가 다음 요청도 그 뒤에 줄을 선다. 그래서 시간이 다 되면 직접 실패시키고 쥐고 있던 연결은 버린다
// (destroy: 풀에서 빠지고 더 이상 명령을 보내지 않아, 응답한 뒤에 확정(커밋)되는 일을 막는다. 이미 보낸 COMMIT은 막지 못한다)
async function limited<T>(from: Pool, work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  let conn: PoolConnection | undefined;
  let expired = false;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      conn?.destroy();
      reject(new HttpError(503, '지금은 처리할 수 없습니다. 잠시 후 다시 시도해주세요.'));
    }, DB_TIMEOUT_MS);
  });
  const run = (async () => {
    const c = await from.getConnection();
    if (expired) {
      c.release(); // 시간이 다 된 뒤에 받은 연결은 쓰지 않고 돌려준다
      return undefined as T;
    }
    conn = c;
    try {
      return await work(c);
    } finally {
      if (!expired) c.release();
    }
  })();
  run.catch(() => {}); // 시간이 다 된 뒤의 결과·오류는 이미 503으로 응답했으므로 버린다
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// pool.query도 같은 상한을 받게 한다 (호출하는 곳을 하나하나 고치지 않는다)
function limitQueries(p: Pool): Pool {
  p.query = ((sql: string, values?: Parameters<PoolConnection['query']>[1]) => limited(p, (c) => c.query(sql, values))) as Pool['query'];
  return p;
}

export const pool = limitQueries(mysql.createPool({ ...options, connectionLimit: 10 }));

// 쿠폰 발급 전용 (TS-08). 발급은 쿠폰 한 행의 잠금 때문에 어차피 한 건씩 처리되어 연결을 늘려도 빨라지지 않는다.
// 공용 연결을 쓰면 오픈 순간 잠금을 기다리는 요청이 10개를 모두 쥐어 쿠폰과 무관한 조회까지 멈춘다
export const couponPool = limitQueries(mysql.createPool({ ...options, connectionLimit: 2 }));

export function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>, from: Pool = pool): Promise<T> {
  return limited(from, async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  });
}

export function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// 참조하는 행이 없다 (예: DB 초기화·백업 복원 이전에 받은 토큰의 사용자)
export function isMissingReference(err: unknown): boolean {
  return (err as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2';
}
