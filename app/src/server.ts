import { app } from './app';
import { config } from './config';
import { pool } from './db';

const server = app.listen(config.port, () => {
  console.log(`listening on ${config.port}`);
});

// ECS는 태스크를 멈출 때 SIGTERM을 보낸다. 처리 중인 요청을 마치고 끝내 배포 중 에러를 줄인다
process.on('SIGTERM', () => {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
});
