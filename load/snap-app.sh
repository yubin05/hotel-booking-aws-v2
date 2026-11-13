#!/usr/bin/env bash
# 부하 중 30초마다 앱 서버 입구의 연결 상태를 남긴다. run-baseline.sh가 앱 서버에 올려 nohup으로 돌리고 collect가 가져간다(app.snap)
# 1단계의 dial timeout(앱에 연결 자체를 못 함)이 연결 대기 줄이나 연결 추적 표(conntrack)가 차서인지 보려는 것
while true; do
  echo "== $(date -u +%FT%TZ)"
  ss -s | sed -n 1,3p
  ss -ltn 'sport = :80'
  echo "conntrack $(cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null)/$(cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null)"
  sleep 30
done
