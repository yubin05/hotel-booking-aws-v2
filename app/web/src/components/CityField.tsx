import { ChevronDown, MapPin } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

// 열 때는 지역 전체, 글자를 고치기 시작하면 그 글자가 들어간 지역만 보인다.
// 브라우저 기본 datalist는 이미 '제주'가 들어 있으면 '제주'만 보여 다른 지역을 고를 수 없었다
export function cityOptions(cities: string[], value: string, typed: boolean): string[] {
  const q = value.trim();
  return typed && q ? cities.filter((city) => city.includes(q)) : cities;
}

export function CityField({ value, onChange, cities }: { value: string; onChange: (city: string) => void; cities: string[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);
  const options = cityOptions(cities, value, typed);
  const shown = open && options.length > 0;

  function show() {
    setOpen(true);
    setTyped(false);
    setActive(-1);
  }
  function choose(city: string) {
    onChange(city);
    setOpen(false);
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return; // 한글 조합 중의 Enter·화살표는 입력기 몫
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === 'Enter' && shown && active >= 0) {
      e.preventDefault(); // 고르는 Enter가 검색 제출이 되지 않게
      choose(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="field-box relative">
      <MapPin size={18} className="shrink-0 text-teal-600" aria-hidden />
      <input
        ref={input}
        role="combobox"
        aria-label="여행지"
        aria-expanded={shown}
        aria-controls="city-options"
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `city-option-${active}` : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setTyped(true);
          setActive(-1);
        }}
        onFocus={show}
        onClick={() => !open && show()}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="어디로 갈까요? (예: 제주)"
        autoComplete="off"
        className="w-full min-w-0 bg-transparent outline-none placeholder:text-slate-400"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="여행지 목록 열기"
        onMouseDown={(e) => e.preventDefault()} // 입력칸 포커스를 잃지 않게
        onClick={() => {
          if (shown) return setOpen(false);
          input.current?.focus(); // 포커스가 있어야 밖을 눌렀을 때 닫힌다
          show();
        }}
        className="shrink-0 text-slate-400"
      >
        <ChevronDown size={18} />
      </button>
      {shown && (
        <ul
          id="city-options"
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((city, i) => (
            <li
              key={city}
              id={`city-option-${i}`}
              role="option"
              aria-selected={city === value}
              onMouseDown={(e) => e.preventDefault()} // 고르기 전에 입력칸이 닫히지 않게
              onClick={() => choose(city)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2 ${i === active ? 'bg-teal-50 text-teal-700' : ''} ${city === value ? 'font-semibold' : ''}`}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
