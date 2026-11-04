-- 실험 뒤 정합성 검사 (docs/07-experiments.md). 첫 표의 bad가 모두 0이어야 한다
-- 실행 (Git Bash, 저장소 루트):
--   docker compose exec -T db mysql -uroot -plocal-root-pw --default-character-set=utf8mb4 -t hotel_booking < scripts/check-consistency.sql

SELECT '겹치는 확정 예약 (같은 객실·날짜)' AS 검사, COUNT(*) AS bad
  FROM bookings a
  JOIN bookings b
    ON a.room_id = b.room_id AND a.id < b.id
   AND a.check_in_date < b.check_out_date AND b.check_in_date < a.check_out_date
 WHERE a.status = 'confirmed' AND b.status = 'confirmed'
UNION ALL
SELECT '확정 예약의 박 수 ≠ 잠금 행 수', COUNT(*)
  FROM bookings b
 WHERE b.status = 'confirmed'
   AND DATEDIFF(b.check_out_date, b.check_in_date) <> (SELECT COUNT(*) FROM booking_nights n WHERE n.booking_id = b.id)
UNION ALL
SELECT '취소된 예약에 남은 잠금 행', COUNT(*)
  FROM booking_nights n JOIN bookings b ON b.id = n.booking_id
 WHERE b.status = 'cancelled'
UNION ALL
SELECT '쿠폰 발급 수 ≠ 받은 기록 수, 또는 수량 초과', COUNT(*)
  FROM coupons c
 WHERE c.issued_count <> (SELECT COUNT(*) FROM user_coupons u WHERE u.coupon_id = c.id)
    OR c.issued_count > c.quantity
UNION ALL
SELECT '숙소 평점·리뷰 수 ≠ 리뷰 집계', COUNT(*)
  FROM hotels h
 WHERE h.review_count <> (SELECT COUNT(*) FROM reviews r WHERE r.hotel_id = h.id)
    OR h.rating <> COALESCE((SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.hotel_id = h.id), 0);

-- 유실 확인: k6 실행별 예약 수. k6 출력의 bookings_created와 같아야 한다
SELECT SUBSTRING_INDEX(idempotency_key, '-', 2) AS k6_run, COUNT(*) AS bookings
  FROM bookings
 WHERE idempotency_key LIKE 'k6-%'
 GROUP BY k6_run
 ORDER BY MIN(created_at);
