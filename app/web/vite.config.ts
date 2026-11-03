import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 빌드 결과는 app/public으로 보낸다: API 서버가 같은 컨테이너에서 함께 내보낸다 (ADR-013)
  build: { outDir: '../public', emptyOutDir: true },
  // 개발 서버(npm run dev)는 API 요청을 로컬 앱(3000번 포트)으로 넘긴다
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
