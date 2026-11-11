import { listen } from './app';
import { config } from './config';
import { couponPool, pool } from './db';
import { loadServedBy } from './served-by';

void loadServedBy();

const server = listen(config.port);
server.once('listening', () => console.log(`listening on ${config.port}`));

// ECS는 태스크를 멈출 때 SIGTERM을 보낸다. 처리 중인 요청을 마치고 끝내 배포 중 에러를 줄인다
process.on('SIGTERM', () => {
  server.close(() => {
    void Promise.all([pool.end(), couponPool.end()]).then(() => process.exit(0));
  });
});
