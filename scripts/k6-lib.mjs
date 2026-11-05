// k6 결과를 표·그래프로 정리하는 공용 함수. load/run-k6.sh가 남기는 요청별 기록(.json.gz)을 읽고,
// 포트폴리오에 넣을 SVG 카드(E-01과 같은 모양, 색은 CSS 변수라 다크 모드 자동)를 만든다
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

// requests: 요청마다 { scenario, name, status, start, end, duration, blocked, tags } (ms). start는 연결 대기(blocked)를 포함한 시작 시각
// points: 그 밖의 지표 값 { 지표 이름: [{ time, value, tags }] } (예: 스크립트가 만든 coupon_issued_at, checks의 tags.check)
export async function readK6(file) {
  const byRequest = new Map();
  const points = {};
  for await (const line of createInterface({ input: createReadStream(file).pipe(createGunzip()) })) {
    const p = JSON.parse(line);
    if (p.type !== 'Point') continue;
    const { time, value, tags } = p.data;
    if (p.metric === 'http_req_duration' || p.metric === 'http_req_blocked') {
      if (!tags.scenario) continue; // setup·teardown 요청은 뺀다
      // shortcut: 같은 요청의 지표를 끝난 시각(ns)으로 묶는다. 같은 ns에 끝난 두 요청은 합쳐지므로 쓰는 쪽에서 요청 수를 확인한다
      const key = `${time}|${tags.scenario}|${tags.name}`;
      const r = byRequest.get(key) ?? { scenario: tags.scenario, name: tags.name, status: tags.status, end: Date.parse(time), tags };
      r[p.metric === 'http_req_duration' ? 'duration' : 'blocked'] = value;
      byRequest.set(key, r);
    } else if (!p.metric.startsWith('http_')) {
      (points[p.metric] ??= []).push({ time: Date.parse(time), value, tags });
    }
  }
  const requests = [...byRequest.values()].map((r) => ({ ...r, start: r.end - r.blocked - r.duration }));
  return { requests, points };
}

// k6 요약과 같은 방식(순위 사이 선형 보간)의 백분위수
export function pct(values, q) {
  const s = [...values].sort((a, b) => a - b);
  const i = q * (s.length - 1);
  const lo = Math.floor(i);
  return s[lo] + ((s[lo + 1] ?? s[lo]) - s[lo]) * (i - lo);
}

const [L, R, T, B] = [30, 250, 14, 118]; // 그림 영역 (viewBox 260×140)
const SMALL = 'font:10px var(--font-mono);fill:var(--muted)';

// 꺾은선 카드 하나. series: [{ label, color: 'accent' | 'muted', dashed, points: [[x, y]] }]
// 범위와 눈금 글자는 실험마다 단위가 달라 쓰는 쪽이 정한다. ticks: [[값, 글자]]. band: [x0, x1, 글자] 음영 구간(선택).
// 선이 하나면 범례를 빼고 제목이 그 선을 설명한다
export function lineChart({ title, aria, series, x: [x0, x1], y: [y0, y1], xTicks, yTicks, band }) {
  const px = (v) => (L + ((v - x0) / (x1 - x0)) * (R - L)).toFixed(1);
  const py = (v) => (B - ((Math.min(v, y1) - y0) / (y1 - y0)) * (B - T)).toFixed(1);
  const legend = series
    .map((s) => `<span style="color:var(--${s.color})">${s.dashed ? '┄' : '━'} ${s.label}</span>`)
    .join(' &nbsp;');
  return [
    '<figure style="margin:0;padding:var(--space-3) var(--space-4);border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)">',
    `<figcaption style="padding:0 0 var(--space-2);font-size:var(--fs-sm);font-weight:500;color:var(--ink)">${title}${series.length > 1 ? `<br><span style="font-size:var(--fs-xs);font-weight:400">${legend}</span>` : ''}</figcaption>`,
    `<svg viewBox="0 0 260 140" width="100%" role="img" aria-label="${aria}" style="display:block;overflow:visible">`,
    ...(band
      ? [
          `<rect x="${px(band[0])}" y="${T}" width="${(px(band[1]) - px(band[0])).toFixed(1)}" height="${B - T}" style="fill:var(--accent-soft)"/>` +
            `<text x="${((Number(px(band[0])) + Number(px(band[1]))) / 2).toFixed(1)}" y="${B - 6}" text-anchor="middle" style="${SMALL}">${band[2]}</text>`,
        ]
      : []),
    ...yTicks.map(
      ([v, label]) =>
        `<line x1="${L}" x2="${R}" y1="${py(v)}" y2="${py(v)}" style="stroke:var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
        `<text x="${L - 4}" y="${(Number(py(v)) + 3.5).toFixed(1)}" text-anchor="end" style="${SMALL}">${label}</text>`,
    ),
    ...xTicks.map(([v, label]) => `<text x="${px(v)}" y="133" text-anchor="middle" style="${SMALL}">${label}</text>`),
    ...series.map(
      (s) =>
        `<polyline points="${s.points.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}" fill="none" style="stroke:var(--${s.color})" stroke-width="2"` +
        `${s.dashed ? ' stroke-dasharray="4 3"' : ''} stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
    ),
    '</svg>',
    '</figure>',
  ].join('\n');
}

// 가로 막대 카드: 종류별 크기 비교. bars: [{ label, note, value }] (보여 줄 순서대로). 값은 막대 끝에 글자로 쓴다
export function barList({ title, bars, max, unit }) {
  return [
    '<figure style="margin:0;padding:var(--space-3) var(--space-4);border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)">',
    `<figcaption style="padding:0 0 var(--space-3);font-size:var(--fs-sm);font-weight:500;color:var(--ink)">${title}</figcaption>`,
    '<div style="display:grid;grid-template-columns:minmax(7rem,40%) 1fr;gap:var(--space-3);align-items:center">',
    ...bars.map(
      (b) =>
        `<div style="font-size:var(--fs-sm);color:var(--ink);line-height:1.3">${b.label}${b.note ? `<br><span style="font-size:var(--fs-xs);color:var(--muted)">${b.note}</span>` : ''}</div>` +
        `<div style="display:flex;align-items:center;gap:var(--space-2)"><div style="flex:none;height:10px;width:${Math.max(1, (b.value / max) * 80).toFixed(1)}%;background:var(--accent);border-radius:0 4px 4px 0"></div>` +
        `<span style="font:12px var(--font-mono);color:var(--ink);white-space:nowrap">${b.value < 10 ? b.value.toFixed(1) : Math.round(b.value)}${unit}</span></div>`,
    ),
    '</div>',
    '</figure>',
  ].join('\n');
}
