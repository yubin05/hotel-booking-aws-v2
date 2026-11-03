import { format, parseISO } from 'date-fns';
import { Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useApi, type Coupon, type MyCoupon } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Loading, PageTitle } from '../components/ui';
import { formatCountdown, won } from '../format';
import { useNow } from '../hooks';
import { useToast } from '../toast';

const MY_STATUS: Record<MyCoupon['status'], [string, string]> = {
  available: ['사용 가능', 'bg-teal-50 text-teal-700'],
  used: ['사용함', 'bg-slate-100 text-slate-500'],
  expired: ['기한 지남', 'bg-slate-100 text-slate-400'],
};

export function CouponsPage() {
  const { user, openAuth } = useAuth();
  const toast = useToast();
  const coupons = useApi<Coupon[]>('/coupons');
  const mine = useApi<MyCoupon[]>(user ? '/coupons/mine' : null);
  const now = useNow();
  const [claiming, setClaiming] = useState('');

  // 선착순 남은 수량이 줄어드는 것이 보이도록 5초마다 다시 받는다
  const reloadCoupons = coupons.reload;
  useEffect(() => {
    const timer = setInterval(reloadCoupons, 5000);
    return () => clearInterval(timer);
  }, [reloadCoupons]);

  const claimed = new Set(mine.data?.map((c) => c.coupon_id));

  async function claim(coupon: Coupon) {
    if (!user) {
      openAuth();
      return;
    }
    setClaiming(coupon.id);
    try {
      await api(`/coupons/${coupon.id}/claim`, { method: 'POST' });
      toast(`'${coupon.name}' 쿠폰을 받았어요!`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setClaiming('');
      coupons.reload();
      mine.reload();
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6">
      <PageTitle sub="선착순 쿠폰은 수량이 다 떨어지면 받을 수 없어요. 한 사람에 한 장씩이에요.">쿠폰</PageTitle>

      {coupons.loading && !coupons.data && <Loading />}
      {coupons.error && <ErrorBox message={coupons.error} onRetry={coupons.reload} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {coupons.data?.map((coupon) => (
          <CouponCard
            key={coupon.id}
            coupon={coupon}
            now={now}
            claimed={claimed.has(coupon.id)}
            busy={claiming === coupon.id}
            onClaim={() => claim(coupon)}
          />
        ))}
      </div>

      {user && (
        <section className="mt-10" aria-labelledby="my-coupons-title">
          <h2 id="my-coupons-title" className="mb-3 text-lg font-extrabold">
            내 쿠폰함
          </h2>
          {mine.data?.length === 0 && <p className="text-slate-500">아직 받은 쿠폰이 없어요.</p>}
          {mine.data && mine.data.length > 0 && (
            <ul className="card divide-y divide-slate-100">
              {mine.data.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <Ticket size={20} className="shrink-0 text-orange-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-slate-500">{format(parseISO(c.expires_at), 'yyyy.M.d')}까지</p>
                  </div>
                  <span className="ml-auto shrink-0 font-bold">{won(c.discount_amount)}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${MY_STATUS[c.status][1]}`}>
                    {MY_STATUS[c.status][0]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function CouponCard(props: { coupon: Coupon; now: number; claimed: boolean; busy: boolean; onClaim: () => void }) {
  const { coupon, now } = props;
  const upcoming = coupon.status === 'upcoming';
  const soldOut = coupon.status === 'sold_out' || coupon.remaining <= 0;
  const limited = coupon.quantity <= 1000; // 수량이 넉넉한 상시 쿠폰은 남은 수량을 보여 주지 않는다
  const issuedPercent = Math.round(((coupon.quantity - coupon.remaining) / coupon.quantity) * 100);

  return (
    <article className="card flex overflow-hidden">
      <div className="flex w-28 shrink-0 flex-col items-center justify-center bg-gradient-to-br from-orange-500 to-rose-500 p-3 text-center text-white">
        <span className="text-xs font-semibold opacity-90">할인</span>
        <span className="text-lg font-extrabold leading-tight">{won(coupon.discount_amount)}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <h3 className="font-bold">{coupon.name}</h3>
        <p className="text-xs text-slate-500">사용 기한 {format(parseISO(coupon.expires_at), 'yyyy.M.d')}까지</p>
        {limited && !upcoming && (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${issuedPercent}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              남은 수량 <strong className="text-orange-600">{coupon.remaining}</strong> / {coupon.quantity}
            </p>
          </div>
        )}
        <div className="mt-auto pt-1">
          {props.claimed ? (
            <p className="text-center text-sm font-semibold text-teal-700">받은 쿠폰이에요</p>
          ) : upcoming ? (
            <p className="rounded-xl bg-slate-100 py-2 text-center text-sm font-semibold text-slate-600">
              오픈까지 {formatCountdown(Date.parse(coupon.starts_at) - now)}
            </p>
          ) : (
            <button type="button" className="btn-primary w-full py-2 text-sm" disabled={soldOut || props.busy} onClick={props.onClaim}>
              {soldOut ? '모두 소진' : props.busy ? '받는 중…' : '쿠폰 받기'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
