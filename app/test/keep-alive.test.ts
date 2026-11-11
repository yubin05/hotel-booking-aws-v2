import { ctx, useServer } from './helpers';
import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';

useServer();

// 1.5단계: Node 기본(5초)이면 손님이 화면을 보는 사이 서버가 연결을 끊어, 다음 화면마다 새 연결을 맺었다.
// 옛날 구조에서는 그 새 연결들이 앱 서버의 연결 추적 표(conntrack)를 가득 채워 새 연결이 버려졌다
test('응답 뒤 8초 쉬어도 서버가 연결을 끊지 않아, 다음 요청이 같은 연결로 간다', { timeout: 20000 }, async () => {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  // 응답을 받은 연결의 손님 쪽 포트: 같은 연결이면 같은 포트다
  const get = () =>
    new Promise<number>((resolve, reject) => {
      http
        .get(`${ctx.base}/health`, { agent }, (res) => {
          const port = res.socket.localPort!;
          res.resume();
          res.on('end', () => resolve(port));
        })
        .on('error', reject);
    });
  try {
    const first = await get();
    // Node 기본이면 keepAliveTimeout 5초 + keepAliveTimeoutBuffer 1초 = 6초에 끊는다(Node 24 문서). 경계를 피해 8초 쉰다
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const second = await get();
    assert.equal(second, first, '서버가 쉬는 동안 연결을 끊었다면 새 연결(다른 포트)이 된다');
  } finally {
    agent.destroy();
  }
});
