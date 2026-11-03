#!/bin/sh
# 테스트 전용 DB를 만든다: 테스트가 만드는 사용자·예약·리뷰가 화면 시연용 데이터(hotel_booking)에 섞이지 않게
set -e
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE hotel_booking_test; GRANT ALL ON hotel_booking_test.* TO '$MYSQL_USER'@'%';"
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" hotel_booking_test < /docker-entrypoint-initdb.d/1-schema.sql
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" hotel_booking_test < /docker-entrypoint-initdb.d/2-seed.sql
