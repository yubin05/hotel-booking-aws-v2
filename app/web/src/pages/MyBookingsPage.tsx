import { format } from 'date-fns';
import { CalendarX, Star } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, useApi, type Booking, type Pagination } from '../api';
import { useAuth } from '../auth';
import { DateRangeField } from '../components/DateRangeField';
import { Dialog } from '../components/Dialog';
import { GuestsField } from '../components/GuestsField';
import { HotelImage } from '../components/HotelCard';
import { EmptyState, ErrorBox, Field, Loading, LoginRequired, PageTitle } from '../components/ui';
import { changeDeadline, nightsBetween, shortDate, toYmd, won } from '../format';
import { useToast } from '../toast';

type Tab = 'upcoming' | 'past' | 'cancelled';
const TABS: [Tab, string][] = [
  ['upcoming', '예정된 숙박'],
  ['past', '지난 숙박'],
  ['cancelled', '취소한 예약'],
];

function tabOf(booking: Booking, today: string): Tab {
  if (booking.status === 'cancelled') return 'cancelled';
  return booking.check_out_date <= today ? 'past' : 'upcoming';
}

export function MyBookingsPage() {
  const { user, openAuth } = useAuth();
  // shortcut: 최근 50건만 받는다. 예약이 많아지면 탭별로 서버에서 나눠 받는다
  const bookings = useApi<{ bookings: Booking[]; pagination: Pagination }>(user ? '/bookings?limit=50' : null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [changing, setChanging] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [reviewing, setReviewing] = useState<Booking | null>(null);

  if (!user) return <LoginRequired onLogin={openAuth} message="로그인하면 예약 내역을 볼 수 있어요." />;
  const today = toYmd(new Date());
  const list = bookings.data?.bookings.filter((b) => tabOf(b, today) === tab) ?? [];
  const done = () => {
    setChanging(null);
    setCancelling(null);
    setReviewing(null);
    bookings.reload();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6">
      <PageTitle>내 예약</PageTitle>
      <div role="tablist" aria-label="예약 구분" className="mb-4 flex gap-2">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`chip ${tab === value ? 'chip-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {bookings.loading && !bookings.data && <Loading />}
      {bookings.error && <ErrorBox message={bookings.error} onRetry={bookings.reload} />}
      {bookings.data && list.length === 0 && (
        <EmptyState icon={<CalendarX size={26} />} title="예약이 없어요">
          <Link to="/" className="font-semibold text-teal-700 hover:underline">
            숙소 둘러보기
          </Link>
        </EmptyState>
      )}
      <ul className="space-y-3">
        {list.map((b) => (
          <BookingItem
            key={b.id}
            booking={b}
            tab={tab}
            onChange={() => setChanging(b)}
            onCancel={() => setCancelling(b)}
            onReview={() => setReviewing(b)}
          />
        ))}
      </ul>

      {changing && <ChangeDialog booking={changing} onClose={() => setChanging(null)} onDone={done} />}
      {cancelling && <CancelDialog booking={cancelling} onClose={() => setCancelling(null)} onDone={done} />}
      {reviewing && <ReviewDialog booking={reviewing} onClose={() => setReviewing(null)} onDone={done} />}
    </div>
  );
}

function BookingItem(props: { booking: Booking; tab: Tab; onChange: () => void; onCancel: () => void; onReview: () => void }) {
  const { booking: b, tab } = props;
  const deadline = changeDeadline(b.check_in_date, b.check_in_time);
  const changeable = tab === 'upcoming' && Date.now() < deadline.getTime();
  const status = { upcoming: ['예약 확정', 'bg-teal-50 text-teal-700'], past: ['이용 완료', 'bg-slate-100 text-slate-600'], cancelled: ['취소됨', 'bg-rose-50 text-rose-600'] }[tab];

  return (
    <li className="card overflow-hidden">
      <div className="flex gap-4 p-4">
        <Link to={`/hotels/${b.hotel_id}`} className="size-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:size-28">
          <HotelImage src={b.hotel_images[0]} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Link to={`/hotels/${b.hotel_id}`} className="line-clamp-1 font-bold hover:underline">
              {b.hotel_name}
            </Link>
            <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${status[1]}`}>{status[0]}</span>
          </div>
          <p className="text-sm text-slate-500">
            {b.room_name} · {b.guests}명
          </p>
          <p className="mt-1 text-sm font-medium">
            {shortDate(b.check_in_date)} – {shortDate(b.check_out_date)} · {nightsBetween(b.check_in_date, b.check_out_date)}박
          </p>
          <p className="mt-1 text-sm">
            결제 금액 <strong>{won(b.total_price)}</strong>
            {Number(b.discount_amount) > 0 && <span className="ml-1 text-orange-600">(쿠폰 -{won(b.discount_amount)})</span>}
          </p>
        </div>
      </div>
      {(tab === 'upcoming' || b.can_review || b.review_id) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {tab === 'upcoming' &&
            (changeable ? (
              <>
                <p className="mr-auto text-xs text-slate-500">{format(deadline, 'M.d HH:mm')}까지 변경·취소 가능</p>
                <button type="button" className="btn-outline px-3 py-1.5 text-sm" onClick={props.onChange}>
                  날짜 변경
                </button>
                <button type="button" className="btn-outline px-3 py-1.5 text-sm text-rose-600" onClick={props.onCancel}>
                  예약 취소
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-500">체크인 24시간 전이 지나 변경·취소할 수 없어요</p>
            ))}
          {b.can_review && (
            <button type="button" className="btn-primary ml-auto px-3 py-1.5 text-sm" onClick={props.onReview}>
              리뷰 쓰기
            </button>
          )}
          {b.review_id && <p className="ml-auto text-xs font-medium text-teal-700">리뷰를 남겼어요</p>}
        </div>
      )}
    </li>
  );
}

interface DialogProps {
  booking: Booking;
  onClose: () => void;
  onDone: () => void;
}

// 요청을 보내고 결과를 알림으로 보여 준다. 실패하면 창을 닫지 않는다
function useAction(onDone: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      toast(await action(), 'success');
      onDone();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

function ChangeDialog({ booking, onClose, onDone }: DialogProps) {
  const [checkIn, setCheckIn] = useState(booking.check_in_date);
  const [checkOut, setCheckOut] = useState(booking.check_out_date);
  const [guests, setGuests] = useState(booking.guests);
  const { busy, run } = useAction(onDone);

  const save = () =>
    run(async () => {
      const data = await api<{ total_price: number }>(`/bookings/${booking.id}`, {
        method: 'PATCH',
        body: { check_in_date: checkIn, check_out_date: checkOut, guests },
      });
      return `예약을 변경했어요. 결제 금액 ${won(data.total_price)}`;
    });

  return (
    <Dialog open onClose={onClose} title="예약 변경">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {booking.hotel_name} · {booking.room_name}
        </p>
        <div className="field-box">
          <DateRangeField
            checkIn={checkIn}
            checkOut={checkOut}
            onChange={(ci, co) => {
              setCheckIn(ci);
              setCheckOut(co);
            }}
          />
        </div>
        <div className="field-box">
          <GuestsField value={guests} onChange={setGuests} />
        </div>
        <p className="text-xs text-slate-500">다른 예약과 겹치면 변경할 수 없어요. 요금은 바뀐 날짜로 다시 계산돼요.</p>
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={save}>
          {busy ? '변경하는 중…' : '변경하기'}
        </button>
      </div>
    </Dialog>
  );
}

function CancelDialog({ booking, onClose, onDone }: DialogProps) {
  const { busy, run } = useAction(onDone);
  const cancel = () =>
    run(async () => {
      await api(`/bookings/${booking.id}`, { method: 'DELETE' });
      return Number(booking.discount_amount) > 0 ? '예약을 취소했어요. 사용한 쿠폰은 쿠폰함으로 돌아갔어요.' : '예약을 취소했어요.';
    });

  return (
    <Dialog open onClose={onClose} title="예약 취소">
      <p className="text-slate-700">
        <strong>{booking.hotel_name}</strong> {shortDate(booking.check_in_date)} – {shortDate(booking.check_out_date)} 예약을 취소할까요?
      </p>
      {Number(booking.discount_amount) > 0 && <p className="mt-2 text-sm text-slate-500">사용한 쿠폰은 쿠폰함으로 돌아가요.</p>}
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-outline flex-1" onClick={onClose}>
          돌아가기
        </button>
        <button type="button" className="btn-danger flex-1" disabled={busy} onClick={cancel}>
          {busy ? '취소하는 중…' : '예약 취소'}
        </button>
      </div>
    </Dialog>
  );
}

function ReviewDialog({ booking, onClose, onDone }: DialogProps) {
  const [rating, setRating] = useState(5);
  const { busy, run } = useAction(onDone);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      await api('/reviews', {
        method: 'POST',
        body: { booking_id: booking.id, rating, title: String(form.get('title')), content: String(form.get('content')) },
      });
      return '리뷰를 남겼어요. 고마워요!';
    });
  }

  return (
    <Dialog open onClose={onClose} title="리뷰 쓰기">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">{booking.hotel_name}</p>
        <div role="radiogroup" aria-label="별점" className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}점`}
              onClick={() => setRating(n)}
              className="text-amber-400 transition hover:scale-110"
            >
              <Star size={32} fill={n <= rating ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
        <Field label="제목" name="title" required maxLength={100} />
        <div>
          <label htmlFor="review-content" className="mb-1 block text-sm font-medium text-slate-700">
            내용 <span className="font-normal text-slate-400">(10자 이상)</span>
          </label>
          <textarea id="review-content" name="content" required minLength={10} maxLength={1000} rows={4} className="input resize-none" />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? '등록하는 중…' : '리뷰 등록'}
        </button>
      </form>
    </Dialog>
  );
}
