import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ctx, useServer } from './helpers';

// 화면 빌드(app/web의 npm run build)가 app/public에 있어야 한다. CI는 앱 테스트 전에 빌드한다
useServer();

test('화면 파일 캐시: 해시가 붙은 빌드 파일은 1년, index.html은 매번 확인한다 (ADR-013)', async () => {
  const origin = ctx.base.replace(/\/api$/, '');
  const index = await fetch(`${origin}/`);
  assert.equal(index.headers.get('cache-control'), 'no-cache');
  const asset = (await index.text()).match(/\/assets\/[^"]+\.js/)?.[0];
  assert.ok(asset, 'index.html에 빌드 JS가 없다 (app/web을 먼저 빌드해야 한다)');
  assert.equal((await fetch(origin + asset)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  // 화면 주소로 바로 들어온 경우도 index.html이라 매번 확인
  assert.equal((await fetch(`${origin}/hotels/abc`)).headers.get('cache-control'), 'no-cache');
});
