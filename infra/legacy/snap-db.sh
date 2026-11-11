#!/usr/bin/env bash
# 부하 중 30초마다 DB 연결 상태를 남긴다. run-baseline.sh가 DB 서버에 올려 nohup으로 돌리고 collect가 가져간다(db.snap)
# 1단계에서 본 "DB · 앱이 한가한데 실패 99%" 때 DB에 무엇이 있었는지 보려는 것 (docs/experiments/db-bottleneck.md 남은 일)
while true; do
  echo "== $(date -u +%FT%TZ)"
  sudo docker exec -i hotel-db sh -c 'mysql -uapp -p"$MYSQL_PASSWORD" -t' 2>/dev/null <<'SQL'
SELECT COUNT(*) AS conns, COALESCE(SUM(COMMAND = 'Query'), 0) AS running, COALESCE(MAX(IF(COMMAND = 'Query', TIME, 0)), 0) AS max_sec
  FROM information_schema.PROCESSLIST WHERE USER = 'app';
SHOW GLOBAL STATUS WHERE Variable_name IN ('Connections', 'Aborted_clients', 'Aborted_connects', 'Threads_running', 'Max_used_connections');
SELECT LEFT(REPLACE(INFO, '\n', ' '), 70) AS query, STATE, COUNT(*) AS n
  FROM information_schema.PROCESSLIST WHERE USER = 'app' AND COMMAND = 'Query'
 GROUP BY 1, 2 ORDER BY n DESC LIMIT 5;
SQL
  sleep 30
done
