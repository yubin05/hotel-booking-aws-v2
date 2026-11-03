import { describe, expect, it } from 'vitest';
import { changeDeadline, defaultStay, formatCountdown, nightsBetween, priceBreakdown, toYmd, won } from './format';

describe('format', () => {
  it('금액을 원 단위로 표시한다', () => {
    expect(won(1234567)).toBe('1,234,567원');
    expect(won('89000.00')).toBe('89,000원');
  });

  it('날짜는 현지 날짜 그대로 YYYY-MM-DD로 바꾼다 (UTC로 하루 밀리지 않는다)', () => {
    expect(toYmd(new Date(2026, 10, 20))).toBe('2026-11-20');
    expect(nightsBetween('2026-11-20', '2026-11-23')).toBe(3);
  });

  it('기본 숙박은 일주일 뒤 1박이다', () => {
    expect(defaultStay(new Date(2026, 10, 3))).toEqual({ checkIn: '2026-11-10', checkOut: '2026-11-11' });
  });

  it('변경·취소 마감은 서버와 같이 체크인 시각(한국 시간)의 24시간 전이다', () => {
    expect(changeDeadline('2026-12-20', '15:00').toISOString()).toBe('2026-12-19T06:00:00.000Z');
    expect(changeDeadline('2026-12-20', 'bad').toISOString()).toBe('2026-12-19T06:00:00.000Z');
  });

  it('쿠폰 할인은 숙박 금액을 넘지 않는다', () => {
    expect(priceBreakdown(80_000, 2, 20_000)).toEqual({ subtotal: 160_000, coupon: 20_000, total: 140_000 });
    expect(priceBreakdown(10_000, 1, 20_000)).toEqual({ subtotal: 10_000, coupon: 10_000, total: 0 });
  });

  it('남은 시간을 일·시:분:초로 보여 준다', () => {
    expect(formatCountdown(3_723_000)).toBe('01:02:03');
    expect(formatCountdown(90_061_000)).toBe('1일 01:01:01');
    expect(formatCountdown(0)).toBe('곧 시작');
  });
});
