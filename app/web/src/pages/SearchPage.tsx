import { SearchX, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useApi, type Hotel, type Pagination } from '../api';
import { AmenityIcon } from '../components/AmenityIcon';
import { Dialog } from '../components/Dialog';
import { HotelCard } from '../components/HotelCard';
import { SearchForm, stayParams } from '../components/SearchForm';
import { EmptyState, ErrorBox, Loading } from '../components/ui';
import { CATEGORY_LABEL, defaultStay } from '../format';

const AMENITIES = ['수영장', '주차장', '와이파이', '조식포함', '스파', '바베큐', '바다뷰', '피트니스센터'];
const SORTS: [string, string][] = [
  ['popular', '인기순'],
  ['rating', '평점순'],
  ['price_asc', '낮은 가격순'],
  ['price_desc', '높은 가격순'],
];

type Patch = Record<string, string | undefined>;

const splitList = (value: string | null) => (value ? value.split(',').filter(Boolean) : []);
const toggled = (values: string[], value: string) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const fallback = useMemo(() => defaultStay(), []);
  const stay = {
    city: params.get('city') ?? '',
    checkIn: params.get('check_in') ?? fallback.checkIn,
    checkOut: params.get('check_out') ?? fallback.checkOut,
    guests: Number(params.get('guests')) || 2,
  };
  const page = Number(params.get('page')) || 1;

  const query = new URLSearchParams({ limit: '12', page: String(page), guests: String(stay.guests) });
  if (stay.city) query.set('city', stay.city);
  for (const key of ['category', 'amenities', 'min_price', 'max_price', 'sort_by']) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  const result = useApi<{ hotels: Hotel[]; pagination: Pagination }>(`/hotels?${query}`);
  const cities = useApi<{ city: string }[]>('/hotels/cities');
  const [filtersOpen, setFiltersOpen] = useState(false);

  function update(patch: Patch) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in patch)) next.delete('page'); // 조건이 바뀌면 첫 페이지부터
    setParams(next);
  }

  const activeFilters =
    splitList(params.get('category')).length +
    splitList(params.get('amenities')).length +
    (params.get('min_price') || params.get('max_price') ? 1 : 0);
  const stayQuery = stayParams(stay).toString();
  const pagination = result.data?.pagination;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <SearchForm initial={stay} cities={cities.data?.map((c) => c.city) ?? []} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="card sticky top-20 p-5">
            <h2 className="mb-4 font-bold">필터</h2>
            <Filters key={params.toString()} params={params} onApply={update} />
          </div>
        </aside>

        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="font-bold">
              {stay.city ? `‘${stay.city}’ ` : ''}숙소 {pagination ? `${pagination.total}곳` : ''}
            </h1>
            <button type="button" onClick={() => setFiltersOpen(true)} className="chip ml-auto lg:hidden">
              <SlidersHorizontal size={15} aria-hidden /> 필터{activeFilters ? ` ${activeFilters}` : ''}
            </button>
            <select
              aria-label="정렬"
              value={params.get('sort_by') ?? 'popular'}
              onChange={(e) => update({ sort_by: e.target.value === 'popular' ? undefined : e.target.value })}
              className="input w-auto py-2 text-sm lg:ml-auto"
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {result.loading && !result.data && <Loading />}
          {result.error && <ErrorBox message={result.error} onRetry={result.reload} />}
          {result.data && result.data.hotels.length === 0 && (
            <EmptyState icon={<SearchX size={26} />} title="조건에 맞는 숙소가 없어요">
              필터를 줄이거나 다른 지역을 검색해 보세요.
            </EmptyState>
          )}
          <div className={`grid gap-3 transition ${result.loading ? 'opacity-60' : ''}`}>
            {result.data?.hotels.map((hotel) => (
              <HotelCard key={hotel.id} hotel={hotel} query={stayQuery} layout="row" />
            ))}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3" aria-label="페이지">
              <button type="button" className="btn-outline" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                이전
              </button>
              <span className="text-sm text-slate-500">
                {page} / {pagination.total_pages}
              </span>
              <button
                type="button"
                className="btn-outline"
                disabled={page >= pagination.total_pages}
                onClick={() => update({ page: String(page + 1) })}
              >
                다음
              </button>
            </nav>
          )}
        </section>
      </div>

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="필터">
        <Filters
          key={params.toString()}
          params={params}
          onApply={(patch) => {
            update(patch);
            setFiltersOpen(false);
          }}
        />
      </Dialog>
    </div>
  );
}

function Filters({ params, onApply }: { params: URLSearchParams; onApply: (patch: Patch) => void }) {
  const [categories, setCategories] = useState(() => splitList(params.get('category')));
  const [amenities, setAmenities] = useState(() => splitList(params.get('amenities')));
  const [minPrice, setMinPrice] = useState(params.get('min_price') ?? '');
  const [maxPrice, setMaxPrice] = useState(params.get('max_price') ?? '');

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">숙소 유형</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={categories.includes(value)}
              onClick={() => setCategories(toggled(categories, value))}
              className={`chip ${categories.includes(value) ? 'chip-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          편의시설 <span className="font-normal text-slate-400">(모두 갖춘 곳)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={amenities.includes(name)}
              onClick={() => setAmenities(toggled(amenities, name))}
              className={`chip ${amenities.includes(name) ? 'chip-active' : ''}`}
            >
              <AmenityIcon name={name} size={14} /> {name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">1박 가격 (원)</legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            placeholder="최소"
            aria-label="최소 가격"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="input"
          />
          <span className="text-slate-400">~</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            placeholder="최대"
            aria-label="최대 가격"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="input"
          />
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-outline flex-1"
          onClick={() => onApply({ category: undefined, amenities: undefined, min_price: undefined, max_price: undefined })}
        >
          초기화
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={() =>
            onApply({
              category: categories.join(',') || undefined,
              amenities: amenities.join(',') || undefined,
              min_price: minPrice || undefined,
              max_price: maxPrice || undefined,
            })
          }
        >
          적용
        </button>
      </div>
    </div>
  );
}
