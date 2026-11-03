import 'react-day-picker/style.css';
import './index.css';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from './auth';
import { Layout } from './components/Layout';
import { BookingPage } from './pages/BookingPage';
import { CouponsPage } from './pages/CouponsPage';
import { HomePage } from './pages/HomePage';
import { HotelPage } from './pages/HotelPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { SearchPage } from './pages/SearchPage';
import { ToastProvider } from './toast';

// 화면을 옮기면 맨 위부터 보여 준다.
// 블록으로 감싸 아무것도 반환하지 않는다: 최신 브라우저의 scrollTo는 Promise를 반환해, 그대로 반환하면
// React가 정리 함수로 알고 다음 전환 때 호출하다 "is not a function"으로 화면 전체가 꺼졌다
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="px-4 py-24 text-center">
      <p className="text-lg font-bold">페이지를 찾을 수 없어요</p>
      <Link to="/" className="btn-primary mt-4">
        홈으로
      </Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="hotels/:id" element={<HotelPage />} />
              <Route path="booking" element={<BookingPage />} />
              <Route path="me/bookings" element={<MyBookingsPage />} />
              <Route path="coupons" element={<CouponsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
