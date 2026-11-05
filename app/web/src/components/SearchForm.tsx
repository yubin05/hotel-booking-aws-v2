import { Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CityField } from './CityField';
import { DateRangeField } from './DateRangeField';
import { GuestsField } from './GuestsField';

export interface StayQuery {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export function stayParams({ city, checkIn, checkOut, guests }: StayQuery): URLSearchParams {
  const params = new URLSearchParams({ check_in: checkIn, check_out: checkOut, guests: String(guests) });
  if (city.trim()) params.set('city', city.trim());
  return params;
}

export function SearchForm({ initial, cities }: { initial: StayQuery; cities: string[] }) {
  const navigate = useNavigate();
  const [values, setValues] = useState(initial);

  // 검색 결과 화면에서 주소가 바뀌면 입력값도 맞춘다
  useEffect(() => {
    setValues(initial);
  }, [initial.city, initial.checkIn, initial.checkOut, initial.guests]);

  function submit(e: FormEvent) {
    e.preventDefault();
    navigate(`/search?${stayParams(values)}`);
  }

  return (
    <form onSubmit={submit} className="card grid gap-2 p-3 md:grid-cols-[1.1fr_1.5fr_1fr_auto] md:items-center">
      <CityField value={values.city} onChange={(city) => setValues({ ...values, city })} cities={cities} />
      <div className="field-box">
        <DateRangeField
          checkIn={values.checkIn}
          checkOut={values.checkOut}
          onChange={(checkIn, checkOut) => setValues({ ...values, checkIn, checkOut })}
        />
      </div>
      <div className="field-box">
        <GuestsField value={values.guests} onChange={(guests) => setValues({ ...values, guests })} />
      </div>
      <button className="btn-primary md:px-6">
        <Search size={18} aria-hidden /> 검색
      </button>
    </form>
  );
}
