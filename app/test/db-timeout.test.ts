import './env';
import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { config } from '../src/config';
import { withTransaction } from '../src/db';

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
