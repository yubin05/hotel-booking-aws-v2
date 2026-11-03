import { Link } from 'react-router';
import type { Hotel } from '../api';
import { CATEGORY_LABEL, FALLBACK_IMAGE, won } from '../format';
import { RatingBadge } from './ui';

export function HotelImage({ src, className = '' }: { src?: string; className?: string }) {
  return (
    <img
      src={src || FALLBACK_IMAGE}
      alt=""
      loading="lazy"
      onError={(e) => {
        if (e.currentTarget.src !== FALLBACK_IMAGE) e.currentTarget.src = FALLBACK_IMAGE;
      }}
      className={`size-full object-cover ${className}`}
    />
  );
}

// query: 상세 화면으로 날짜·인원을 넘기기 위한 검색 조건
export function HotelCard({ hotel, query, layout = 'grid' }: { hotel: Hotel; query?: string; layout?: 'grid' | 'row' }) {
  const minPrice = hotel.min_price ? Number(hotel.min_price) : 0;
  const row = layout === 'row';
  return (
    <Link
      to={`/hotels/${hotel.id}${query ? `?${query}` : ''}`}
      className={`group card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg ${row ? 'flex' : 'block'}`}
    >
      <div className={`relative shrink-0 overflow-hidden bg-slate-100 ${row ? 'w-32 sm:w-60' : 'aspect-[4/3]'}`}>
        <HotelImage src={hotel.images[0]} className="transition duration-500 group-hover:scale-105" />
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-700 backdrop-blur">
          {CATEGORY_LABEL[hotel.category] ?? hotel.category}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3.5">
        <p className="text-xs text-slate-500">
          {hotel.city} · {hotel.region}
        </p>
        <h3 className="line-clamp-1 font-bold text-slate-900">{hotel.name}</h3>
        <RatingBadge rating={Number(hotel.rating)} count={hotel.review_count} />
        {row && <p className="mt-1 line-clamp-2 hidden text-sm text-slate-500 sm:block">{hotel.description}</p>}
        <p className="mt-auto pt-2 text-right">
          <span className="text-lg font-extrabold">{minPrice ? won(minPrice) : '가격 문의'}</span>
          {minPrice > 0 && <span className="text-xs text-slate-500"> / 1박~</span>}
        </p>
      </div>
    </Link>
  );
}
