// 단계적 검증 그림(docs/diagrams/stages.svg)을 만든다. 단계 상태가 바뀌면 아래 STAGES만 고치고 다시 실행한 뒤,
// 포트폴리오 public/images/hotel-v2-stages.svg로 복사한다 (README와 포트폴리오가 같은 그림을 씀).
// 실행: node scripts/stages-diagram.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

// status: done | doing | todo
const STAGES = [
  { n: 0, title: "로컬 앱 검증 (Docker Compose)", cost: "$0", status: "done", lines: ["로컬 장애·부하 6종, 앱 결함과 정합성 검증","이중 예약·쿠폰 교착·DB 장애 처리 수정"] },
  { n: 1, title: "AWS 이전 환경 부하 기준선", cost: "약 $10", status: "done", lines: ["동시 500명까지 견디고 1,000명부터 장애","3회 재현, DB 병목과 오류율 실측"] },
  { n: 1.5, title: "DB 병목 분석·개선", cost: "$0", status: "done", lines: ["같은 옛 환경에서 1,000명 오류율 64 → 1.5%","조회·연결 풀 개선, 앱 효과 따로 확인"] },
  { n: 2, title: "AWS 목표 인프라·CD", cost: "약 $42", status: "done", lines: ["CloudFront·ALB·ECS·RDS와 자동 배포 구축","Terraform 재현성과 예약 스케일링 검증"] },
  { n: 3, title: "덤프 이관·성능·쿠폰 실측", cost: "+ 부하", status: "done", lines: ["12개 테이블·176,073행 체크섬 일치","3,000명 부하 3회·쿠폰 2대/4대 각 3회"] },
  { n: 4, title: "AWS 장애 주입 드릴", cost: "+ Multi-AZ", status: "done", lines: ["태스크·깨진 배포·RDS·AZ 장애 주입 완료","AZ 오류율 14.6% 원인 분석은 후속"] },
  { n: 5, title: "서울→도쿄 DR · Failback", cost: "+ DR 시간", status: "done", lines: ["실험 실행 완료(사용자 확인)","RTO/RPO·오류율 최종 집계는 후속 정리"] },
];
const LABEL = { done: '완료', doing: '진행 중', todo: '예정' };
const COLOR = {
  done: { stroke: '#1a7f37', fill: '#f0fff4', dot: '#1a7f37', num: '#ffffff' },
  doing: { stroke: '#bf8700', fill: '#fff8e5', dot: '#ffffff', num: '#9a6700' },
  todo: { stroke: '#d0d7de', fill: '#ffffff', dot: '#ffffff', num: '#57606a' },
};
// 카드 오른쪽의 비용 · 상태 글자와 겹치지 않는 길이 (13px 한글 기준)
for (const s of STAGES) for (const l of s.lines) assert.ok([...l].length <= 42, `줄이 너무 김: ${l}`);
assert.ok(STAGES.every((s) => LABEL[s.status]), '모르는 상태');

const W = 640, X = 68, CW = 552, CH = 80, GAP = 14;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const font = "font-family=\"-apple-system, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif\"";
const parts = [];
const text = (x, y, s, attrs = '') => parts.push(`<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`);

let y = 58;
const rows = STAGES.map((s, i) => {
  if (i === 0) { text(X, y, '로컬 — 앱 결함을 0원으로 먼저 없앰', 'font-size="12.5" font-weight="600" fill="#0969da"'); y += 12; }
  if (i === 1) { y += 10; text(X, y, 'AWS — 로컬에서 재현할 수 없는 인프라 동작만', 'font-size="12.5" font-weight="600" fill="#0969da"'); y += 12; }
  const r = { s, y }; y += CH + GAP; return r;
});
const cy = (r) => r.y + CH / 2;
// 단계를 잇는 세로선 (완료 구간은 초록)
const lastDone = rows.filter((r) => r.s.status === 'done').at(-1);
parts.unshift(`<line x1="36" y1="${cy(rows[0])}" x2="36" y2="${cy(rows.at(-1))}" stroke="#d0d7de" stroke-width="3"/>`);
if (lastDone && lastDone !== rows.at(-1)) parts.splice(1, 0, `<line x1="36" y1="${cy(rows[0])}" x2="36" y2="${cy(rows[rows.indexOf(lastDone) + 1])}" stroke="#1a7f37" stroke-width="3"/>`);
for (const { s, y: ry } of rows) {
  const c = COLOR[s.status];
  parts.push(`<rect x="${X}" y="${ry}" width="${CW}" height="${CH}" rx="10" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${s.status === 'todo' ? 1 : 1.5}"/>`);
  parts.push(`<circle cx="36" cy="${ry + CH / 2}" r="15" fill="${c.dot}" stroke="${c.stroke === '#d0d7de' ? '#8c959f' : c.stroke}" stroke-width="${s.status === 'doing' ? 3 : 2}"/>`);
  text(36, ry + CH / 2 + 5, String(s.n), `font-size="14" font-weight="700" text-anchor="middle" fill="${c.num}"`);
  text(X + 18, ry + 28, s.title, 'font-size="15.5" font-weight="700" fill="#1f2328"');
  text(X + CW - 16, ry + 28, s.cost, 'font-size="14" font-weight="700" text-anchor="end" fill="#1f2328"');
  text(X + CW - 16, ry + 50, LABEL[s.status], `font-size="12" font-weight="600" text-anchor="end" fill="${s.status === 'todo' ? '#57606a' : c.stroke}"`);
  s.lines.forEach((l, k) => text(X + 18, ry + 51 + k * 18, l, 'font-size="13" fill="#57606a"'));
}
y += 6;
text(X, y, '같은 k6 시나리오를 환경만 바꿔 다시 돌려 단계마다 비교 · 월 비용은 평일 9~18시 기준 추정', 'font-size="12" fill="#57606a"');
const H = y + 22;

const desc = STAGES.map((s) => `${s.n} ${s.title}(${s.cost}, ${LABEL[s.status]}): ${s.lines.join(', ')}`).join(' / ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d" ${font}>
<title id="t">단계적 검증: 로컬에서 앱 결함을 먼저 없애고 AWS에서는 로컬에서 재현할 수 없는 것만 잰다</title>
<desc id="d">${esc(desc)}</desc>
<rect width="${W}" height="${H}" rx="12" fill="#f6f8fa" stroke="#d0d7de"/>
<text x="24" y="32" font-size="18" font-weight="700" fill="#1f2328">단계적 검증</text>
${parts.join('\n')}
</svg>
`;
fs.mkdirSync('docs/diagrams', { recursive: true });
fs.writeFileSync('docs/diagrams/stages.svg', svg);
console.log(`docs/diagrams/stages.svg ${W}x${H}`);
