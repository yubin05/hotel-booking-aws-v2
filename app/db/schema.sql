-- 숙박 예약 스키마 (MySQL 8.4)
-- 저장 프로시저·트리거·뷰는 쓰지 않는다: 덤프·복원 이식성 (docs/02-architecture.md 데이터 모델 원칙)
-- 시각(DATETIME)은 모두 UTC로 저장한다

CREATE TABLE users (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  phone         VARCHAR(20),
  role          ENUM('user','host','admin') NOT NULL DEFAULT 'user',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE hotels (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  host_id        VARCHAR(36)  NOT NULL,
  name           VARCHAR(255) NOT NULL,
  description    TEXT         NOT NULL,
  category       ENUM('hotel','motel','pension','guesthouse','resort','camping') NOT NULL,
  address        TEXT         NOT NULL,
  city           VARCHAR(100) NOT NULL,
  region         VARCHAR(100) NOT NULL,
  latitude       DOUBLE,
  longitude      DOUBLE,
  amenities      JSON         NOT NULL,
  images         JSON         NOT NULL,
  check_in_time  VARCHAR(10)  NOT NULL DEFAULT '15:00',
  check_out_time VARCHAR(10)  NOT NULL DEFAULT '11:00',
  rating         DECIMAL(3,1) NOT NULL DEFAULT 0, -- reviews에서 다시 계산한 값
  review_count   INT          NOT NULL DEFAULT 0, -- reviews에서 다시 계산한 값
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE rooms (
  id              VARCHAR(36)   NOT NULL PRIMARY KEY,
  hotel_id        VARCHAR(36)   NOT NULL,
  name            VARCHAR(255)  NOT NULL,
  description     TEXT          NOT NULL,
  type            ENUM('standard','deluxe','suite','family','dormitory') NOT NULL,
  capacity        INT           NOT NULL DEFAULT 2,
  price_per_night DECIMAL(10,2) NOT NULL,
  discount_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  images          JSON          NOT NULL,
  amenities       JSON          NOT NULL,
  is_available    TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rooms_hotel FOREIGN KEY (hotel_id) REFERENCES hotels (id)
);

-- 정액 할인 쿠폰. 발급은 issued_count < quantity 조건부 UPDATE로 하고, CHECK 제약으로 한 번 더 막는다
CREATE TABLE coupons (
  id              CHAR(36)      NOT NULL PRIMARY KEY,
  name            VARCHAR(100)  NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  quantity        INT           NOT NULL,           -- 선착순 총 수량
  issued_count    INT           NOT NULL DEFAULT 0,
  starts_at       DATETIME      NOT NULL,           -- 발급 시작
  ends_at         DATETIME      NOT NULL,           -- 발급 종료
  expires_at      DATETIME      NOT NULL,           -- 사용 기한
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_coupons_issued CHECK (issued_count BETWEEN 0 AND quantity)
);

-- 사용자가 받은 쿠폰. (쿠폰, 사용자) 유니크로 1인 1매
-- used_booking_id에는 외래 키를 걸지 않는다: bookings.user_coupon_id와 서로 참조하는 순환을 피하려고
CREATE TABLE user_coupons (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  coupon_id       CHAR(36) NOT NULL,
  user_id         CHAR(36) NOT NULL,
  used_booking_id CHAR(36),                         -- 사용한 예약. 예약을 취소하면 비운다
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_coupons (coupon_id, user_id),
  KEY idx_user_coupons_user (user_id),
  CONSTRAINT fk_user_coupons_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id),
  CONSTRAINT fk_user_coupons_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE bookings (
  id               CHAR(36)      NOT NULL PRIMARY KEY, -- UUIDv7 (만든 순서대로 정렬됨)
  user_id          CHAR(36)      NOT NULL,
  room_id          VARCHAR(36)   NOT NULL,
  check_in_date    DATE          NOT NULL,
  check_out_date   DATE          NOT NULL,
  guests           INT           NOT NULL,
  total_price      DECIMAL(10,2) NOT NULL,             -- 쿠폰 할인 후 금액
  discount_amount  DECIMAL(10,2) NOT NULL DEFAULT 0,   -- 쿠폰 할인액
  user_coupon_id   CHAR(36),
  status           ENUM('confirmed','cancelled','completed') NOT NULL DEFAULT 'confirmed',
  special_requests TEXT,
  idempotency_key  VARCHAR(100)  NOT NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bookings_idempotency (user_id, idempotency_key), -- 같은 요청이 두 번 와도 1건
  KEY idx_bookings_updated (updated_at),                         -- 특정 시각 이후 변경분 대조용
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_bookings_room FOREIGN KEY (room_id) REFERENCES rooms (id),
  CONSTRAINT fk_bookings_user_coupon FOREIGN KEY (user_coupon_id) REFERENCES user_coupons (id)
);

-- 확정된 예약이 차지한 객실·날짜. 기본 키가 겹치면 DB가 거부하므로 이중 예약이 생기지 않는다.
-- 예약 상태에서 파생되는 잠금용 테이블이라 변경·취소 때 행을 지운다 (이력 대조는 bookings 기준).
CREATE TABLE booking_nights (
  room_id    VARCHAR(36) NOT NULL,
  stay_date  DATE        NOT NULL,
  booking_id CHAR(36)    NOT NULL,
  PRIMARY KEY (room_id, stay_date),
  KEY idx_booking_nights_booking (booking_id),
  CONSTRAINT fk_booking_nights_booking FOREIGN KEY (booking_id) REFERENCES bookings (id)
);

-- 이용을 마친 예약당 리뷰 1개. 저장할 때 숙소의 rating·review_count를 다시 계산한다
CREATE TABLE reviews (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  booking_id CHAR(36)     NOT NULL UNIQUE,
  user_id    CHAR(36)     NOT NULL,
  hotel_id   VARCHAR(36)  NOT NULL,
  rating     TINYINT      NOT NULL,
  title      VARCHAR(100) NOT NULL,
  content    TEXT         NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_reviews_hotel (hotel_id, created_at),
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings (id),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_reviews_hotel FOREIGN KEY (hotel_id) REFERENCES hotels (id)
);
