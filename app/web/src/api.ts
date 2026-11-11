import { useCallback, useEffect, useState } from 'react';

export type Category = 'hotel' | 'motel' | 'pension' | 'guesthouse' | 'resort' | 'camping';

export interface Hotel {
  id: string;
  name: string;
  description: string;
  category: Category;
  address: string;
  city: string;
  region: string;
  amenities: string[];
  images: string[];
  rating: string;
  review_count: number;
  min_price?: string | null;
  check_in_time: string;
  check_out_time: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  type: string;
  capacity: number;
  price_per_night: string;
  discount_rate: string;
  images: string[];
  amenities: string[];
  is_available: boolean;
  discounted_price: number;
}

export interface HotelDetail extends Hotel {
  rooms: Room[];
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface Review {
  id: string;
  rating: number;
  title: string;
  content: string;
  created_at: string;
  author: string;
}

export interface Booking {
  id: string;
  room_id: string;
  check_in_date: string;
  check_out_date: string;
  guests: number;
  total_price: string;
  discount_amount: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  special_requests: string | null;
  room_name: string;
  room_type: string;
  hotel_id: string;
  hotel_name: string;
  hotel_address: string;
  hotel_images: string[];
  check_in_time: string;
  review_id: string | null;
  can_review: boolean;
}

export interface Coupon {
  id: string;
  name: string;
  discount_amount: number;
  quantity: number;
  remaining: number;
  status: 'open' | 'upcoming' | 'sold_out';
  starts_at: string;
  ends_at: string;
  expires_at: string;
}

export interface MyCoupon {
  id: string;
  coupon_id: string;
  name: string;
  discount_amount: number;
  expires_at: string;
  status: 'available' | 'used' | 'expired';
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

// 시간 초과(503) · 게이트웨이 오류 · 연결 실패는 "실패"가 아니라 "결과를 모름"이다. 서버가 이미 저장했을 수 있다
// (1.5단계: 부하 중 실패로 받았는데 저장된 예약). 같은 멱등키로 다시 보내면 서버가 이미 만든 예약을 돌려주므로,
// 이런 경우에만 잠깐 쉬고 다시 보낸다. 409(이미 예약된 날짜) 같은 확실한 거절은 다시 보내지 않는다
export async function withRetry<T>(send: () => Promise<T>, waitsMs = [1000, 2000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (err) {
      const unknown = !(err instanceof ApiError) || [502, 503, 504].includes(err.status);
      if (!unknown || attempt >= waitsMs.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, waitsMs[attempt]));
    }
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

// 응답한 서버(리전/AZ/태스크). 장애·리전 전환 시연 때 화면 하단 배지로 보여 준다
let servedBy = '';
const servedByListeners = new Set<() => void>();
export const servedByStore = {
  subscribe(listener: () => void) {
    servedByListeners.add(listener);
    return () => servedByListeners.delete(listener);
  },
  get: () => servedBy,
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
}

export async function api<T>(path: string, { method = 'GET', body, idempotencyKey }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

  const server = res.headers.get('X-Served-By');
  if (server && server !== servedBy) {
    servedBy = server;
    servedByListeners.forEach((listener) => listener());
  }

  const json = await res.json().catch(() => ({}));
  // 로그인이 만료됐거나 더 이상 유효하지 않으면 남은 로그인 정보를 지운다
  if (res.status === 401 && authToken) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, json.message ?? '요청을 처리하지 못했습니다.');
  return json.data as T;
}

// GET 요청 결과를 상태로 들고 있는다. path가 null이면 요청하지 않는다 (예: 로그인 전)
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: path !== null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    api<T>(path).then(
      (data) => {
        if (alive) setState({ data, loading: false });
      },
      (err: Error) => {
        if (alive) setState({ error: err.message, loading: false });
      },
    );
    return () => {
      alive = false;
    };
  }, [path, version]);

  // 주기적으로 다시 받을 때 타이머가 매번 새로 걸리지 않도록 함수를 고정한다
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
