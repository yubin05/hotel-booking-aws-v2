// 덤프 이관 결과를 처음 보는 사람이 읽을 숫자 · 표 · 그림으로 (docs/experiments/migration.md 1절)
// 실행: node scripts/cutover-report.mjs migration/results/<cutover-… 또는 rehearsal-…>
// 읽는 것: steps.log(단계 시각, 한국 시간 · 태스크 안 시각은 UTC), poll.log(1초마다 옛 주소 /api/health · 새 주소 /api/health/deep),
//          legacy.sum · rds.sum(테이블별 행 수 · 내용 해시, 표지 손님 이름 HEX)
// 내놓는 것: 표준 출력에 마크다운(숫자 · 단계별 시간 · 정합성 표), 같은 폴더 figures.html에 그림(포트폴리오와 같은 barList · lineChart)
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { barList, lineChart } from './k6-lib.mjs';

const dir = process.argv[2];
assert.ok(dir && existsSync(join(dir, 'steps.log')), '사용: node scripts/cutover-report.mjs migration/results/<이름>');
const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
const sec = (hms) => hms.split(':').reduce((s, v) => s * 60 + Number(v), 0); // 같은 날 안의 초

// ---- 단계 시각 ----
const steps = read('steps.log');
const at = (re) => {
  const m = steps.match(new RegExp(`^(\\d\\d:\\d\\d:\\d\\d) .*${re}`, 'm'));
  return m ? sec(m[1]) : null;
};
const inside = (step) => {
  const m = steps.match(new RegExp(`STEP ${step} (\\d\\d:\\d\\d:\\d\\d)`)); // 태스크 안 시각은 UTC → 한국 시간
  return m ? (sec(m[1]) + 9 * 3600) % 86400 : null;
};
const t = {
  start: at('(⑤ 점검 시작|리허설 시작)'),
  dump: at('⑥ 덤프 →'),
  uploaded: at('⑥ 올리기 끝'),
  call: at('⑦ 복원 태스크'),
  restoreStart: inside('restore-start'),
  restoreEnd: inside('restore-end'),
  checksumEnd: inside('checksum-end'),
  verified: at('⑧ 체크섬 일치'),
  migrate: at('⑨ migrate \\('),
  migrated: at('⑨ migrate 끝'),
  book: at('⑩ 새 주소에서'),
  end: at('⑩ 중단 끝'),
};
assert.ok(t.start != null && t.dump != null, 'steps.log에 시작 · 덤프 줄이 없음');
const rehearsal = basename(dir).startsWith('rehearsal');
const dumpBytes = Number(steps.match(/덤프 크기 (\d+) 바이트/)?.[1] ?? 0);
// 1초 단위라 PC 시계와 태스크 시계가 조금 달라 음수가 나오면 0으로
const phases = [
  ['점검 페이지 켜기', '옛 앱 멈춤 → 503 안내', t.start, t.dump],
  ['덤프 · 압축 · 잠금 · S3 올리기', '옛 DB → 운영 PC → S3', t.dump, t.uploaded],
  ['복원 태스크 뜨기', '자리 · 이미지 받기 · 키', t.call, t.restoreStart],
  ['받기 · 풀기 · RDS에 넣기', '미리 서명한 주소 → mysql', t.restoreStart, t.restoreEnd],
  ['새 DB 체크섬', '테이블마다 행 수 · 해시', t.restoreEnd, t.checksumEnd],
  ['태스크 정리 · 로그 · 비교', '옛 DB 체크섬과 대조', t.checksumEnd, t.verified],
  ['migrate', '앱 계정 · 시연 계정', t.migrate, t.migrated],
  ['새 주소에서 로그인 · 예약', '표지 손님', t.book, t.end],
]
  .filter(([, , a, b]) => a != null && b != null && !(rehearsal && a === b))
  .map(([label, note, a, b]) => ({ label, note, value: Math.max(0, b - a) }));
const total = (t.end ?? t.verified ?? t.start) - t.start;

// ---- 정합성 ----
const sums = (text) =>
  Object.fromEntries(text.split('\n').filter((l) => l.startsWith('SUM ')).map((l) => l.split(' ')).map(([, table, rows, hash]) => [table, { rows: Number(rows), hash }]));
const legacy = sums(read('legacy.sum'));
const rds = sums(read('rds.sum'));
const tables = Object.keys(legacy).sort();
assert.ok(tables.length > 0, 'legacy.sum에 SUM 줄이 없음');
const same = tables.filter((x) => rds[x] && rds[x].rows === legacy[x].rows && rds[x].hash === legacy[x].hash);
const rowsMoved = tables.reduce((s, x) => s + legacy[x].rows, 0);
const mark = (text) => text.split('\n').find((l) => l.startsWith('MARK '))?.split(' ')[2];
const markSame = mark(read('legacy.sum')) && mark(read('legacy.sum')) === mark(read('rds.sum'));

// ---- 1초 기록: 손님이 어디서도 예약할 수 없던 시간 = 옛 주소가 처음 200이 아닌 때 → 새 주소가 처음 200인 때 ----
const polls = read('poll.log').split('\n').map((l) => l.match(/^(\d\d:\d\d:\d\d) old=(\d+) new=(\d+)/)).filter(Boolean)
  .map(([, hms, o, n]) => ({ s: sec(hms) - t.start, old: o === '200', new: n === '200' }));
const oldDown = polls.find((p) => p.s >= 0 && !p.old)?.s;
const newUp = polls.find((p) => p.s >= 0 && p.new)?.s;
const blind = oldDown != null && newUp != null ? newUp - oldDown : null;

const mmss = (s) => (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`);
console.log(`## ${basename(dir)}${rehearsal ? ' (리허설: 점검 페이지 · migrate 없음)' : ''}\n`);
console.log('| 숫자 | 값 |\n|---|---|');
console.log(`| ${rehearsal ? '리허설 전체' : '중단 시간 (⑤ 점검 시작 → ⑩ 새 주소 예약 성공)'} | **${mmss(total)}** |`);
if (blind != null) console.log(`| 손님이 어디서도 예약할 수 없던 시간 (1초 기록) | ${mmss(blind)} |`);
console.log(`| 옮긴 데이터 | ${tables.length}개 테이블 · ${rowsMoved.toLocaleString()}행 |`);
console.log(`| 체크섬 일치 | ${same.length} / ${tables.length}${markSame ? ', 한글 표지 손님 바이트 일치' : ''} |`);
console.log(`| 덤프 크기 (압축 · 잠금 후) | ${(dumpBytes / 1e6).toFixed(2)}MB |`);
console.log('\n| 단계 | 시간 |\n|---|---|');
for (const p of phases) console.log(`| ${p.label} (${p.note}) | ${p.value}초 |`);
console.log('\n| 테이블 | 옛 DB 행 수 | 새 DB 행 수 | 해시 |\n|---|---|---|---|');
for (const x of tables) console.log(`| ${x} | ${legacy[x].rows.toLocaleString()} | ${rds[x]?.rows.toLocaleString() ?? '-'} | ${same.includes(x) ? '같음' : '**다름**'} |`);

// ---- 그림 (포트폴리오 카드와 같은 모양) ----
const figures = [
  barList({ title: `① 어디서 시간이 걸렸나: 전체 ${mmss(total)}`, bars: phases, max: Math.max(...phases.map((p) => p.value), 1), unit: '초' }),
];
if (polls.length) {
  const x1 = Math.max(...polls.map((p) => p.s));
  figures.push(
    lineChart({
      title: `② 1초마다 본 두 주소: ${blind != null ? `${mmss(blind)} 동안 어디서도 예약 불가` : '옛 주소는 내내 정상'}`,
      aria: '옛 주소와 새 주소의 정상 여부를 1초마다 그린 선',
      series: [
        { label: '옛 주소 정상', color: 'muted', dashed: true, points: polls.map((p) => [p.s, p.old ? 1 : 0]) },
        { label: '새 주소 정상(DB까지)', color: 'accent', points: polls.map((p) => [p.s, p.new ? 0.9 : 0.1]) },
      ],
      x: [Math.min(...polls.map((p) => p.s)), x1],
      y: [0, 1],
      xTicks: [0, Math.round(x1 / 2), x1].map((v) => [v, `${v}초`]),
      yTicks: [[0, '안 됨'], [1, '정상']],
    }),
  );
}
writeFileSync(join(dir, 'figures.html'), `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--space-4)">\n${figures.join('\n')}\n</div>\n`);
console.log(`\n그림: ${join(dir, 'figures.html')}`);
