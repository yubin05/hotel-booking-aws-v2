import { CalendarCheck, LogOut, Server, Ticket } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { servedByStore } from '../api';
import { useAuth } from '../auth';

const REGION_LABEL: Record<string, string> = { 'ap-northeast-2': '서울', 'ap-northeast-1': '도쿄' };

// 이 화면에 응답한 서버(리전·AZ·태스크). 장애나 리전 전환 시연 때 응답 서버가 바뀌는 것이 보인다
function ServedByBadge() {
  const servedBy = useSyncExternalStore(servedByStore.subscribe, servedByStore.get);
  if (!servedBy) return null;
  const [region, az, task] = servedBy.split('/');
  const label = region === 'local' ? `로컬 · ${az}` : `${REGION_LABEL[region] ?? region} · ${az} · 태스크 ${task}`;
  return (
    <div
      className="fixed bottom-3 left-3 z-40 flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur"
      title="이 화면에 응답한 서버"
    >
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
      </span>
      <Server size={13} aria-hidden />
      <span>응답 서버 {label}</span>
    </div>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-1.5 rounded-lg px-2.5 py-2 font-medium transition ${
    isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-100'
  }`;

export function Layout() {
  const { user, openAuth, logout } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link to="/" className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight text-teal-700">
            <span aria-hidden>🧽</span> Sponge Trip
          </Link>
          <nav className="ml-auto flex items-center gap-0.5 text-sm" aria-label="주 메뉴">
            <NavLink to="/coupons" className={navClass}>
              <Ticket size={17} aria-hidden /> <span className="hidden sm:inline">쿠폰</span>
              <span className="sr-only sm:hidden">쿠폰</span>
            </NavLink>
            <NavLink to="/me/bookings" className={navClass}>
              <CalendarCheck size={17} aria-hidden /> <span className="hidden sm:inline">내 예약</span>
              <span className="sr-only sm:hidden">내 예약</span>
            </NavLink>
            {user ? (
              <div className="ml-1 flex items-center gap-1">
                <span className="hidden max-w-24 truncate text-slate-700 md:inline">{user.name}님</span>
                <button type="button" onClick={logout} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="로그아웃">
                  <LogOut size={17} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={openAuth} className="btn-primary ml-1 px-3.5 py-2 text-sm">
                로그인
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 pb-16">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-500">
          <p className="font-bold text-slate-700">🧽 Sponge Trip</p>
          <p className="mt-1">포트폴리오용 시연 서비스입니다. 실제 결제와 숙박은 이뤄지지 않습니다.</p>
        </div>
      </footer>
      <ServedByBadge />
    </div>
  );
}
