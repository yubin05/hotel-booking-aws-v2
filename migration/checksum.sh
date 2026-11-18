# 이관 체크섬 (docs/experiments/migration.md 1절). 옛 DB와 복원 태스크가 같은 이 파일을 실행해 결과를 비교한다
# 부르는 쪽이 q() 를 먼저 정의한다: q "<SQL>" → 결과를 머리글 없이 출력 (옛 DB: cutover.sh, RDS: 복원 태스크 정의)
# 출력: SUM <테이블> <행 수> <내용 해시> / MARK <표지 손님 이메일> <이름의 HEX>
# 내용 해시 = 행마다 모든 칸을 이은 문자열의 CRC32를 XOR로 합친 값. 행 순서 · 저장 형식과 무관하다
# (CHECKSUM TABLE은 행 형식 · 버전이 다르면 값이 달라질 수 있어 서버가 다른 양쪽 비교에 쓰지 않음, MySQL 8.4 문서)
for t in $(q "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"); do
  cols=$(q "SET SESSION group_concat_max_len = 1000000;
    SELECT GROUP_CONCAT(CONCAT('IFNULL(\`', column_name, '\`, ''<NULL>'')') ORDER BY ordinal_position SEPARATOR ', ')
    FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '$t'")
  # TIMESTAMP 칸은 세션 시간대로 바뀌어 나오므로 양쪽을 UTC로 맞춘다
  echo "SUM $(q "SET time_zone = '+00:00'; SELECT '$t', COUNT(*), COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', $cols))), 0) FROM \`$t\`" | tr '\t' ' ')"
done
q "SELECT 'MARK', email, HEX(name) FROM users WHERE email LIKE 'migration-%' ORDER BY email" | tr '\t' ' '
