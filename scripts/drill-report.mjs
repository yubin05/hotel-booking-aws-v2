// 4 · 5단계 드릴 결과 한 장 (docs/experiments/faults.md · region-drill.md)
//   node scripts/drill-report.mjs <결과 폴더>...   폴더마다 writer.log(drill/writer.mjs) + marks.log(스크립트가 남긴 시각)
//   node scripts/drill-report.mjs --self-test
// marks.log 한 줄: <이름> <epoch_ms> [값]. 시작 표시는 inject(4단계) 또는 t0(5단계 장애 선언), restored_max_seq는 도쿄에 남은 가장 큰 순번
// 손님 기준(서버 지표가 아니라 손님이 받은 응답): 2xx만 성공. 409(겹침)는 응답은 왔으므로 끊김에서는 성공 쪽, 오류 수에는 따로 셈
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

export function analyze(writerText, marksText) {
  const rows = writerText.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
    const [t, kind, seq, status, ms, servedBy, id] = l.split('\t');
    return { t: +t, kind, seq: seq === '-' ? null : +seq, status: +status, ms: +ms, region: servedBy.split('/')[0], id };
  });
  const marks = Object.fromEntries(marksText.split('\n').filter(Boolean).map((l) => {
    const [name, t, value] = l.trim().split(/\s+/);
    return [name, { t: +t, value }];
  }));
  const start = (marks.inject ?? marks.t0)?.t;
  assert.ok(start, 'marks.log에 inject 또는 t0가 없음');
  const responded = (r) => r.status >= 200 && r.status < 500 && r.status !== 401;
  const result = { start };
  for (const kind of ['write', 'read']) {
    const xs = rows.filter((r) => r.kind === kind);
    const after = xs.filter((r) => r.t >= start);
    const firstBad = after.find((r) => !responded(r));
    const lastBad = after.findLast((r) => !responded(r));
    const recovered = lastBad && after.find((r) => r.t > lastBad.t && responded(r));
    result[kind] = {
      total: xs.length,
      errorsAfterStart: after.filter((r) => r.status < 200 || r.status >= 300).length,
      firstErrorSec: firstBad ? (firstBad.t - start) / 1000 : null,
      // 끊김 = 시작 표시 뒤 첫 실패부터, 마지막 실패 다음 첫 성공까지 (사이에 잠깐 성공이 섞여도 한 구간으로 봄)
      outageSec: firstBad && recovered ? (recovered.t - firstBad.t) / 1000 : firstBad ? null : 0,
      p95Before: pct(xs.filter((r) => r.t < start && responded(r)).map((r) => r.ms), 95),
      p95After: pct(after.filter(responded).map((r) => r.ms), 95),
      regions: [...new Set(xs.filter(responded).map((r) => r.region))].join(' → '),
    };
  }
  const writes = rows.filter((r) => r.kind === 'write' && r.status >= 200 && r.status < 300);
  // 멱등성: 같은 순번에 예약 번호가 둘 이상이면 중복 예약
  const idsBySeq = new Map();
  for (const w of writes) idsBySeq.set(w.seq, new Set([...(idsBySeq.get(w.seq) ?? []), w.id]));
  result.duplicateSeqs = [...idsBySeq].filter(([, ids]) => ids.size > 1).map(([seq]) => seq);
  result.replays = writes.filter((w) => w.status === 200).length; // 재전송에 이미 있는 예약이 돌아온 수
  if (marks.restored_max_seq) {
    // RPO: 장애 선언 전 성공한 쓰기 중 복원 DB에 없는 것 = 잃은 쓰기. 시간은 남은 마지막 쓰기부터 장애 선언까지
    const max = +marks.restored_max_seq.value;
    const beforeT0 = writes.filter((w) => w.t < start);
    const kept = beforeT0.filter((w) => w.seq <= max);
    result.rpo = {
      lostWrites: beforeT0.filter((w) => w.seq > max).length,
      sec: kept.length ? (start - kept.at(-1).t) / 1000 : null,
    };
  }
  for (const [name, m] of Object.entries(marks)) if (name !== 'restored_max_seq') result[`mark_${name}`] = (m.t - start) / 1000;
  return result;
}

if (process.argv[2] === '--self-test') {
  // 10초에 장애, 쓰기는 12 · 13초 실패(응답 없음) → 14초 같은 순번 재전송 200, 읽기는 12초 502 하나
  const w = [
    '# run=x',
    '5000\twrite\t1\t201\t50\tap-northeast-2/a/1\tb1',
    '9000\twrite\t2\t201\t60\tap-northeast-2/a/1\tb2',
    '12000\twrite\t3\t0\t5000\t-\t-',
    '13000\twrite\t3\t0\t5000\t-\t-',
    '14000\twrite\t3\t200\t70\tap-northeast-1/a/2\tb3',
    '15000\twrite\t4\t201\t80\tap-northeast-1/a/2\tb4',
    '9500\tread\t-\t200\t40\tap-northeast-2/a/1\t-',
    '12000\tread\t-\t502\t30\t-\t-',
    '12500\tread\t-\t200\t45\tap-northeast-1/a/2\t-',
  ].join('\n');
  const r = analyze(w, 't0 10000\nrestored_max_seq 0 1\nrto_end 14000\n');
  assert.equal(r.write.outageSec, 2);
  assert.equal(r.write.firstErrorSec, 2);
  assert.equal(r.write.errorsAfterStart, 2);
  assert.equal(r.read.outageSec, 0.5);
  assert.equal(r.replays, 1);
  assert.deepEqual(r.duplicateSeqs, []);
  assert.deepEqual(r.rpo, { lostWrites: 1, sec: 5 });
  assert.equal(r.mark_rto_end, 4);
  assert.equal(r.write.regions, 'ap-northeast-2 → ap-northeast-1');
  console.log('self-test ok');
  process.exit(0);
}

const dirs = process.argv.slice(2);
assert.ok(dirs.length, '사용: node scripts/drill-report.mjs <결과 폴더>...');
for (const d of dirs) {
  const r = analyze(readFileSync(join(d, 'writer.log'), 'utf8'), readFileSync(join(d, 'marks.log'), 'utf8'));
  console.log(`\n## ${d}`);
  console.log('| 구분 | 요청 | 시작 뒤 오류 | 첫 오류(초) | 끊김(초) | p95 전 → 후(ms) | 응답한 리전 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const k of ['write', 'read']) {
    const x = r[k];
    console.log(`| ${k === 'write' ? '쓰기(예약)' : '읽기(목록)'} | ${x.total} | ${x.errorsAfterStart} | ${x.firstErrorSec ?? '-'} | ${x.outageSec ?? '끝나지 않음'} | ${x.p95Before} → ${x.p95After} | ${x.regions} |`);
  }
  console.log(`- 중복 예약 순번: ${r.duplicateSeqs.length ? r.duplicateSeqs.join(', ') : '없음'}, 재전송에 같은 예약이 돌아온 수: ${r.replays}`);
  if (r.rpo) console.log(`- RPO: 잃은 쓰기 ${r.rpo.lostWrites}건, 남은 마지막 쓰기 → 장애 선언 ${r.rpo.sec}초`);
  const marks = Object.entries(r).filter(([k]) => k.startsWith('mark_')).map(([k, v]) => `${k.slice(5)} +${v}초`);
  console.log(`- 표시(시작 기준): ${marks.join(', ')}`);
}
