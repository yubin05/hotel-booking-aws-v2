// 로컬 docker compose의 DB 값. CI에서는 환경 변수로 덮어쓴다 (앱 모듈보다 먼저 import할 것)
process.env.DB_PASSWORD ??= 'local-app-pw';
process.env.JWT_SECRET ??= 'test-only-secret';
