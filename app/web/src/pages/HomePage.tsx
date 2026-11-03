import { Gift, MapPin, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useApi, type Coupon, type Hotel } from '../api';
import { HotelCard } from '../components/HotelCard';
import { SearchForm, stayParams } from '../components/SearchForm';
import { ErrorBox, Loading } from '../components/ui';
import { defaultStay, formatCountdown } from '../format';
import { useNow } from '../hooks';

export function HomePage() {
  const stay = useMemo(() => defaultStay(), []);
  const featured = useApi<Hotel[]>('/hotels/featured');
  const cities = useApi<{ city: string; count: number }[]>('/hotels/cities');
  const coupons = useApi<Coupon[]>('/coupons');
  // 수량이 정해진 선착순 이벤트를 먼저, 없으면 오픈 예정 쿠폰을 배너로 보여 준다
  const event =
    coupons.data?.find((c) => c.status === 'open' && c.quantity <= 1000) ?? coupons.data?.find((c) => c.status === 'upcoming');
  const initial = { city: '', checkIn: stay.checkIn, checkOut: stay.checkOut, guests: 2 };
  const stayQuery = stayParams(initial).toString();

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-900 text-white">
        <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="absolute -bottom-32 left-10 size-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-10 md:pb-28 md:pt-16">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
            <Sparkles size={14} aria-hidden /> 호텔부터 한옥, 글램핑까지
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight md:text-5xl">어디로 떠나볼까요?</h1>
          <p className="mt-3 max-w-xl text-teal-50/90">국내 숙소를 비교하고 바로 예약하세요. 선착순 쿠폰으로 더 저렴하게.</p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-16 max-w-6xl px-4">
        <SearchForm initial={initial} cities={cities.data?.map((c) => c.city) ?? []} />
      </div>

      <div className="mx-auto max-w-6xl space-y-12 px-4 pt-10">
        {event && <CouponBanner coupon={event} />}

        {cities.data && cities.data.length > 0 && (
          <section aria-labelledby="regions-title">
            <h2 id="regions-title" className="mb-4 text-xl font-extrabold">
              인기 여행지
            </h2>
            <div className="flex flex-wrap gap-2">
              {cities.data.map(({ city, count }) => (
                <Link key={city} to={`/search?${stayParams({ ...initial, city })}`} className="chip">
                  <MapPin size={14} className="text-teal-600" aria-hidden /> {city}
                  <span className="text-slate-400">{count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="featured-title">
          <h2 id="featured-title" className="mb-4 text-xl font-extrabold">
            지금 인기 있는 숙소
          </h2>
          {featured.loading && !featured.data && <Loading />}
          {featured.error && <ErrorBox message={featured.error} onRetry={featured.reload} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.data?.map((hotel) => (
              <HotelCard key={hotel.id} hotel={hotel} query={stayQuery} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function CouponBanner({ coupon }: { coupon: Coupon }) {
  const now = useNow();
  const upcoming = coupon.status === 'upcoming';
  const issuedPercent = Math.round(((coupon.quantity - coupon.remaining) / coupon.quantity) * 100);
  return (
    <Link
      to="/coupons"
      className="block overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 p-5 text-white shadow-lg transition hover:shadow-xl md:p-6"
    >
      <div className="flex items-center gap-4">
        <Gift size={40} className="shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white/90">
            {upcoming
              ? `오픈까지 ${formatCountdown(Date.parse(coupon.starts_at) - now)}`
              : `선착순 이벤트 · 남은 수량 ${coupon.remaining}/${coupon.quantity}`}
          </p>
          <p className="truncate text-xl font-extrabold md:text-2xl">{coupon.name}</p>
        </div>
        <span className="ml-auto hidden shrink-0 rounded-full bg-white/20 px-4 py-2 font-bold sm:inline">
          {upcoming ? '미리 보기' : '받으러 가기'} →
        </span>
      </div>
      {!upcoming && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/25" aria-hidden>
          <div className="h-full rounded-full bg-white" style={{ width: `${issuedPercent}%` }} />
        </div>
      )}
    </Link>
  );
}
