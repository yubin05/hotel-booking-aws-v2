import { Clock, MapPin, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useApi, type HotelDetail, type Pagination, type Review, type Room } from '../api';
import { AmenityIcon } from '../components/AmenityIcon';
import { DateRangeField } from '../components/DateRangeField';
import { GuestsField } from '../components/GuestsField';
import { HotelImage } from '../components/HotelCard';
import { ErrorBox, Loading, RatingBadge, Stars } from '../components/ui';
import { CATEGORY_LABEL, defaultStay, nightsBetween, won } from '../format';

export function HotelPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const fallback = useMemo(() => defaultStay(), []);
  const checkIn = params.get('check_in') ?? fallback.checkIn;
  const checkOut = params.get('check_out') ?? fallback.checkOut;
  const guests = Number(params.get('guests')) || 2;
  const nights = nightsBetween(checkIn, checkOut);

  const hotel = useApi<HotelDetail>(`/hotels/${id}`);
  const [reviewLimit, setReviewLimit] = useState(3);
  const reviews = useApi<{ reviews: Review[]; pagination: Pagination }>(`/reviews?hotel_id=${id}&limit=${reviewLimit}`);

  // 날짜·인원은 주소에 남겨 새로고침하거나 공유해도 유지되게 한다
  const setStay = (patch: Record<string, string>) =>
    setParams({ check_in: checkIn, check_out: checkOut, guests: String(guests), ...patch }, { replace: true });

  if (hotel.loading && !hotel.data) return <Loading />;
  if (hotel.error || !hotel.data) {
    return (
      <div className="mx-auto max-w-6xl px-4">
        <ErrorBox message={hotel.error ?? '숙소를 찾을 수 없습니다.'} />
      </div>
    );
  }
  const h = hotel.data;
  const minNightly = h.rooms.length ? Math.min(...h.rooms.map((r) => r.discounted_price)) : 0;

  function book(room: Room) {
    const query = new URLSearchParams({ hotel: h.id, room: room.id, check_in: checkIn, check_out: checkOut, guests: String(guests) });
    navigate(`/booking?${query}`);
  }

  const stayPicker = (
    <>
      <div className="field-box">
        <DateRangeField checkIn={checkIn} checkOut={checkOut} onChange={(ci, co) => setStay({ check_in: ci, check_out: co })} />
      </div>
      <div className="field-box">
        <GuestsField value={guests} onChange={(g) => setStay({ guests: String(g) })} />
      </div>
    </>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <Gallery images={h.images} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          <header>
            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">{CATEGORY_LABEL[h.category]}</span>
            <h1 className="mt-3 text-2xl font-extrabold md:text-3xl">{h.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <RatingBadge rating={Number(h.rating)} count={h.review_count} />
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} aria-hidden /> {h.address}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={14} aria-hidden /> 체크인 {h.check_in_time} · 체크아웃 {h.check_out_time}
              </span>
            </div>
            <p className="mt-4 leading-relaxed text-slate-700">{h.description}</p>
          </header>

          {h.amenities.length > 0 && (
            <section aria-labelledby="amenities-title">
              <h2 id="amenities-title" className="mb-3 text-lg font-extrabold">
                편의시설
              </h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {h.amenities.map((name) => (
                  <li key={name} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-slate-200/70">
                    <span className="text-teal-600">
                      <AmenityIcon name={name} />
                    </span>
                    {name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="rooms-title" id="rooms" className="scroll-mt-20">
            <h2 id="rooms-title" className="text-lg font-extrabold">
              객실 선택
            </h2>
            <p className="mb-3 text-sm text-slate-500">
              {nights}박 · {guests}명 기준 요금이에요
            </p>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:hidden">{stayPicker}</div>
            <div className="space-y-3">
              {h.rooms.map((room) => (
                <RoomCard key={room.id} room={room} nights={nights} guests={guests} onBook={() => book(room)} />
              ))}
            </div>
          </section>

          <section aria-labelledby="reviews-title">
            <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <h2 id="reviews-title" className="text-lg font-extrabold">
                리뷰
              </h2>
              {h.review_count > 0 && (
                <>
                  <span className="text-2xl font-extrabold leading-none">{Number(h.rating).toFixed(1)}</span>
                  <Stars value={Number(h.rating)} size={16} />
                  <span className="text-sm text-slate-500">{h.review_count}개</span>
                </>
              )}
            </div>
            {reviews.data?.reviews.length === 0 && <p className="text-slate-500">아직 리뷰가 없어요. 첫 리뷰를 남겨 주세요.</p>}
            <ul className="space-y-3">
              {reviews.data?.reviews.map((review) => (
                <ReviewItem key={review.id} review={review} />
              ))}
            </ul>
            {reviews.data && reviews.data.pagination.total > reviews.data.reviews.length && (
              <button type="button" className="btn-outline mt-4 w-full" onClick={() => setReviewLimit(50)}>
                리뷰 {reviews.data.pagination.total}개 모두 보기
              </button>
            )}
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="card sticky top-20 space-y-3 p-5">
            <p className="text-sm text-slate-500">1박 최저가</p>
            <p className="text-2xl font-extrabold">{won(minNightly)}~</p>
            {stayPicker}
            <a href="#rooms" className="btn-primary w-full">
              객실 선택하기
            </a>
            <p className="text-center text-xs text-slate-500">체크인 24시간 전까지 무료로 변경·취소할 수 있어요</p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div>
            <p className="text-xs text-slate-500">1박 최저가</p>
            <p className="text-lg font-extrabold">{won(minNightly)}~</p>
          </div>
          <a href="#rooms" className="btn-primary ml-auto px-6">
            객실 선택
          </a>
        </div>
      </div>
    </div>
  );
}

function Gallery({ images }: { images: string[] }) {
  const shown = images.slice(0, 5);
  if (shown.length <= 1) {
    return (
      <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100 md:aspect-[21/9]">
        <HotelImage src={shown[0]} />
      </div>
    );
  }
  return (
    <div className="grid h-64 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl md:h-96">
      <div className="col-span-4 row-span-2 bg-slate-100 sm:col-span-2">
        <HotelImage src={shown[0]} />
      </div>
      {shown.slice(1).map((src, i) => (
        <div key={`${src}-${i}`} className="hidden bg-slate-100 sm:block">
          <HotelImage src={src} />
        </div>
      ))}
    </div>
  );
}

function RoomCard({ room, nights, guests, onBook }: { room: Room; nights: number; guests: number; onBook: () => void }) {
  const discount = Math.round(Number(room.discount_rate));
  const tooMany = guests > room.capacity;
  return (
    <article className="card flex flex-col gap-4 overflow-hidden p-3 sm:flex-row">
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 sm:w-48 sm:shrink-0">
        <HotelImage src={room.images[0]} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-bold">{room.name}</h3>
        <p className="text-sm text-slate-500">{room.description}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600">
          <Users size={14} aria-hidden /> 최대 {room.capacity}명
        </p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
          <div>
            {discount > 0 && (
              <p className="text-sm">
                <span className="font-bold text-orange-600">{discount}%</span>{' '}
                <span className="text-slate-400 line-through">{won(room.price_per_night)}</span>
              </p>
            )}
            <p>
              <span className="text-xl font-extrabold">{won(room.discounted_price)}</span>
              <span className="text-sm text-slate-500"> / 1박</span>
            </p>
            <p className="text-xs text-slate-500">
              {nights}박 총 {won(room.discounted_price * nights)}
            </p>
          </div>
          <button type="button" onClick={onBook} disabled={tooMany || !room.is_available} className="btn-primary px-5">
            {tooMany ? `최대 ${room.capacity}명` : '예약하기'}
          </button>
        </div>
      </div>
    </article>
  );
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <li className="card p-4">
      <div className="flex items-center gap-2">
        <Stars value={review.rating} />
        <span className="text-sm font-semibold">{review.author}</span>
        <span className="ml-auto text-xs text-slate-400">{review.created_at.slice(0, 10)}</span>
      </div>
      <p className="mt-2 font-bold">{review.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{review.content}</p>
    </li>
  );
}
