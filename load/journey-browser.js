// 브라우저 손님 (ADR-074, 2026-11-25 사용자 결정): 실제 Chromium으로 첫 화면을 열어 손님 체감(LCP 등)을 층마다 잰다.
// 측정 손님(journey.js)은 HTTP만 보내 글꼴 · 사진 · JS 실행 · 화면 그리기를 빼서, 사용자 브라우저(5 ~ 8초)보다 훨씬 작게 쟀다(0.4 ~ 0.8초).
// 부하는 realistic.js(프로토콜)가 만들고 이건 1 ~ 2명만 같이 돈다 (k6 문서: 부하는 프로토콜, 브라우저는 적은 수).
// 매 반복 새 창(context)이라 캐시가 없는 처음 온 손님이다. 웹 지표(browser_web_vital_lcp 등)는 k6가 자동으로 남긴다
import { browser } from 'k6/browser';
import { sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
const pageLoad = new Trend('browser_page_load', true); // 열기 시작 ~ 네트워크가 조용해질 때까지(사진 · 글꼴 포함)
const pageOk = new Rate('browser_page_ok');

export const options = {
  scenarios: {
    ui: {
      executor: 'constant-vus',
      vus: Number(__ENV.BROWSERS ?? 1),
      duration: __ENV.DURATION ?? '37m',
      options: { browser: { type: 'chromium' } },
    },
  },
};

export default async function () {
  const context = await browser.newContext();
  const page = await context.newPage();
  const t0 = Date.now();
  try {
    const res = await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    pageLoad.add(Date.now() - t0);
    pageOk.add(!!res && res.status() === 200);
  } catch (e) {
    console.error(`첫 화면 실패: ${e}`);
    pageOk.add(false);
  } finally {
    await page.close();
    await context.close();
  }
  sleep(5);
}
