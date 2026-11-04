// TS-04 재현: 홈에서 숙소 이미지를 눌렀을 때 상세 화면이 뜨는지, 콘솔 오류가 있는지 확인한다.
// 헤드리스 Edge(또는 Chrome)를 원격 디버깅(CDP)으로 조작한다. 설치할 것은 없다 (Node 24의 fetch·WebSocket 사용).
//
// 사용법 (앱을 먼저 띄운다: docker compose up -d)
//   node scripts/repro-hotel-click.mjs                         # http://localhost:3000/
//   node scripts/repro-hotel-click.mjs http://localhost:5173/  # 개발 서버: 압축되지 않은 오류 메시지와 React 경고가 보인다
//   BROWSER="C:\Program Files\Google\Chrome\Application\chrome.exe" node scripts/repro-hotel-click.mjs
//
// 정상이면 "클릭 후"의 path가 /hotels/... 이고 h1에 숙소 이름이 있으며 EXCEPTION이 없다.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const BROWSER = process.env.BROWSER ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const START = process.argv[2] ?? 'http://localhost:3000/';
const profile = mkdtempSync(join(tmpdir(), 'edge-repro-'));
const browser = spawn(
  BROWSER,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);

async function pageTarget() {
  for (let i = 0; i < 75; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('브라우저 원격 디버깅 포트가 열리지 않았습니다');
}

try {
  const page = await pageTarget();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  const state = async (label) =>
    console.log(
      label,
      JSON.stringify({
        path: await evaluate('location.pathname'),
        h1: await evaluate('document.querySelector("main h1")?.textContent ?? null'),
        mainText: await evaluate('document.querySelector("main")?.innerText.slice(0, 80) ?? null'),
        rootLength: await evaluate('document.getElementById("root").innerHTML.length'),
      }),
    );

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: START });
  await sleep(3000);
  await state('클릭 전:');
  // TS-04의 원인 확인용: 최신 Chromium에서는 Promise가 나온다
  console.log('scrollTo 반환값:', await evaluate('(() => { const r = window.scrollTo(0, 0); return r === undefined ? "undefined" : Object.prototype.toString.call(r); })()'));
  await evaluate(`document.querySelector('a[href^="/hotels/"] img')?.click()`);
  await sleep(3000);
  await state('클릭 후:');

  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails;
      console.log('EXCEPTION:', d.exception?.description ?? d.text);
    }
    if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
      console.log(`CONSOLE ${e.params.type}:`, e.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 1500));
    }
    if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') console.log('LOG:', e.params.entry.text, e.params.entry.url ?? '');
  }
  ws.close();
} finally {
  // 부모 프로세스만 끝내면 브라우저 하위 프로세스가 남아 다음 실행이 같은 포트의 옛 브라우저에 붙는다. 트리째 끝낸다
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
  else browser.kill();
}
