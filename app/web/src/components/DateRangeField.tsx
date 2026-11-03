import { ko } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { fromYmd, nightsBetween, shortDate, toYmd } from '../format';
import { useMediaQuery } from '../hooks';
import { Dialog } from './Dialog';

interface Props {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
}

// 숙박 날짜 범위를 달력으로 고른다. 체크아웃이 체크인보다 뒤여야(1박 이상) 적용할 수 있다
export function DateRangeField({ checkIn, checkOut, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const wide = useMediaQuery('(min-width: 640px)');
  const from = range?.from ? toYmd(range.from) : '';
  const to = range?.to ? toYmd(range.to) : '';
  const nights = from && to ? nightsBetween(from, to) : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRange({ from: fromYmd(checkIn), to: fromYmd(checkOut) });
          setOpen(true);
        }}
        className="flex w-full min-w-0 items-center gap-2 text-left"
        aria-label={`숙박 날짜 ${shortDate(checkIn)}부터 ${shortDate(checkOut)}까지, 바꾸려면 누르세요`}
      >
        <CalendarDays size={18} className="shrink-0 text-teal-600" aria-hidden />
        <span className="truncate font-medium">
          {shortDate(checkIn)} – {shortDate(checkOut)}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
          {nightsBetween(checkIn, checkOut)}박
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="날짜 선택" wide={wide}>
        <div className="flex justify-center">
          <DayPicker
            mode="range"
            locale={ko}
            numberOfMonths={wide ? 2 : 1}
            selected={range}
            onSelect={setRange}
            defaultMonth={range?.from}
            disabled={{ before: new Date() }}
          />
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">
            {nights > 0 ? `${shortDate(from)} – ${shortDate(to)} · ${nights}박` : '체크아웃 날짜를 골라 주세요'}
          </p>
          <button
            type="button"
            disabled={nights < 1}
            onClick={() => {
              onChange(from, to);
              setOpen(false);
            }}
            className="btn-primary ml-auto px-5 py-2.5"
          >
            적용
          </button>
        </div>
      </Dialog>
    </>
  );
}
