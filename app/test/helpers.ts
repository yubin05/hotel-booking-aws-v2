import './env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before } from 'node:test';
import { listen } from '../src/app';
import { couponPool, pool } from '../src/db';

// 실제 MySQL이 필요하다: docker compose up -d db (테스트 전용 DB hotel_booking_test를 쓴다)
export { pool };

export const ctx = { base: '', hotelId: '', roomId: '' };

interface CallOptions {
  token?: string;
  key?: string;
  body?: unknown;
}

export async function call(method: string, path: string, { token, key, body }: CallOptions = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers['idempotency-key'] = key;
  const res = await fetch(ctx.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

// 테스트 파일마다 앱을 임의 포트로 띄우고, 첫 숙소의 첫 객실을 예약 대상으로 쓴다
export function useServer(): void {
  let server: Server;
  before(async () => {
    server = listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    ctx.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    ctx.hotelId = (await call('GET', '/hotels?limit=1')).body.data.hotels[0].id;
    ctx.roomId = (await call('GET', `/hotels/${ctx.hotelId}`)).body.data.rooms[0].id;
  });
  after(async () => {
    server.close();
    await Promise.all([pool.end(), couponPool.end()]);
  });
}

export async function newUser(): Promise<string> {
  const res = await call('POST', '/auth/register', {
    body: { email: `t-${randomUUID()}@test.local`, password: 'password123', name: '테스트' },
  });
  assert.equal(res.status, 201);
  return res.body.data.token;
}

// 테스트끼리, 그리고 반복 실행끼리 날짜가 겹치지 않도록 먼 미래의 임의 날짜를 기준으로 쓴다
export function randomDays(): (offset: number) => string {
  const start = Date.UTC(2100 + Math.floor(Math.random() * 800), 0, 1) + Math.floor(Math.random() * 300) * 86_400_000;
  return (offset) => new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
}

export function book(token: string, checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) {
  return call('POST', '/bookings', {
    token,
    key: randomUUID(),
    body: { room_id: ctx.roomId, check_in_date: checkIn, check_out_date: checkOut, guests: 1, ...extra },
  });
}
