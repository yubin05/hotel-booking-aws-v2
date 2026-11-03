import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uuidv7 } from '../src/uuidv7';

test('UUIDv7 형식과 버전·변형 비트', () => {
  assert.match(uuidv7(), /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('앞 48비트가 만든 시각(ms)이다', () => {
  const before = Date.now();
  const id = uuidv7();
  const ms = parseInt(id.replace(/-/g, '').slice(0, 12), 16);
  assert.ok(ms >= before && ms <= Date.now());
});

test('나중에 만든 ID가 문자열 정렬에서 뒤에 온다', async () => {
  const first = uuidv7();
  await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(uuidv7() > first);
});
