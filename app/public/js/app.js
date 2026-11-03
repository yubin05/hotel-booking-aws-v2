
// ===== State =====
let state = {
  user: null,
  token: null,
  currentHotel: null,
  currentRoom: null,
  searchParams: {},
  wishlistIds: new Set(),
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  loadAuth();
  setupEventListeners();
  setDefaultDates();
  loadFeaturedHotels();
  initStarRating();
  showCloudProvider();
  navigateTo('home');
});

function showCloudProvider() {
  const logoText = document.querySelector('.logo-text');
  if (logoText) logoText.textContent += ` - ${CLOUD_PROVIDER}`;

  const footerLogo = document.querySelector('.footer-logo');
  if (footerLogo) footerLogo.textContent += ` - ${CLOUD_PROVIDER}`;
}

function loadAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (token && user) {
    state.token = token;
    state.user = JSON.parse(user);
    updateAuthUI();
  }
}

function setDefaultDates() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const fmt = d => d.toISOString().split('T')[0];
  const ci = document.getElementById('hero-checkin');
  const co = document.getElementById('hero-checkout');
  if (ci) ci.value = fmt(tomorrow);
  if (co) co.value = fmt(dayAfter);
  ci.min = fmt(tomorrow);
  co.min = fmt(dayAfter);
}

// ===== API =====
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: { ...headers, ...options.headers } });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`서버 오류 (${res.status}): 백엔드 서버에 연결할 수 없습니다.`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '오류가 발생했습니다.');
  return data;
}

// ===== Navigation =====
function navigateTo(page, params = {}) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);

  switch (page) {
    case 'home': loadFeaturedHotels(); break;
    case 'search': loadSearchResults(params); break;
    case 'hotel-detail': loadHotelDetail(params.id); break;
    case 'booking': loadBookingPage(params); break;
    case 'bookings': loadMyBookings(); break;
    case 'wishlist': loadWishlist(); break;
    case 'mypage': loadMypage(); break;
    case 'support': loadSupportPage(params.section); break;
    case 'admin': loadAdminPage(); break;
  }
}

// ===== Event Listeners =====
function setupEventListeners() {
  // Nav links
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });

  // Auth buttons
  document.getElementById('btn-login').addEventListener('click', () => openModal('modal-login'));
  document.getElementById('btn-register').addEventListener('click', () => openModal('modal-register'));
  document.getElementById('btn-logout').addEventListener('click', logout);

  // User avatar dropdown
  document.getElementById('user-avatar-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('user-dropdown').classList.toggle('show');
  });
  document.addEventListener('click', () => {
    document.getElementById('user-dropdown')?.classList.remove('show');
  });

  // Modal close
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });
  document.getElementById('modal-overlay').addEventListener('click', closeAllModals);

  // Modal switch
  document.getElementById('switch-to-register').addEventListener('click', e => {
    e.preventDefault(); closeAllModals(); openModal('modal-register');
  });
  document.getElementById('switch-to-login').addEventListener('click', e => {
    e.preventDefault(); closeAllModals(); openModal('modal-login');
  });

  // Forms
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('profile-form').addEventListener('submit', handleUpdateProfile);
  document.getElementById('password-form').addEventListener('submit', handleChangePassword);

  // Hero search
  document.getElementById('btn-hero-search').addEventListener('click', () => {
    const city = document.getElementById('hero-city').value;
    const checkin = document.getElementById('hero-checkin').value;
    const checkout = document.getElementById('hero-checkout').value;
    const guests = document.getElementById('hero-guests').value;
    navigateTo('search', { city, check_in: checkin, check_out: checkout, guests });
  });

  // Category cards
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      navigateTo('search', { category: card.dataset.category });
    });
  });

  // Region cards
  document.querySelectorAll('.region-card').forEach(card => {
    card.addEventListener('click', () => {
      navigateTo('search', { city: card.dataset.city });
    });
  });

  // Search inline
  document.getElementById('btn-search-inline').addEventListener('click', () => {
    const city = document.getElementById('search-city-input').value;
    const checkin = document.getElementById('search-checkin-input').value;
    const checkout = document.getElementById('search-checkout-input').value;
    loadSearchResults({ city, check_in: checkin, check_out: checkout });
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', () => {
    loadSearchResults({ ...state.searchParams, sort_by: document.getElementById('sort-select').value });
  });

  // Filter
  document.getElementById('btn-apply-filter').addEventListener('click', applyFilters);
  document.getElementById('btn-reset-filter').addEventListener('click', resetFilters);

  // Booking form
  document.getElementById('booking-form').addEventListener('submit', handleBooking);
  document.getElementById('book-checkin').addEventListener('change', updatePriceBreakdown);
  document.getElementById('book-checkout').addEventListener('change', updatePriceBreakdown);

  // Admin tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchAdminTab(tab.dataset.tab);
      if (tab.dataset.tab === 'bookings') loadAdminBookings();
      if (tab.dataset.tab === 'hotels') loadAdminHotels();
      if (tab.dataset.tab === 'inquiries') loadAdminInquiries();
    });
  });

  // Admin forms
  document.getElementById('admin-hotel-form').addEventListener('submit', handleAdminHotelSubmit);
  document.getElementById('admin-room-form').addEventListener('submit', handleAdminRoomSubmit);
  document.getElementById('ah-image-files')?.addEventListener('change', e => {
    const preview = document.getElementById('ah-image-preview');
    preview.innerHTML = '';
    Array.from(e.target.files).slice(0, 5).forEach(f => {
      const url = URL.createObjectURL(f);
      preview.innerHTML += `<img src="${url}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`;
    });
  });

  // Category dropdown toggle
  const categoryBtn = document.getElementById('btn-category-menu');
  const categoryDropdown = document.getElementById('category-dropdown');
  if (categoryBtn && categoryDropdown) {
    categoryBtn.addEventListener('click', e => {
      e.stopPropagation();
      categoryDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => categoryDropdown.classList.remove('show'));
    categoryDropdown.querySelectorAll('.category-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        categoryDropdown.classList.remove('show');
        navigateTo('search', { category: item.dataset.category });
      });
    });
  }

  // Mypage tabs
  document.querySelectorAll('.mypage-tab').forEach(tab => {
    tab.addEventListener('click', () => switchMypageTab(tab.dataset.tab));
  });

  // Mypage bookings status tabs (동적 생성된 탭도 처리)
  document.getElementById('mypage-bookings')?.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab) {
      document.querySelectorAll('#mypage-bookings .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadMyBookingsInMypage(tab.dataset.status);
    }
  });

  // Mypage inquiry → 고객센터로 이동
  document.getElementById('mypage-inquiries')?.addEventListener('click', e => {
    if (e.target.dataset.page === 'support') {
      navigateTo('support', { section: 'inquiry-write' });
    }
  });

  // Support sidebar menu
  document.querySelectorAll('.support-menu-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchSupportSection(item.dataset.support);
    });
  });

  // FAQ accordion
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  // Inquiry form submit
  document.getElementById('inquiry-form')?.addEventListener('submit', handleInquirySubmit);

  // Inquiry type change
  document.getElementById('inquiry-type')?.addEventListener('change', e => {
    const field = document.getElementById('booking-id-field');
    if (field) field.style.display = ['refund', 'change'].includes(e.target.value) ? 'block' : 'none';
  });

  // File attach
  document.getElementById('inquiry-files')?.addEventListener('change', e => handleFileSelect(e.target.files));

  // Footer support direct links
  document.querySelectorAll('[data-support-direct]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo('support', { section: el.dataset.supportDirect });
    });
  });
}

// ===== Auth =====
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    state.token = res.data.token;
    state.user = res.data.user;
    localStorage.setItem('token', state.token);
    localStorage.setItem('user', JSON.stringify(state.user));
    updateAuthUI();
    loadWishlistIds();
    closeAllModals();
    showToast('로그인 되었습니다!', 'success');
    e.target.reset();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  const body = {
    name: document.getElementById('reg-name').value,
    email: document.getElementById('reg-email').value,
    password: document.getElementById('reg-password').value,
    phone: document.getElementById('reg-phone').value,
    role: document.getElementById('reg-role').value
  };
  try {
    const res = await api('/auth/register', { method: 'POST', body: JSON.stringify(body) });
    state.token = res.data.token;
    state.user = res.data.user;
    localStorage.setItem('token', state.token);
    localStorage.setItem('user', JSON.stringify(state.user));
    updateAuthUI();
    closeAllModals();
    showToast('회원가입이 완료되었습니다!', 'success');
    e.target.reset();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateAuthUI();
  navigateTo('home');
  showToast('로그아웃 되었습니다.', 'info');
}

function updateAuthUI() {
  const authButtons = document.getElementById('auth-buttons');
  const userMenu = document.getElementById('user-menu');
  const navMypage = document.getElementById('nav-mypage');

  const isAdmin = state.user && (state.user.role === 'admin' || state.user.role === 'host');

  if (state.user) {
    authButtons.style.display = 'none';
    userMenu.style.display = 'flex';
    if (navMypage) navMypage.style.display = 'block';
    document.getElementById('user-initials').textContent = state.user.name[0].toUpperCase();
    document.getElementById('user-name-display').textContent = state.user.name;
    document.getElementById('user-email-display').textContent = state.user.email;
    document.getElementById('nav-admin').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('dropdown-admin').style.display = isAdmin ? 'block' : 'none';
  } else {
    authButtons.style.display = 'flex';
    userMenu.style.display = 'none';
    if (navMypage) navMypage.style.display = 'none';
    document.getElementById('nav-admin').style.display = 'none';
    document.getElementById('dropdown-admin').style.display = 'none';
  }
}

// ===== Hotels =====
// 목록/카드용 썸네일 경로로 치환 (Lambda가 hotels/original/* → hotels/thumbnails/* 에 리사이즈본 생성)
function getThumbnailUrl(url) {
  return url && url.includes('/hotels/original/') ? url.replace('/hotels/original/', '/hotels/thumbnails/') : url;
}

// 썸네일 로드 실패 시 원본 → 플레이스홀더 순으로 대체
function handleImgError(img) {
  if (img.dataset.original && img.src !== img.dataset.original) {
    img.src = img.dataset.original;
  } else if (img.dataset.placeholder) {
    img.src = img.dataset.placeholder;
  }
}

async function loadFeaturedHotels() {
  const container = document.getElementById('featured-hotels');
  if (!container) return;
  try {
    const res = await api('/hotels/featured');
    container.innerHTML = res.data.map(hotel => renderHotelCard(hotel)).join('');
    attachHotelCardEvents(container);
  } catch {
    container.innerHTML = '<div class="empty-state">숙소를 불러올 수 없습니다.</div>';
  }
}

function renderHotelCard(hotel) {
  const placeholder = 'https://placehold.co/400x300?text=No+Image';
  const original = hotel.images && hotel.images.length > 0 ? hotel.images[0] : placeholder;
  const img = getThumbnailUrl(original);
  const categoryMap = { hotel: '호텔', motel: '모텔', pension: '펜션', guesthouse: '게스트하우스', resort: '리조트', camping: '캠핑' };
  const minPrice = hotel.min_price ? Math.floor(hotel.min_price) : 0;
  return `
    <div class="hotel-card" data-hotel-id="${hotel.id}">
      <div class="hotel-card-img">
        <img src="${img}" data-original="${original}" data-placeholder="${placeholder}" alt="${hotel.name}" loading="lazy" onerror="handleImgError(this)">
        <span class="hotel-badge">${categoryMap[hotel.category] || hotel.category}</span>
        <button class="hotel-wish-btn" data-hotel-id="${hotel.id}" onclick="event.stopPropagation(); toggleWishlist('${hotel.id}', this)">${state.wishlistIds.has(hotel.id) ? '❤️' : '🤍'}</button>
      </div>
      <div class="hotel-card-body">
        <div class="hotel-category">${hotel.city} · ${hotel.region}</div>
        <div class="hotel-card-title">${hotel.name}</div>
        <div class="hotel-rating">
          <span class="rating-badge">⭐ ${hotel.rating || '신규'}</span>
          <span class="review-count">리뷰 ${hotel.review_count}개</span>
        </div>
        <div class="hotel-price">
          ${minPrice > 0 ? `<span class="price-amount">${minPrice.toLocaleString()}원</span><span class="price-unit"> / 1박</span>` : '<span class="price-amount">가격 문의</span>'}
        </div>
      </div>
    </div>`;
}

function attachHotelCardEvents(container) {
  container.querySelectorAll('.hotel-card').forEach(card => {
    card.addEventListener('click', () => navigateTo('hotel-detail', { id: card.dataset.hotelId }));
  });
}

async function loadSearchResults(params = {}) {
  state.searchParams = params;
  const container = document.getElementById('search-results-list');
  const countEl = document.getElementById('search-result-count');
  container.innerHTML = '<div class="loading-spinner">검색 중...</div>';

  // Populate search bar
  if (params.city) document.getElementById('search-city-input').value = params.city;
  if (params.check_in) document.getElementById('search-checkin-input').value = params.check_in;
  if (params.check_out) document.getElementById('search-checkout-input').value = params.check_out;

  try {
    const qp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qp.append(k, v); });
    const res = await api(`/hotels/search?${qp}`);
    const { hotels, pagination } = res.data;
    countEl.textContent = `숙소 ${pagination.total}개`;

    if (hotels.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>검색 결과가 없습니다.</p></div>`;
      return;
    }

    container.innerHTML = hotels.map(hotel => renderHotelListCard(hotel)).join('');
    container.querySelectorAll('.hotel-list-card').forEach(card => {
      card.addEventListener('click', () => navigateTo('hotel-detail', { id: card.dataset.hotelId }));
    });

    renderPagination(pagination);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function renderHotelListCard(hotel) {
  const placeholder = 'https://placehold.co/400x300';
  const original = hotel.images && hotel.images.length > 0 ? hotel.images[0] : placeholder;
  const img = getThumbnailUrl(original);
  const minPrice = hotel.min_price ? Math.floor(hotel.min_price) : 0;
  const amenities = (hotel.amenities || []).slice(0, 4);
  const categoryMap = { hotel: '호텔', motel: '모텔', pension: '펜션', guesthouse: '게스트하우스', resort: '리조트', camping: '캠핑' };
  return `
    <div class="hotel-list-card" data-hotel-id="${hotel.id}">
      <div class="hotel-list-img">
        <img src="${img}" data-original="${original}" data-placeholder="${placeholder}" alt="${hotel.name}" loading="lazy" onerror="handleImgError(this)">
      </div>
      <div class="hotel-list-body">
        <div class="hotel-category">${categoryMap[hotel.category] || hotel.category} · ${hotel.city}</div>
        <div class="hotel-card-title">${hotel.name}</div>
        <div class="hotel-location">📍 ${hotel.address}</div>
        <div class="hotel-rating">
          <span class="rating-badge">⭐ ${hotel.rating || 0}</span>
          <span class="review-count">리뷰 ${hotel.review_count}개</span>
        </div>
        <div class="amenities-tags">${amenities.map(a => `<span class="tag">${a}</span>`).join('')}</div>
        <div class="hotel-list-footer">
          <div></div>
          <div class="hotel-price">
            ${minPrice > 0 ? `<span class="price-amount">${minPrice.toLocaleString()}원</span><span class="price-unit"> / 1박</span>` : '<span>가격 문의</span>'}
          </div>
        </div>
      </div>
    </div>`;
}

function renderPagination(pagination) {
  const container = document.getElementById('search-pagination');
  if (pagination.total_pages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= pagination.total_pages; i++) {
    html += `<button class="page-btn ${i === pagination.page ? 'active' : ''}" onclick="loadSearchResults({...state.searchParams, page: ${i}})">${i}</button>`;
  }
  container.innerHTML = html;
}

// ===== Hotel Detail =====
async function loadHotelDetail(id) {
  const container = document.getElementById('hotel-detail-content');
  container.innerHTML = '<div class="loading-spinner" style="padding:100px">숙소 정보를 불러오는 중...</div>';

  try {
    const res = await api(`/hotels/${id}`);
    const hotel = res.data;
    state.currentHotel = hotel;

    const images = hotel.images || [];
    const galleryHtml = images.slice(0, 5).map((img, i) => `<img src="${img}" alt="${hotel.name}" onerror="this.src='https://placehold.co/800x500'">`).join('');

    const amenityIcons = { '수영장':'🏊', '스파':'💆', '피트니스센터':'💪', '레스토랑':'🍽️', '바':'🍷', '주차장':'🚗', '조식포함':'🍳', '와이파이':'📶', '바베큐':'🔥', '해변':'🏖️', '카페':'☕', '한옥체험':'🏯', '문화체험':'🎭', '바다뷰':'🌊', '취사가능':'🍳', '등산로':'🥾', '공항셔틀':'✈️', '비즈니스센터':'💼' };

    container.innerHTML = `
      <div class="hotel-detail">
        <div class="container">
          <div style="padding: 20px 0 0; cursor:pointer; color: var(--text-light); font-size:0.9rem;" onclick="history.back()">← 뒤로가기</div>
          <div class="hotel-gallery" style="margin-top:16px">
            ${galleryHtml || '<div style="background:#eee;display:flex;align-items:center;justify-content:center;height:100%;grid-column:1/-1">이미지 없음</div>'}
          </div>
          <div class="hotel-detail-layout">
            <div class="hotel-info">
              <div style="display:inline-block;padding:4px 12px;background:var(--primary-light);color:var(--primary);border-radius:20px;font-size:0.8rem;font-weight:700;margin-bottom:12px">
                ${({ hotel:'호텔', motel:'모텔', pension:'펜션', guesthouse:'게스트하우스', resort:'리조트', camping:'캠핑' })[hotel.category]}
              </div>
              <h1 class="hotel-detail-name">${hotel.name}</h1>
              <div class="hotel-detail-meta">
                <div class="hotel-detail-rating">
                  <span class="rating-stars">${'★'.repeat(Math.round(hotel.rating))}${'☆'.repeat(5 - Math.round(hotel.rating))}</span>
                  <strong>${hotel.rating}</strong>
                  <span>(${hotel.review_count}개 리뷰)</span>
                </div>
                <span>📍 ${hotel.address}</span>
              </div>
              <h3 class="section-subtitle">숙소 소개</h3>
              <p class="hotel-description">${hotel.description}</p>
              <h3 class="section-subtitle">체크인/체크아웃</h3>
              <div style="display:flex;gap:32px">
                <div><strong>체크인</strong><br><span style="color:var(--text-light)">${hotel.check_in_time}</span></div>
                <div><strong>체크아웃</strong><br><span style="color:var(--text-light)">${hotel.check_out_time}</span></div>
              </div>
              <h3 class="section-subtitle">편의시설</h3>
              <div class="amenities-list">
                ${hotel.amenities.map(a => `<div class="amenity-item">${amenityIcons[a] || '✓'} ${a}</div>`).join('')}
              </div>
              ${hotel.latitude && hotel.longitude ? `
              <h3 class="section-subtitle">위치</h3>
              <div id="hotel-map" style="width:100%;height:320px;border-radius:12px;overflow:hidden;margin-bottom:24px"></div>
              ` : ''}
              <h3 class="section-subtitle">객실 선택</h3>
              <div class="rooms-list">
                ${hotel.rooms.map(room => renderRoomCard(room, hotel)).join('')}
              </div>
            </div>
            <div class="booking-widget">
              <div class="widget-price">
                <div class="price-from">최저가</div>
                <div>
                  <span class="price-amount">${hotel.rooms.length > 0 ? Math.min(...hotel.rooms.map(r => Math.floor(r.discounted_price || r.price_per_night))).toLocaleString() : '0'}원</span>
                  <span class="price-unit"> / 1박</span>
                </div>
              </div>
              <div class="widget-dates">
                <input type="date" id="widget-checkin" placeholder="체크인">
                <input type="date" id="widget-checkout" placeholder="체크아웃">
              </div>
              <div class="widget-guests">
                <select id="widget-guests">
                  <option value="1">1명</option>
                  <option value="2" selected>2명</option>
                  <option value="3">3명</option>
                  <option value="4">4명</option>
                </select>
              </div>
              <button class="btn btn-primary btn-full btn-large" onclick="scrollToRooms()">객실 선택하기</button>
              <div style="margin-top:16px;font-size:0.8rem;color:var(--text-light);text-align:center">
                ✓ 무료 취소 (체크인 24시간 전)<br>✓ 최저가 보장
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Azure Maps 초기화
    if (hotel.latitude && hotel.longitude) {
      initAzureMap('hotel-map', hotel.latitude, hotel.longitude, hotel.name);
    }

    // Set default dates on widget
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate() + 1);
    const fmt = d => d.toISOString().split('T')[0];
    document.getElementById('widget-checkin').value = fmt(tomorrow);
    document.getElementById('widget-checkout').value = fmt(dayAfter);

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function renderRoomCard(room, hotel) {
  const placeholder = 'https://placehold.co/300x200';
  const original = room.images && room.images.length > 0 ? room.images[0] : placeholder;
  const img = getThumbnailUrl(original);
  const typeMap = { standard: '스탠다드', deluxe: '디럭스', suite: '스위트', family: '패밀리', dormitory: '도미토리' };
  const price = Math.floor(room.price_per_night);
  const discounted = Math.floor(room.discounted_price || price);
  const hasDiscount = room.discount_rate > 0;

  return `
    <div class="room-card">
      <div class="room-img"><img src="${img}" data-original="${original}" data-placeholder="${placeholder}" alt="${room.name}" onerror="handleImgError(this)"></div>
      <div class="room-body">
        <span class="room-type-badge">${typeMap[room.type] || room.type}</span>
        <div class="room-name">${room.name}</div>
        <div class="room-capacity">👥 최대 ${room.capacity}명</div>
        <div class="amenities-tags">${room.amenities.slice(0, 3).map(a => `<span class="tag">${a}</span>`).join('')}</div>
        <div class="room-footer">
          <div></div>
          <div>
            ${hasDiscount ? `<div class="price-original">${price.toLocaleString()}원</div>` : ''}
            <div style="display:flex;align-items:baseline;gap:4px">
              ${hasDiscount ? `<span style="color:var(--danger);font-weight:700;font-size:0.9rem">-${room.discount_rate}%</span>` : ''}
              <span class="price-amount">${discounted.toLocaleString()}원</span>
              <span class="price-unit">/박</span>
            </div>
            <button class="btn btn-primary" style="margin-top:8px" onclick="selectRoom('${hotel.id}', '${room.id}')">예약하기</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderReviewCard(r) {
  const initial = r.user_name ? r.user_name[0].toUpperCase() : 'U';
  const date = new Date(r.created_at).toLocaleDateString('ko-KR');
  const isOwner = state.user && state.user.id === r.user_id;
  return `
    <div class="review-card" id="review-${r.id}">
      <div class="review-header">
        <div class="reviewer">
          <div class="reviewer-avatar">${initial}</div>
          <div>
            <div class="reviewer-name">${r.user_name || '익명'}</div>
            <div class="review-date">${date}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
          ${isOwner ? '<button class="btn btn-outline" style="padding:2px 10px;font-size:0.78rem;color:var(--danger);border-color:var(--danger)" data-rid="' + r.id + '" onclick="deleteReview(this.dataset.rid)">삭제</button>' : ''}
        </div>
      </div>
      <div class="review-title">${r.title}</div>
      <div class="review-content">${r.content}</div>
    </div>`;
}

async function deleteReview(reviewId) {
  if (!confirm('리뷰를 삭제하시겠습니까?')) return;
  try {
    await api(`/reviews/${reviewId}`, { method: 'DELETE' });
    document.getElementById('review-' + reviewId)?.remove();
    showToast('리뷰가 삭제되었습니다.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function scrollToRooms() {
  document.querySelector('.rooms-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectRoom(hotelId, roomId) {
  if (!state.user) {
    showToast('로그인 후 예약할 수 있습니다.', 'info');
    openModal('modal-login');
    return;
  }
  const checkin = document.getElementById('widget-checkin')?.value;
  const checkout = document.getElementById('widget-checkout')?.value;
  navigateTo('booking', { hotelId, roomId, check_in: checkin, check_out: checkout });
}

// ===== Booking =====
async function loadBookingPage(params) {
  state.bookingParams = params;
  // 이 화면에서 예약 버튼을 여러 번 눌러도 한 건만 만들어지도록 화면마다 멱등키를 하나 쓴다
  state.bookingKey = crypto.randomUUID();
  const summaryEl = document.getElementById('booking-summary');
  const breakdownEl = document.getElementById('price-breakdown');

  if (params.check_in) document.getElementById('book-checkin').value = params.check_in;
  if (params.check_out) document.getElementById('book-checkout').value = params.check_out;

  try {
    const hotelRes = await api(`/hotels/${params.hotelId}`);
    const hotel = hotelRes.data;
    const room = hotel.rooms.find(r => r.id === params.roomId);

    if (!room) { showToast('객실 정보를 찾을 수 없습니다.', 'error'); return; }

    state.currentHotel = hotel;
    state.currentRoom = room;

    const summaryPlaceholder = 'https://placehold.co/100x80';
    const summaryOriginal = room.images && room.images.length > 0 ? room.images[0] : summaryPlaceholder;
    const summaryImg = getThumbnailUrl(summaryOriginal);

    summaryEl.innerHTML = `
      <div style="display:flex;gap:16px;align-items:center">
        <img src="${summaryImg}" data-original="${summaryOriginal}" data-placeholder="${summaryPlaceholder}" style="width:100px;height:80px;border-radius:8px;object-fit:cover" onerror="handleImgError(this)">
        <div>
          <div style="font-weight:700;font-size:1.05rem">${hotel.name}</div>
          <div style="color:var(--text-light);margin:4px 0">${room.name}</div>
          <div style="font-size:0.85rem;color:var(--text-light)">📍 ${hotel.address}</div>
        </div>
      </div>`;

    updatePriceBreakdown();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updatePriceBreakdown() {
  if (!state.currentRoom) return;
  const checkin = document.getElementById('book-checkin').value;
  const checkout = document.getElementById('book-checkout').value;
  const breakdownEl = document.getElementById('price-breakdown');

  if (!checkin || !checkout) return;
  const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
  if (nights <= 0) return;

  const room = state.currentRoom;
  const pricePerNight = Math.floor(room.price_per_night);
  const discounted = Math.floor(room.discounted_price || pricePerNight);
  const total = discounted * nights;
  const discount = (pricePerNight - discounted) * nights;

  breakdownEl.innerHTML = `
    <h3 style="margin-bottom:16px">요금 안내</h3>
    <div class="price-row"><span>${pricePerNight.toLocaleString()}원 × ${nights}박</span><span>${(pricePerNight * nights).toLocaleString()}원</span></div>
    ${discount > 0 ? `<div class="price-row discount"><span>할인 (-${room.discount_rate}%)</span><span>-${discount.toLocaleString()}원</span></div>` : ''}
    <div class="price-row total"><span>합계</span><span>${total.toLocaleString()}원</span></div>`;
}

async function handleBooking(e) {
  e.preventDefault();
  if (!state.user) { openModal('modal-login'); return; }

  const params = state.bookingParams;
  const body = {
    hotel_id: params.hotelId,
    room_id: params.roomId,
    check_in_date: document.getElementById('book-checkin').value,
    check_out_date: document.getElementById('book-checkout').value,
    guests: document.getElementById('book-guests').value,
    special_requests: document.getElementById('book-requests').value
  };

  try {
    await api('/bookings', {
      method: 'POST',
      headers: { 'Idempotency-Key': state.bookingKey },
      body: JSON.stringify(body),
    });
    showToast('예약이 완료되었습니다!', 'success');
    navigateTo('bookings');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== My Bookings =====
async function loadMyBookings() {
  if (!state.user) { openModal('modal-login'); return; }
  const container = document.getElementById('bookings-list');
  container.innerHTML = '<div class="loading-spinner">예약 내역을 불러오는 중...</div>';

  const activeTab = document.querySelector('.tab.active');
  const status = activeTab ? activeTab.dataset.status : '';

  try {
    const qp = status ? `?status=${status}` : '';
    const res = await api(`/bookings${qp}`);
    const { bookings } = res.data;

    if (bookings.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>예약 내역이 없습니다.</p></div>`;
      return;
    }

    container.innerHTML = bookings.map(b => {
      const placeholder = 'https://placehold.co/200x150';
      const original = b.hotel_images && b.hotel_images.length > 0 ? b.hotel_images[0] : placeholder;
      const img = getThumbnailUrl(original);
      const statusLabels = { confirmed: '확정', pending: '대기중', cancelled: '취소', completed: '완료' };
      const statusClass = `status-${b.status}`;
      const ci = new Date(b.check_in_date).toLocaleDateString('ko-KR');
      const co = new Date(b.check_out_date).toLocaleDateString('ko-KR');
      const canCancel = b.status !== 'cancelled' && b.status !== 'completed';
      const canReview = b.status === 'confirmed' || b.status === 'completed';
      return `
        <div class="booking-item">
          <div class="booking-item-img"><img src="${img}" data-original="${original}" data-placeholder="${placeholder}" alt="${b.hotel_name}" onerror="handleImgError(this)"></div>
          <div class="booking-item-info">
            <div class="booking-item-title">${b.hotel_name}</div>
            <div style="color:var(--text-light);margin-bottom:4px">${b.room_name}</div>
            <div class="booking-item-dates">${ci} ~ ${co}</div>
            <div>총 금액: <strong>${Math.floor(b.total_price).toLocaleString()}원</strong></div>
            <div class="booking-item-actions">
              <span class="booking-status ${statusClass}">${statusLabels[b.status] || b.status}</span>
              ${canCancel ? '<button class="btn btn-outline" style="padding:4px 12px;font-size:0.8rem" onclick="cancelBooking(\'' + b.id + '\')">예약 취소</button>' : ''}
              ${canReview ? '<button class="btn btn-outline" style="padding:4px 12px;font-size:0.8rem;color:var(--primary);border-color:var(--primary)" data-bid="' + b.id + '" data-hid="' + b.hotel_id + '" data-hname="' + b.hotel_name + '" onclick="openReviewModal(this.dataset.bid,this.dataset.hid,this.dataset.hname)">리뷰 작성</button>' : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    // Tab events
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadMyBookings();
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

async function cancelBooking(bookingId) {
  if (!confirm('예약을 취소하시겠습니까?')) return;
  try {
    await api(`/bookings/${bookingId}`, { method: 'DELETE' });
    showToast('예약이 취소되었습니다.', 'success');
    loadMyBookings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Review =====
function openReviewModal(bookingId, hotelId, hotelName) {
  document.getElementById('review-title').value = '';
  document.getElementById('review-content').value = '';
  document.getElementById('review-rating').value = '0';
  document.getElementById('review-error').textContent = '';
  document.querySelectorAll('#star-rating .star').forEach(s => s.classList.remove('active'));
  document.getElementById('modal-review').dataset.bookingId = bookingId;
  document.getElementById('modal-review').dataset.hotelId   = hotelId;
  document.getElementById('modal-review').querySelector('h3').textContent = `리뷰 작성 — ${hotelName}`;
  openModal('modal-review');
}

async function handleSubmitReview(e) {
  e.preventDefault();
  const modal     = document.getElementById('modal-review');
  const bookingId = modal.dataset.bookingId;
  const hotelId   = modal.dataset.hotelId;
  const rating    = Number(document.getElementById('review-rating').value);
  const title     = document.getElementById('review-title').value.trim();
  const content   = document.getElementById('review-content').value.trim();
  const errorEl   = document.getElementById('review-error');

  if (rating === 0) { errorEl.textContent = '별점을 선택해주세요.'; return; }
  errorEl.textContent = '';

  try {
    await api('/reviews', {
      method: 'POST',
      body: JSON.stringify({ hotel_id: hotelId, booking_id: bookingId, rating, title, content }),
    });
    closeModal('modal-review');
    showToast('리뷰가 등록되었습니다!', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function initStarRating() {
  const stars = document.querySelectorAll('#star-rating .star');
  stars.forEach(star => {
    star.addEventListener('mouseover', () => {
      const val = Number(star.dataset.value);
      stars.forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= val));
    });
    star.addEventListener('mouseout', () => {
      const selected = Number(document.getElementById('review-rating').value);
      stars.forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= selected));
    });
    star.addEventListener('click', () => {
      const val = star.dataset.value;
      document.getElementById('review-rating').value = val;
      stars.forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= Number(val)));
    });
  });
  document.getElementById('review-form').addEventListener('submit', handleSubmitReview);
}

// ===== Wishlist =====
async function loadWishlistIds() {
  if (!state.user) return;
  try {
    const res = await api('/wishlist');
    state.wishlistIds = new Set(res.data.map(h => h.id));
  } catch {}
}

async function loadWishlist() {
  if (!state.user) { openModal('modal-login'); return; }
  const container = document.getElementById('wishlist-list');
  container.innerHTML = '<div class="loading-spinner">위시리스트를 불러오는 중...</div>';

  try {
    const res = await api('/wishlist');
    if (res.data.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🤍</div><p>위시리스트가 비어있습니다.</p></div>`;
      return;
    }
    container.innerHTML = res.data.map(hotel => renderHotelCard(hotel)).join('');
    attachHotelCardEvents(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

async function toggleWishlist(hotelId, btn) {
  if (!state.user) { showToast('로그인 후 이용해주세요.', 'info'); openModal('modal-login'); return; }
  try {
    const res = await api(`/wishlist/${hotelId}`, { method: 'POST' });
    const wishlisted = res.data.wishlisted;
    btn.textContent = wishlisted ? '❤️' : '🤍';
    if (wishlisted) state.wishlistIds.add(hotelId);
    else state.wishlistIds.delete(hotelId);
    showToast(res.message, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Mypage =====
async function loadMypage() {
  if (!state.user) { openModal('modal-login'); navigateTo('home'); return; }
  switchMypageTab('mypage-bookings'); // v2는 프로필 수정이 없어 예약 내역 탭부터 연다
  try {
    const res = await api('/auth/profile');
    const user = res.data;
    document.getElementById('profile-name').value = user.name || '';
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-phone').value = user.phone || '';
  } catch {}
}

function switchMypageTab(tabId) {
  document.querySelectorAll('.mypage-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.mypage-tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
  if (tabId === 'mypage-bookings') loadMyBookingsInMypage('');
  if (tabId === 'mypage-wishlist') loadWishlistInMypage();
  if (tabId === 'mypage-inquiries') loadMyInquiries();
}

async function loadMyBookingsInMypage(status) {
  if (!state.user) return;
  const container = document.getElementById('mypage-bookings-list');
  container.innerHTML = '<div class="loading-spinner">예약 내역을 불러오는 중...</div>';
  try {
    const qp = status ? `?status=${status}` : '';
    const res = await api(`/bookings${qp}`);
    const { bookings } = res.data;
    if (bookings.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>예약 내역이 없습니다.</p></div>';
      return;
    }
    const statusLabels = { confirmed: '확정', pending: '대기중', cancelled: '취소', completed: '완료' };
    container.innerHTML = bookings.map(b => {
      const img = b.hotel_images?.[0] || 'https://placehold.co/200x150';
      const ci = new Date(b.check_in_date).toLocaleDateString('ko-KR');
      const co = new Date(b.check_out_date).toLocaleDateString('ko-KR');
      const canCancel = b.status !== 'cancelled' && b.status !== 'completed';
      const canReview = b.status === 'confirmed' || b.status === 'completed';
      return `
        <div class="booking-item">
          <div class="booking-item-img"><img src="${img}" onerror="this.src='https://placehold.co/200x150'"></div>
          <div class="booking-item-info">
            <div class="booking-item-title">${b.hotel_name}</div>
            <div style="color:var(--text-light);margin-bottom:4px">${b.room_name}</div>
            <div class="booking-item-dates">${ci} ~ ${co}</div>
            <div>총 금액: <strong>${Math.floor(b.total_price).toLocaleString()}원</strong></div>
            <div class="booking-item-actions">
              <span class="booking-status status-${b.status}">${statusLabels[b.status] || b.status}</span>
              ${canCancel ? `<button class="btn btn-outline" style="padding:4px 12px;font-size:0.8rem" onclick="cancelBookingMypage('${b.id}')">예약 취소</button>` : ''}
              ${canReview ? `<button class="btn btn-outline" style="padding:4px 12px;font-size:0.8rem;color:var(--primary);border-color:var(--primary)" onclick="openReviewModal('${b.id}','${b.hotel_id}','${b.hotel_name}')">리뷰 작성</button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

async function cancelBookingMypage(bookingId) {
  if (!confirm('예약을 취소하시겠습니까?')) return;
  try {
    await api(`/bookings/${bookingId}`, { method: 'DELETE' });
    showToast('예약이 취소되었습니다.', 'success');
    loadMyBookingsInMypage('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadWishlistInMypage() {
  if (!state.user) return;
  const container = document.getElementById('mypage-wishlist-list');
  container.innerHTML = '<div class="loading-spinner">위시리스트를 불러오는 중...</div>';
  try {
    const res = await api('/wishlist');
    if (res.data.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🤍</div><p>찜한 숙소가 없습니다.</p></div>';
      return;
    }
    container.innerHTML = res.data.map(hotel => renderHotelCard(hotel)).join('');
    attachHotelCardEvents(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

async function loadMyInquiries() {
  if (!state.user) return;
  const container = document.getElementById('mypage-inquiry-list');
  container.innerHTML = '<div class="loading-spinner">문의 내역을 불러오는 중...</div>';
  try {
    const res = await apiSupport('/inquiries');
    const inquiries = res.data || [];
    if (inquiries.length === 0) {
      container.innerHTML = '<div class="empty-state">문의 내역이 없습니다.</div>';
      return;
    }
    container.innerHTML = inquiries.map(q => renderInquiryCard(q)).join('');
  } catch {
    container.innerHTML = '<div class="empty-state">문의 내역을 불러올 수 없습니다.</div>';
  }
}

// ===== Profile (legacy) =====
async function loadProfile() {
  if (!state.user) { openModal('modal-login'); return; }
  try {
    const res = await api('/auth/profile');
    const user = res.data;
    document.getElementById('profile-name').value = user.name || '';
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-phone').value = user.phone || '';
  } catch {}
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  try {
    await api('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('profile-name').value,
        phone: document.getElementById('profile-phone').value
      })
    });
    showToast('프로필이 업데이트되었습니다.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const np = document.getElementById('new-password').value;
  const cp = document.getElementById('confirm-password').value;
  if (np !== cp) { showToast('새 비밀번호가 일치하지 않습니다.', 'error'); return; }
  try {
    await api('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({
        current_password: document.getElementById('current-password').value,
        new_password: np
      })
    });
    showToast('비밀번호가 변경되었습니다.', 'success');
    e.target.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Filter =====
function applyFilters() {
  const categories = [...document.querySelectorAll('.filter-checkboxes input[type="checkbox"]:checked')]
    .map(cb => cb.value)
    .filter(v => ['hotel','motel','pension','guesthouse','resort','camping'].includes(v));

  const params = {
    ...state.searchParams,
    category: categories.length === 1 ? categories[0] : undefined,
    min_price: document.getElementById('filter-min-price').value,
    max_price: document.getElementById('filter-max-price').value,
  };
  loadSearchResults(params);
}

function resetFilters() {
  document.querySelectorAll('.filter-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.getElementById('filter-min-price').value = '';
  document.getElementById('filter-max-price').value = '';
  loadSearchResults({ ...state.searchParams, category: undefined, min_price: undefined, max_price: undefined });
}

// ===== Modals =====
function openModal(id) {
  document.getElementById(id).classList.add('show');
  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
  document.getElementById('modal-overlay').classList.remove('show');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
  document.getElementById('modal-overlay').classList.remove('show');
}

// ===== Admin =====
const adminState = { selectedHotelId: null };

async function loadAdminPage() {
  if (!state.user || (state.user.role !== 'admin' && state.user.role !== 'host')) {
    navigateTo('home');
    showToast('접근 권한이 없습니다.', 'error');
    return;
  }
  switchAdminTab('hotels');
  loadAdminStats();
  loadAdminHotels();
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.admin-tab[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`admin-tab-${tab}`)?.classList.add('active');
}

async function loadAdminInquiries() {
  const container = document.getElementById('admin-inquiry-list');
  container.innerHTML = '<div class="loading-spinner">문의 목록을 불러오는 중...</div>';
  try {
    const res = await apiSupport('/admin/inquiries');
    const inquiries = res.data || [];
    if (inquiries.length === 0) {
      container.innerHTML = '<div class="empty-state">접수된 문의가 없습니다.</div>';
      return;
    }
    const typeLabels = { general: '일반 문의', refund: '환불 요청', change: '예약 변경', complaint: '불편 신고', etc: '기타' };
    container.innerHTML = inquiries.map(q => `
      <div class="inquiry-card" id="admin-inquiry-${q.id}">
        <div class="inquiry-card-header">
          <span class="inquiry-type-badge">${typeLabels[q.type] || q.type}</span>
          <span class="booking-status ${q.status === 'answered' ? 'status-confirmed' : 'status-pending'}">
            ${q.status === 'answered' ? '답변 완료' : q.status === 'closed' ? '종료' : '접수됨'}
          </span>
          <span style="margin-left:auto;font-size:0.8rem;color:var(--text-light)">${new Date(q.created_at).toLocaleDateString('ko-KR')}</span>
        </div>
        <div class="inquiry-card-body">
          <p style="font-size:0.8rem;color:var(--text-light);margin-bottom:4px">${q.user_email || ''}</p>
          <strong>${q.title}</strong>
          <p style="margin-top:8px;white-space:pre-wrap">${q.content}</p>
          ${q.files && q.files.length > 0 ? `
          <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
            ${q.files.map(f => `<a href="${f.url}" target="_blank" download="${f.name}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;color:var(--text-primary);text-decoration:none">📎 ${f.name} <span style="color:var(--text-light)">(${(f.size/1024).toFixed(0)}KB)</span></a>`).join('')}
          </div>` : ''}
          ${q.answer ? `<div style="margin-top:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;border-left:3px solid var(--primary)"><strong>답변</strong><p style="margin-top:4px;white-space:pre-wrap">${q.answer}</p></div>` : ''}
          ${q.status !== 'answered' ? `
          <div style="margin-top:12px">
            <textarea id="answer-${q.id}" rows="3" class="form-control" placeholder="답변을 입력하세요" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;resize:vertical"></textarea>
            <button class="btn btn-primary" style="margin-top:8px" onclick="submitInquiryAnswer('${q.id}')">답변 등록</button>
          </div>` : ''}
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div class="empty-state">문의 목록을 불러올 수 없습니다.</div>';
  }
}

async function submitInquiryAnswer(inquiryId) {
  const answer = document.getElementById(`answer-${inquiryId}`)?.value.trim();
  if (!answer) { showToast('답변 내용을 입력해주세요.', 'error'); return; }
  try {
    await apiSupport(`/admin/inquiries/${inquiryId}/answer`, {
      method: 'PUT',
      body: JSON.stringify({ answer }),
    });
    showToast('답변이 등록되었습니다.', 'success');
    loadAdminInquiries();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminStats() {
  try {
    const [hotelsRes, bookingsRes] = await Promise.all([
      api('/hotels/mine'),
      api('/bookings/host')
    ]);
    const hotels = hotelsRes.data;
    const bookings = bookingsRes.data;
    const roomCount = hotels.reduce((sum, h) => sum + (Number(h.room_count) || 0), 0);
    const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
    const revenue = bookings
      .filter(b => b.status !== 'cancelled')
      .reduce((sum, b) => sum + Number(b.total_price), 0);

    document.getElementById('admin-stats').innerHTML = `
      <div class="admin-stat-card">
        <div class="stat-value">${hotels.length}</div>
        <div class="stat-label">등록 숙소</div>
      </div>
      <div class="admin-stat-card">
        <div class="stat-value">${roomCount}</div>
        <div class="stat-label">총 객실</div>
      </div>
      <div class="admin-stat-card">
        <div class="stat-value">${confirmedCount}</div>
        <div class="stat-label">확정 예약</div>
      </div>
      <div class="admin-stat-card">
        <div class="stat-value">${Math.floor(revenue).toLocaleString()}원</div>
        <div class="stat-label">총 매출</div>
      </div>`;
  } catch {}
}

async function loadAdminHotels() {
  const container = document.getElementById('admin-hotels-list');
  container.innerHTML = '<div class="loading-spinner">숙소 목록을 불러오는 중...</div>';
  try {
    const showInactive = document.getElementById('admin-show-inactive-hotels')?.checked;
    const res = await api(`/hotels/mine${showInactive ? '?include_inactive=true' : ''}`);
    const hotels = res.data;
    if (hotels.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🏨</div>
        <p>등록된 숙소가 없습니다.<br>
        <a href="#" onclick="switchAdminTab('add-hotel')" style="color:var(--primary);font-weight:600">첫 번째 숙소를 등록해보세요</a></p>
      </div>`;
      return;
    }
    container.innerHTML = hotels.map(h => renderAdminHotelCard(h)).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function renderAdminHotelCard(hotel) {
  const placeholder = 'https://placehold.co/120x90?text=No+Image';
  const original = hotel.images && hotel.images.length > 0 ? hotel.images[0] : placeholder;
  const img = getThumbnailUrl(original);
  const categoryMap = { hotel: '호텔', motel: '모텔', pension: '펜션', guesthouse: '게스트하우스', resort: '리조트', camping: '캠핑' };
  const statusBadge = hotel.is_active
    ? '<span class="admin-status-badge active">운영중</span>'
    : '<span class="admin-status-badge inactive">비활성</span>';
  const escapedName = hotel.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `
    <div class="admin-hotel-card" id="admin-hotel-${hotel.id}">
      <div class="admin-hotel-main">
        <img src="${img}" data-original="${original}" data-placeholder="${placeholder}" alt="${hotel.name}" onerror="handleImgError(this)">
        <div class="admin-hotel-info">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span class="hotel-badge" style="position:static;font-size:0.75rem">${categoryMap[hotel.category] || hotel.category}</span>
            ${statusBadge}
          </div>
          <div class="admin-hotel-name">${hotel.name}</div>
          <div style="font-size:0.85rem;color:var(--text-light);margin:4px 0">📍 ${hotel.address}</div>
          <div style="font-size:0.85rem;color:var(--text-light)">객실 ${hotel.room_count || 0}개 &nbsp;·&nbsp; ⭐ ${hotel.rating || '신규'} &nbsp;·&nbsp; 리뷰 ${hotel.review_count || 0}개</div>
        </div>
        <div class="admin-hotel-actions">
          <button class="btn btn-outline" style="font-size:0.85rem" onclick="toggleRoomPanel('${hotel.id}', '${escapedName}')">객실 관리</button>
          <button class="btn btn-outline" style="font-size:0.85rem" onclick="toggleHotelStatus('${hotel.id}', ${hotel.is_active})">
            ${hotel.is_active ? '비활성화' : '활성화'}
          </button>
        </div>
      </div>
      <div class="admin-room-panel" id="rooms-panel-${hotel.id}" style="display:none"></div>
    </div>`;
}

async function toggleRoomPanel(hotelId, hotelName) {
  const panel = document.getElementById(`rooms-panel-${hotelId}`);
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  await renderRoomPanel(hotelId, hotelName);
}

async function renderRoomPanel(hotelId, hotelName) {
  const panel = document.getElementById(`rooms-panel-${hotelId}`);
  panel.innerHTML = '<div class="loading-spinner" style="padding:20px">객실 정보를 불러오는 중...</div>';
  try {
    const res = await api(`/hotels/${hotelId}`);
    const rooms = res.data.rooms;
    const displayName = hotelName || res.data.name;
    panel.innerHTML = `
      <div class="admin-room-panel-inner">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h4 style="font-size:1rem;font-weight:700">${displayName} — 객실 목록</h4>
          <button class="btn btn-primary" style="font-size:0.85rem;padding:8px 16px" onclick="openAddRoomModal('${hotelId}')">+ 객실 추가</button>
        </div>
        ${rooms.length === 0
          ? '<div class="empty-state" style="padding:30px 0"><p>등록된 객실이 없습니다.</p></div>'
          : rooms.map(room => renderAdminRoomRow(room)).join('')}
      </div>`;
  } catch (err) {
    panel.innerHTML = `<div style="padding:20px;color:var(--danger)">${err.message}</div>`;
  }
}

function renderAdminRoomRow(room) {
  const typeMap = { standard: '스탠다드', deluxe: '디럭스', suite: '스위트', family: '패밀리', dormitory: '도미토리' };
  const price = Math.floor(room.price_per_night);
  const discounted = Math.floor(room.discounted_price || price);
  return `
    <div class="admin-room-row">
      <div>
        <span class="room-type-badge">${typeMap[room.type] || room.type}</span>
        <span style="font-weight:600;margin-left:8px">${room.name}</span>
      </div>
      <div style="font-size:0.85rem;color:var(--text-light)">최대 ${room.capacity}명</div>
      <div>
        ${room.discount_rate > 0 ? `<span style="text-decoration:line-through;color:var(--text-light);font-size:0.8rem;margin-right:4px">${price.toLocaleString()}원</span>` : ''}
        <strong>${discounted.toLocaleString()}원</strong><span style="color:var(--text-light);font-size:0.8rem">/박</span>
        ${room.discount_rate > 0 ? `<span style="color:var(--danger);font-size:0.8rem;margin-left:4px">-${room.discount_rate}%</span>` : ''}
      </div>
      <span class="booking-status ${room.is_available ? 'status-confirmed' : 'status-cancelled'}">${room.is_available ? '판매중' : '판매중지'}</span>
    </div>`;
}

function openAddRoomModal(hotelId) {
  adminState.selectedHotelId = hotelId;
  document.getElementById('admin-room-error').textContent = '';
  document.getElementById('admin-room-form').reset();
  openModal('modal-room');
}

async function handleAdminHotelSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('admin-hotel-error');
  errEl.textContent = '';

  const amenities = [...document.querySelectorAll('#ah-amenities-grid input:checked')].map(cb => cb.value);
  const selectedFiles = Array.from(document.getElementById('ah-image-files')?.files || []).slice(0, 5);

  const body = {
    name:           document.getElementById('ah-name').value,
    description:    document.getElementById('ah-description').value,
    category:       document.getElementById('ah-category').value,
    address:        document.getElementById('ah-address').value,
    city:           document.getElementById('ah-city').value,
    region:         document.getElementById('ah-region').value,
    check_in_time:  document.getElementById('ah-checkin-time').value,
    check_out_time: document.getElementById('ah-checkout-time').value,
    amenities,
    images: [],
  };

  try {
    // 1. 호텔 생성 (이미지 없이)
    const res = await api('/hotels', { method: 'POST', body: JSON.stringify(body) });
    const hotelId = res.data?.id;

    // 2. 이미지 파일이 있으면 presign → S3 업로드
    if (hotelId && selectedFiles.length > 0) {
      const imageUrls = await Promise.all(selectedFiles.map(async file => {
        const presignRes = await api(`/hotels/${hotelId}/image-upload-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`, { method: 'POST' });
        const isAzureBlob = presignRes.data.uploadUrl.includes('.blob.core.windows.net');
        const uploadHeaders = isAzureBlob
          ? { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' }
          : { 'Content-Type': file.type };
        await fetch(presignRes.data.uploadUrl, { method: 'PUT', headers: uploadHeaders, body: file });
        return presignRes.data.imageUrl;
      }));

      // 3. 호텔 이미지 업데이트
      await api(`/hotels/${hotelId}`, { method: 'PUT', body: JSON.stringify({ images: imageUrls }) });
    }

    showToast('숙소가 등록되었습니다!', 'success');
    document.getElementById('admin-hotel-form').reset();
    document.getElementById('ah-image-preview').innerHTML = '';
    switchAdminTab('hotels');
    loadAdminHotels();
    loadAdminStats();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleAdminRoomSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('admin-room-error');
  errEl.textContent = '';

  const hotelId = adminState.selectedHotelId;
  if (!hotelId) return;

  const amenities = [...document.querySelectorAll('#admin-room-form .admin-amenities-grid input:checked')].map(cb => cb.value);
  const imagesRaw = document.getElementById('ar-images').value.trim();
  const images = imagesRaw ? imagesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const body = {
    name:           document.getElementById('ar-name').value,
    description:    document.getElementById('ar-description').value,
    type:           document.getElementById('ar-type').value,
    capacity:       Number(document.getElementById('ar-capacity').value),
    price_per_night: Number(document.getElementById('ar-price').value),
    discount_rate:  Number(document.getElementById('ar-discount').value) || 0,
    amenities, images,
  };

  try {
    await api(`/hotels/${hotelId}/rooms`, { method: 'POST', body: JSON.stringify(body) });
    showToast('객실이 등록되었습니다!', 'success');
    closeAllModals();
    renderRoomPanel(hotelId, '');
    loadAdminStats();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function toggleHotelStatus(hotelId, currentStatus) {
  try {
    await api(`/hotels/${hotelId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: !currentStatus })
    });
    showToast(`숙소가 ${!currentStatus ? '활성화' : '비활성화'}되었습니다.`, 'success');
    loadAdminHotels();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminBookings() {
  const container = document.getElementById('admin-bookings-list');
  container.innerHTML = '<div class="loading-spinner">예약 현황을 불러오는 중...</div>';
  try {
    const res = await api('/bookings/host');
    const bookings = res.data;
    if (!bookings || bookings.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>예약 내역이 없습니다.</p></div>';
      return;
    }
    const statusLabels = { confirmed: '확정', pending: '대기중', cancelled: '취소', completed: '완료' };
    container.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>예약자</th>
              <th>숙소 / 객실</th>
              <th>체크인</th>
              <th>체크아웃</th>
              <th>인원</th>
              <th>금액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${bookings.map(b => `
              <tr>
                <td>
                  <strong>${b.guest_name || '-'}</strong><br>
                  <span style="font-size:0.8rem;color:var(--text-light)">${b.guest_email || ''}</span>
                </td>
                <td>
                  <strong>${b.hotel_name}</strong><br>
                  <span style="font-size:0.85rem;color:var(--text-light)">${b.room_name}</span>
                </td>
                <td>${new Date(b.check_in_date).toLocaleDateString('ko-KR')}</td>
                <td>${new Date(b.check_out_date).toLocaleDateString('ko-KR')}</td>
                <td>${b.guests}명</td>
                <td><strong>${Math.floor(b.total_price).toLocaleString()}원</strong></td>
                <td><span class="booking-status status-${b.status}">${statusLabels[b.status] || b.status}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

// ===== Reviews =====
async function loadHotelReviews(hotelId, reviewCount) {
  const section = document.getElementById('hotel-reviews-section');
  if (!section) return;
  try {
    const res = await api(`/hotels/${hotelId}/reviews?limit=3`);
    const reviews = res.data?.reviews || [];
    const actualTotal = res.data?.pagination?.total ?? res.data?.total ?? reviewCount;

    const headingEl = document.getElementById('review-count-heading');
    if (headingEl) headingEl.textContent = `리뷰 (${actualTotal}개)`;

    if (reviews.length === 0) {
      section.innerHTML = '<p style="color:var(--text-light)">아직 리뷰가 없습니다.</p>';
      return;
    }
    section.innerHTML = reviews.map(r => renderReviewCard(r)).join('');
    if (actualTotal > 3) {
      section.innerHTML += `<button class="btn btn-outline" onclick="loadMoreReviews('${hotelId}')">리뷰 더보기</button>`;
    }
  } catch {
    section.innerHTML = '<p style="color:var(--text-light)">리뷰를 불러올 수 없습니다.</p>';
  }
}

async function loadMoreReviews(hotelId) {
  const section = document.getElementById('hotel-reviews-section');
  if (!section) return;
  try {
    const res = await api(`/hotels/${hotelId}/reviews?limit=50`);
    const reviews = res.data?.reviews || [];
    section.innerHTML = reviews.map(r => renderReviewCard(r)).join('');
  } catch {
    showToast('리뷰를 불러올 수 없습니다.', 'error');
  }
}

// ===== Azure Maps =====
function initAzureMap(containerId, lat, lng, name) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!AZURE_MAPS_KEY || typeof atlas === 'undefined') {
    container.style.display = 'none';
    return;
  }

  const map = new atlas.Map(containerId, {
    center:               [lng, lat],
    zoom:                 15,
    language:             'ko-KR',
    authOptions: {
      authType:        'subscriptionKey',
      subscriptionKey: AZURE_MAPS_KEY,
    },
  });

  map.events.add('ready', () => {
    const marker = new atlas.HtmlMarker({
      position: [lng, lat],
      popup: new atlas.Popup({
        content: `<div style="padding:8px;font-size:14px;font-weight:600">${name}</div>`,
        pixelOffset: [0, -30],
      }),
    });
    map.markers.add(marker);
    marker.getPopup().open(map);
  });
}

// ===== Support API helper =====
async function apiSupport(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(`${SUPPORT_BASE}${endpoint}`, { ...options, headers: { ...headers, ...options.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '오류가 발생했습니다.');
  return data;
}

// ===== Support Page =====
function loadSupportPage(section) {
  switchSupportSection(section || 'inquiry-write');
  if (section === 'inquiry-list') loadSupportInquiryList();
}

function switchSupportSection(sectionId) {
  document.querySelectorAll('.support-menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.support === sectionId);
  });
  document.querySelectorAll('.support-section').forEach(s => {
    s.classList.toggle('active', s.id === `support-${sectionId}`);
  });
  if (sectionId === 'inquiry-list') loadSupportInquiryList();
}

async function handleInquirySubmit(e) {
  e.preventDefault();
  if (!state.user) { showToast('로그인 후 문의하실 수 있습니다.', 'info'); openModal('modal-login'); return; }

  const errEl = document.getElementById('inquiry-error');
  errEl.textContent = '';

  const body = {
    type: document.getElementById('inquiry-type').value,
    title: document.getElementById('inquiry-title').value.trim(),
    content: document.getElementById('inquiry-content').value.trim(),
    booking_id: document.getElementById('inquiry-booking-id')?.value || null,
  };

  try {
    const fileInput = document.getElementById('inquiry-files');
    const selectedFiles = fileInput?.files ? Array.from(fileInput.files).slice(0, 3) : [];

    // S3 presigned URL 발급 후 직접 업로드
    let uploadedFiles = [];
    if (selectedFiles.length > 0) {
      const presignRes = await apiSupport('/inquiries/presign', {
        method: 'POST',
        body: JSON.stringify({ files: selectedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })) }),
      });
      await Promise.all(presignRes.data.map(async (p, i) => {
        await fetch(p.uploadUrl, { method: 'PUT', headers: { 'Content-Type': selectedFiles[i].type }, body: selectedFiles[i] });
        uploadedFiles.push({ name: p.name, key: p.key, size: p.size });
      }));
    }

    await apiSupport('/inquiries', { method: 'POST', body: JSON.stringify({ ...body, files: uploadedFiles }) });
    showToast('문의가 접수되었습니다.', 'success');
    e.target.reset();
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('booking-id-field').style.display = 'none';
    switchSupportSection('inquiry-list');
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function loadSupportInquiryList() {
  if (!state.user) return;
  const container = document.getElementById('support-inquiry-items');
  container.innerHTML = '<div class="loading-spinner">문의 내역을 불러오는 중...</div>';
  try {
    const res = await apiSupport('/inquiries');
    const inquiries = res.data || [];
    if (inquiries.length === 0) {
      container.innerHTML = '<div class="empty-state">문의 내역이 없습니다.</div>';
      return;
    }
    container.innerHTML = inquiries.map(q => renderInquiryCard(q)).join('');
  } catch {
    container.innerHTML = '<div class="empty-state">문의 내역을 불러올 수 없습니다.</div>';
  }
}

function renderInquiryCard(q) {
  const typeLabels = { general: '일반 문의', refund: '환불 요청', change: '예약 변경', complaint: '불편 신고', etc: '기타' };
  const statusClass = q.status === 'answered' ? 'status-confirmed' : 'status-pending';
  const statusText = q.status === 'answered' ? '답변 완료' : '접수됨';
  const date = new Date(q.created_at).toLocaleDateString('ko-KR');
  return `
    <div class="inquiry-card">
      <div class="inquiry-header">
        <span class="inquiry-type-badge">${typeLabels[q.type] || q.type}</span>
        <span class="booking-status ${statusClass}">${statusText}</span>
      </div>
      <div class="inquiry-title">${q.title}</div>
      <div class="inquiry-meta">${date}</div>
      ${q.answer ? `<div class="inquiry-answer"><strong>답변:</strong> ${q.answer}</div>` : ''}
    </div>`;
}

function handleFileSelect(files) {
  const listEl = document.getElementById('file-list');
  if (!files || files.length === 0) { listEl.innerHTML = ''; return; }

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const selected = Array.from(files).slice(0, 3);
  const oversized = selected.filter(f => f.size > MAX_SIZE);

  if (oversized.length > 0) {
    showToast(`파일 크기는 최대 10MB까지 허용됩니다. (${oversized.map(f => f.name).join(', ')})`, 'error');
    document.getElementById('inquiry-files').value = '';
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = selected.map(f => `
    <div class="file-item">
      <span class="file-name">📎 ${f.name}</span>
      <span class="file-size">(${(f.size / 1024).toFixed(0)}KB)</span>
    </div>`).join('');
}

// ===== Toast =====
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ===== AI 챗봇 =====
let chatHistory = [];

function toggleChatbot() {
  const popup = document.getElementById('chatbot-popup');
  popup.classList.toggle('open');
  if (popup.classList.contains('open')) {
    document.getElementById('chatbot-input').focus();
  }
}

function formatBotText(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}

function appendChatBubble(role, text) {
  const messages = document.getElementById('chatbot-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  if (role.includes('bot')) {
    bubble.innerHTML = formatBotText(text);
  } else {
    bubble.textContent = text;
  }
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

async function sendChatMessage() {
  const input = document.getElementById('chatbot-input');
  const sendBtn = document.getElementById('chatbot-send');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;

  appendChatBubble('user', message);
  const typingBubble = appendChatBubble('bot typing', '입력 중...');

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: chatHistory.slice(-10) }),
    });
    const data = await res.json();
    const reply = data.reply || '답변을 받지 못했습니다.';

    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: reply });

    typingBubble.className = 'chat-bubble bot';
    typingBubble.innerHTML = formatBotText(reply);
  } catch {
    typingBubble.className = 'chat-bubble bot';
    typingBubble.textContent = '오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}
