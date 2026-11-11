import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, useApi, withRetry, type HotelDetail, type MyCoupon } from '../api';
import { useAuth } from '../auth';
import { DateRangeField } from '../components/DateRangeField';
import { GuestsField } from '../components/GuestsField';
import { HotelImage } from '../components/HotelCard';
import { ErrorBox, Loading, LoginRequired, PageTitle } from '../components/ui';
import { defaultStay, nightsBetween, priceBreakdown, won } from '../format';
import { useToast } from '../toast';

export function BookingPage() {
  const { user, openAuth } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fallback = useMemo(() => defaultStay(), []);
  const hotelId = params.get('hotel') ?? '';
  const roomId = params.get('room') ?? '';
  const checkIn = params.get('check_in') ?? fallback.checkIn;
  const checkOut = params.get('check_out') ?? fallback.checkOut;
  const guests = Number(params.get('guests')) || 2;

  const hotel = useApi<HotelDetail>(hotelId ? `/hotels/${hotelId}` : null);
  const myCoupons = useApi<MyCoupon[]>(user ? '/coupons/mine' : null);
  const [couponId, setCouponId] = useState('');
  const [requests, setRequests] = useState('');
  const [busy, setBusy] = useState(false);
  // 입력이 같으면 같은 멱등키: 버튼을 여러 번 눌러도 예약은 한 건만 생긴다
  // crypto.randomUUID는 HTTPS·localhost(보안 컨텍스트)에서만 있어 1단계 HTTP에서 화면이 멈췄다. getRandomValues는 HTTP에서도 된다
  const idempotencyKey = useMemo(
    () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''),
    [roomId, checkIn, checkOut, guests, couponId],
  );

  if (!user) return <LoginRequired onLogin={openAuth} message="로그인하면 예약하고 쿠폰을 쓸 수 있어요." />;
  if (hotel.loading && !hotel.data) return <Loading />;
  const room = hotel.data?.rooms.find((r) => r.id === roomId);
  if (hotel.error || !hotel.data || !room) {
    return (
      <div className="mx-auto max-w-5xl px-4">
        <ErrorBox message={hotel.error ?? '객실 정보를 찾을 수 없습니다.'} />
      </div>
    );
  }

  const h = hotel.data;
  const nights = nightsBetween(checkIn, checkOut);
  const available = myCoupons.data?.filter((c) => c.status === 'available') ?? [];
  const selected = available.find((c) => c.id === couponId);
  const { subtotal, coupon, total } = priceBreakdown(room.discounted_price, nights, selected?.discount_amount ?? 0);
  const original = Number(room.price_per_night) * nights;

  const setStay = (patch: Record<string, string>) =>
    setParams({ hotel: hotelId, room: roomId, check_in: checkIn, check_out: checkOut, guests: String(guests), ...patch }, { replace: true });

  async function submit() {
    setBusy(true);
    try {
      await withRetry(() =>
        api('/bookings', {
          method: 'POST',
          idempotencyKey,
          body: {
            room_id: roomId,
            check_in_date: checkIn,
            check_out_date: checkOut,
            guests,
            special_requests: requests.trim() || undefined,
            user_coupon_id: couponId || undefined,
          },
        }),
      );
      toast('예약이 완료되었습니다!', 'success');
      navigate('/me/bookings');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6">
      <PageTitle sub="숙박 일정과 결제 금액을 확인해 주세요">예약하기</PageTitle>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="card flex gap-4 p-4">
            <div className="size-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              <HotelImage src={room.images[0] ?? h.images[0]} />
            </div>
            <div className="min-w-0">
              <Link to={`/hotels/${h.id}`} className="font-bold hover:underline">
                {h.name}
              </Link>
              <p className="text-sm text-slate-600">{room.name}</p>
              <p className="mt-1 text-xs text-slate-500">{h.address}</p>
              <p className="mt-1 text-xs text-slate-500">
                체크인 {h.check_in_time} · 체크아웃 {h.check_out_time}
              </p>
            </div>
          </section>

          <section className="card space-y-2 p-4">
            <h2 className="font-bold">숙박 일정</h2>
            <div className="field-box">
              <DateRangeField checkIn={checkIn} checkOut={checkOut} onChange={(ci, co) => setStay({ check_in: ci, check_out: co })} />
            </div>
            <div className="field-box">
              <GuestsField value={Math.min(guests, room.capacity)} max={room.capacity} onChange={(g) => setStay({ guests: String(g) })} />
            </div>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-bold">쿠폰</h2>
            <fieldset className="space-y-2">
              <legend className="sr-only">쿠폰 선택</legend>
              {[{ id: '', name: '사용 안 함', discount_amount: 0 }, ...available].map((c) => (
                <label
                  key={c.id || 'none'}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    couponId === c.id ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="coupon"
                    checked={couponId === c.id}
                    onChange={() => setCouponId(c.id)}
                    className="size-4 accent-teal-600"
                  />
                  <span className="font-medium">{c.name}</span>
                  {c.discount_amount > 0 && <span className="ml-auto font-bold text-orange-600">-{won(c.discount_amount)}</span>}
                </label>
              ))}
            </fieldset>
            {myCoupons.data && available.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">
                사용할 수 있는 쿠폰이 없어요.{' '}
                <Link to="/coupons" className="font-semibold text-teal-700 hover:underline">
                  쿠폰 받으러 가기
                </Link>
              </p>
            )}
          </section>

          <section className="card p-4">
            <label htmlFor="requests" className="mb-2 block font-bold">
              요청 사항 <span className="text-sm font-normal text-slate-400">(선택)</span>
            </label>
            <textarea
              id="requests"
              value={requests}
              onChange={(e) => setRequests(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="예: 늦게 도착할 예정입니다."
              className="input resize-none"
            />
          </section>
        </div>

        <aside>
          <div className="card sticky top-20 space-y-3 p-5">
            <h2 className="font-bold">결제 금액</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">
                  객실 요금 ({won(room.price_per_night)} × {nights}박)
                </dt>
                <dd>{won(original)}</dd>
              </div>
              {original > subtotal && (
                <div className="flex justify-between text-orange-600">
                  <dt>객실 할인</dt>
                  <dd>-{won(original - subtotal)}</dd>
                </div>
              )}
              {coupon > 0 && (
                <div className="flex justify-between text-orange-600">
                  <dt>쿠폰 할인</dt>
                  <dd>-{won(coupon)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-extrabold">
                <dt>총 결제 금액</dt>
                <dd>{won(total)}</dd>
              </div>
            </dl>
            <button type="button" disabled={busy || nights < 1} onClick={submit} className="btn-primary w-full">
              {busy ? '예약하는 중…' : `${won(total)} 예약하기`}
            </button>
            <p className="text-center text-xs text-slate-500">
              체크인 24시간 전까지 무료로 변경·취소할 수 있어요.
              <br />
              시연 서비스라 실제 결제는 이뤄지지 않아요.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
