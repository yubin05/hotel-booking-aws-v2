import { Minus, Plus, Users } from 'lucide-react';

export function GuestsField({ value, onChange, max = 10 }: { value: number; onChange: (value: number) => void; max?: number }) {
  return (
    <div className="flex w-full items-center gap-2">
      <Users size={18} className="shrink-0 text-teal-600" aria-hidden />
      <span className="font-medium">인원</span>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" aria-label="인원 줄이기" disabled={value <= 1} onClick={() => onChange(value - 1)} className="stepper">
          <Minus size={16} />
        </button>
        <span className="w-6 text-center font-semibold" aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label="인원 늘리기" disabled={value >= max} onClick={() => onChange(value + 1)} className="stepper">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
