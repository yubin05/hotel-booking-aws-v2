import './env';
import assert from 'node:assert/strict';
import net from 'node:net';
import { after, test } from 'node:test';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { config } from '../src/config';
import { couponPool, pool, SELECT_TIMEOUT_MS, withTransaction } from '../src/db';

// 앱의 연결 풀(src/db)을 썼으므로 닫아야 테스트 프로세스가 끝난다
after(() => Promise.all([pool.end(), couponPool.end()]));

// 1.5단계: 오래 걸리는 조회는 앱이 3초 뒤 연결을 끊기 전에 MySQL이 직접 끝내야 한다.
// 앱이 끊기만 하면 DB에서는 그 조회가 계속 돌았고(실행 중인 조회 > 연결 수), 앱은 새 연결을 맺느라 DB를 더 바쁘게 했다
test('오래 걸리는 조회는 MySQL이 2초에 직접 끊고(ERROR 3024) 연결은 그대로 다시 쓰며, 앱은 503으로 알린다', { timeout: 30000 }, async () => {
  const slow = 'WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 200000000) SELECT COUNT(*) AS n FROM s';
  const conn = await pool.getConnection();
  try {
    await conn.query('SET SESSION cte_max_recursion_depth = 200000000');
    const [[before]] = await conn.query<RowDataPacket[]>('SELECT CONNECTION_ID() AS id');
    const [[limit]] = await conn.query<RowDataPacket[]>('SELECT @@SESSION.max_execution_time AS ms');
    assert.equal(limit.ms, SELECT_TIMEOUT_MS, '새 연결마다 조회 시간 상한이 걸려 있어야 한다');
    // 이 조회는 앱의 3초 장치(limited)를 거치지 않으므로, ERROR 3024를 받았다는 것 자체가 MySQL이 끊었다는 뜻이다
    // (걸린 시간은 다른 테스트 파일이 동시에 DB를 쓰면 흔들려 검사하지 않는다)
    await assert.rejects(conn.query(slow), (err: { errno?: number }) => err.errno === 3024);
    const [[after]] = await conn.query<RowDataPacket[]>('SELECT CONNECTION_ID() AS id');
    assert.equal(after.id, before.id, '끊긴 건 조회뿐이고 연결은 그대로다');
  } finally {
    conn.release();
  }

  await assert.rejects(
    withTransaction(async (c) => {
      await c.query('SET SESSION cte_max_recursion_depth = 200000000');
      await c.query(slow);
    }),
    (err: { status?: number }) => err.status === 503,
  );
});

// 테스트 DB 앞에 두는 중계. freeze()하면 docker compose pause(E-04)처럼 연결은 열린 채 양쪽 데이터가 멈추고,
// thaw()하면 멈춘 동안 쌓인 데이터가 다시 흐른다
async function startRelay() {
  const sockets = new Set<net.Socket>();
  let frozen = false;
  const server = net.createServer((client) => {
    const db = net.connect(config.db.port, config.db.host);
    for (const [from, to] of [[client, db], [db, client]] as const) {
      sockets.add(from);
      from.on('data', (chunk) => to.write(chunk));
      from.on('close', () => {
        sockets.delete(from);
        to.destroy();
      });
      from.on('error', () => {}); // 끊김은 close에서 정리한다
      if (frozen) from.pause();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    freeze: () => {
      frozen = true;
      for (const s of sockets) s.pause();
    },
    thaw: () => {
      frozen = false;
      for (const s of sockets) s.resume();
    },
    close: () => {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}

// TS-09: DB가 답하지 않으면 요청이 DB가 돌아올 때까지 매달렸다 (E-04 멈춤 15초 동안 최대 15.3초)
test('DB가 답하지 않으면 연결을 쥔 요청과 빈 연결을 기다리는 요청 모두 3초 안에 503, 멈춘 연결은 다시 쓰지 않는다', { timeout: 20000 }, async () => {
  const relay = await startRelay();
  const stuck = mysql.createPool({
    host: '127.0.0.1',
    port: relay.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    connectionLimit: 1,
  });
  try {
    await withTransaction((c) => c.query('SELECT 1'), stuck); // 중계를 지나는 연결을 하나 만들어 둔다
    relay.freeze();
    const started = Date.now();
    const holding = withTransaction((c) => c.query('SELECT 1'), stuck); // 연결을 쥔 채 답을 기다림
    const queued = withTransaction((c) => c.query('SELECT 1'), stuck); // 연결이 1개뿐이라 빈 연결을 기다림
    await assert.rejects(holding, { status: 503 });
    await assert.rejects(queued, { status: 503 });
    assert.ok(Date.now() - started < 4500, `${Date.now() - started}ms 걸림`);

    relay.thaw();
    // 멈췄던 연결이 풀로 돌아갔다면 그 뒤에 줄을 서서 다시 503이 난다
    const [rows] = await withTransaction((c) => c.query('SELECT 1 AS ok'), stuck);
    assert.deepEqual(rows, [{ ok: 1 }]);
  } finally {
    relay.close();
    await stuck.end();
  }
});
