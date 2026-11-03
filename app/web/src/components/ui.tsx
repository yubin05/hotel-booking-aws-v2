import { LogIn, Star } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">({hint})</span>}
      </label>
      <input id={id} className="input" {...props} />
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" role="img" aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={i <= Math.round(value) ? 'currentColor' : 'none'} aria-hidden />
      ))}
    </span>
  );
}

export function RatingBadge({ rating, count }: { rating: number; count: number }) {
  if (!count) return <span className="text-sm font-medium text-teal-700">신규 숙소</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star size={14} className="text-amber-400" fill="currentColor" aria-hidden />
      <strong>{rating.toFixed(1)}</strong>
      <span className="text-slate-500">리뷰 {count.toLocaleString('ko-KR')}</span>
    </span>
  );
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card my-6 p-6 text-center" role="alert">
      <p className="text-slate-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline mt-4">
          다시 시도
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-3 grid size-14 place-items-center rounded-full bg-teal-50 text-teal-600">{icon}</div>
      <p className="font-bold text-slate-800">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function LoginRequired({ onLogin, message }: { onLogin: () => void; message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <EmptyState icon={<LogIn size={26} />} title="로그인이 필요해요">
        <p>{message}</p>
        <button type="button" onClick={onLogin} className="btn-primary mt-4">
          로그인하기
        </button>
      </EmptyState>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold md:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-slate-500">{sub}</p>}
    </div>
  );
}
