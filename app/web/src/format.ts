import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

export const CATEGORY_LABEL: Record<string, string> = {
  hotel: '호텔',
  motel: '모텔',
  pension: '펜션',
  guesthouse: '게스트하우스',
  resort: '리조트',
  camping: '캠핑',
};

export const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#e2e8f0"/></svg>');

export function won(amount: number | string): string {
  return `${Math.round(Number(amount)).toLocaleString('ko-KR')}원`;
}

// 'YYYY-MM-DD'는 브라우저 현지 날짜로 다룬다 (toISOString은 UTC라 한국 시간 새벽에 하루가 밀린다)
export function toYmd(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function fromYmd(ymd: string): Date {
  return parseISO(ymd);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
}

export function shortDate(ymd: string): string {
  return format(parseISO(ymd), 'M.d (EEE)', { locale: ko });
}

// 기본 숙박 날짜: 일주일 뒤 1박 (내일로 잡으면 예약 직후부터 변경·취소 마감에 걸린다)
export function defaultStay(today = new Date()): { checkIn: string; checkOut: string } {
  const checkIn = addDays(today, 7);
  return { checkIn: toYmd(checkIn), checkOut: toYmd(addDays(checkIn, 1)) };
}

// 서버와 같은 규칙: 숙소 체크인 시각(한국 시간)의 24시간 전까지 변경·취소할 수 있다
export function changeDeadline(checkInDate: string, checkInTime: string): Date {
  const time = /^\d{2}:\d{2}$/.test(checkInTime) ? checkInTime : '15:00';
  return new Date(Date.parse(`${checkInDate}T${time}:00+09:00`) - 24 * 3_600_000);
}

// 쿠폰 할인은 숙박 금액을 넘지 않는다 (서버와 같은 규칙)
export function priceBreakdown(nightly: number, nights: number, couponAmount: number) {
  const subtotal = nightly * nights;
  const coupon = Math.min(couponAmount, subtotal);
  return { subtotal, coupon, total: subtotal - coupon };
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '곧 시작';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const clock = [Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return days > 0 ? `${days}일 ${clock}` : clock;
}
