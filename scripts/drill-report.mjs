// 4 · 5단계 드릴 결과 한 장 (docs/experiments/faults.md · region-drill.md)
//   node scripts/drill-report.mjs <결과 폴더>...   폴더마다 writer.log(drill/writer.mjs) + marks.log(스크립트가 남긴 시각)
//   node scripts/drill-report.mjs --self-test
// marks.log 한 줄: <이름> <epoch_ms> [값]. 시작 표시는 inject(4단계) 또는 t0(5단계 장애 선언), restored_max_seq는 도쿄에 남은 가장 큰 순번
// 손님 기준(서버 지표가 아니라 손님이 받은 응답): 2xx만 성공. 409(겹침)는 응답은 왔으므로 끊김에서는 성공 쪽, 오류 수에는 따로 셈
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

// 응답 분류 (2026-11-20 추가): 업무상 거절(409)과 서버 장애를 섞지 않는다. 401은 다시 로그인해야 하는 상태, 403 · 429는 WAF 등
const CATS = ['ok', 'c409', 'c401', 'c4xx', 'c5xx', 'none'];
const cat = (s) => (s >= 200 && s < 300 ? 'ok' : s === 409 ? 'c409' : s === 401 ? 'c401' : s >= 400 && s < 500 ? 'c4xx' : s >= 500 ? 'c5xx' : 'none');
const usable = (r) => cat(r.status) === 'ok' || r.status === 409; // 손님이 쓸 수 있었던 응답(새 판정): 2xx · 409만

// ECS 서비스 이벤트(events.txt)에서 주입 뒤 처음 나온 대체 태스크 시작 · ALB 등록 시각
function ecsEvents(eventsText, start) {
  const evs = (eventsText ?? '').split('\n').map((l) => l.match(/^(\d{4}-\d\d-\d\dT[\d:.]+[+-]\d\d:\d\d)\t(.*)$/)).filter(Boolean)
    .map(([, ts, msg]) => ({ t: Date.parse(ts), msg })).filter((e) => e.t >= start).sort((a, b) => a.t - b.t);
  const first = (re) => evs.find((e) => re.test(e.msg))?.t;
  return { taskStarted: first(/has started \d+ tasks/), targetRegistered: first(/(?<!de)registered \d+ targets/) };
}

export function analyze(writerText, marksText, eventsText) {
  const rows = writerText.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
    const [t, kind, seq, status, ms, servedBy, id] = l.split('\t');
    // t는 응답을 받은(또는 5초 시간 초과로 포기한) 시각이라, 요청을 보낸 시각 s = t - ms도 둔다
    return { t: +t, s: +t - +ms, kind, seq: seq === '-' ? null : +seq, status: +status, ms: +ms, region: servedBy.split('/')[0], id };
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
    // 새 판정 (2026-11-20): 요청을 보낸 시각 기준, 2xx · 409만 "쓸 수 있었음". 기존 값(위)은 그대로 둔다
    const sent = [...after].sort((a, b) => a.s - b.s);
    const counts = Object.fromEntries(CATS.map((c) => [c, sent.filter((r) => cat(r.status) === c).length]));
    const bad = sent.filter((r) => !usable(r));
    const lastBadS = bad.at(-1)?.s;
    const back = bad.length ? sent.find((r) => r.s > lastBadS && usable(r)) : null; // 이 뒤로는 기록 끝까지 실패 0
    const gaps = sent.slice(1).map((r, i) => r.s - sent[i].s);
    const lastT = xs.length ? Math.max(...xs.map((r) => r.t)) : null;
    const backS = back ? back.s : start; // 장애 중 = 시작 표시 ~ 정상화 (실패가 없으면 없음)
    result[kind].user = {
      measured: sent.length > 0, // 기록기가 장애 뒤에 요청을 하나도 못 남겼으면 "미측정" (오류 0건과 구분)
      counts,
      failedSent: bad.length,
      firstFailSec: bad.length ? (bad[0].s - start) / 1000 : null,
      recoverySec: !sent.length ? null : back ? (back.s - start) / 1000 : bad.length ? null : 0, // null: 기록 끝까지 회복 못 봄
      watchedAfterSec: back ? (lastT - back.t) / 1000 : null, // 정상화 뒤 실패 없이 지켜본 시간
      maxGapSec: gaps.length ? Math.max(...gaps) / 1000 : null, // 같은 종류 요청 사이 최대 공백(응답을 기다린 시간 포함)
      p95: {
        before: pct(xs.filter((r) => r.s < start && usable(r)).map((r) => r.ms), 95),
        during: pct(sent.filter((r) => r.s >= start && r.s < backS && usable(r)).map((r) => r.ms), 95),
        after: pct(sent.filter((r) => r.s >= backS && usable(r)).map((r) => r.ms), 95),
      },
    };
  }
  const ev = ecsEvents(eventsText, start);
  result.ecs = Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v == null ? null : (v - start) / 1000]));
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
  // 새 판정: 대상은 기존과 같이 시작 표시 뒤에 응답이 온(또는 포기한) 요청, 시각은 보낸 시각. 시간 초과 둘은 7 · 8초에 보냄(장애 전에 보낸 요청이 걸림 → 음수)
  assert.equal(r.write.user.failedSent, 2);
  assert.equal(r.write.user.firstFailSec, -3);
  assert.equal(r.write.user.recoverySec, 3.93); // 13.93초에 보낸 재전송이 성공, 그 뒤 실패 없음
  assert.equal(r.write.user.watchedAfterSec, 1);
  // 읽기: 502는 12000 - 30 = 11970에 보냄 → 장애 뒤 실패 1, 다음 성공(12455 보냄)에서 정상화, 그 뒤 기록 끝까지 관측
  assert.deepEqual(r.read.user.counts, { ok: 1, c409: 0, c401: 0, c4xx: 0, c5xx: 1, none: 0 });
  assert.equal(r.read.user.recoverySec, 2.455);
  assert.equal(r.read.user.measured, true);
  // 실패가 없으면 0, 장애 뒤 요청이 없으면 미측정(null)
  const quiet = analyze('9000\tread\t-\t200\t40\tx/a/1\t-\n11000\tread\t-\t200\t40\tx/a/1\t-\n', 'inject 10000\n');
  assert.equal(quiet.read.user.recoverySec, 0);
  assert.equal(analyze('9000\tread\t-\t200\t40\tx/a/1\t-\n', 'inject 10000\n').read.user.measured, false);
  // 409는 업무상 거절이라 실패가 아님, 403(WAF)은 실패
  const waf = analyze('11000\twrite\t1\t409\t40\tx/a/1\t-\n12000\twrite\t2\t403\t40\t-\t-\n13000\twrite\t2\t201\t40\tx/a/1\tb\n', 'inject 10000\n');
  assert.equal(waf.write.user.failedSent, 1);
  assert.equal(waf.write.user.recoverySec, 2.96);
  // ECS 이벤트: 주입 뒤 처음 시작 · 등록 (deregistered는 등록이 아님)
  const e = analyze('11000\tread\t-\t200\t40\tx/a/1\t-\n', 'inject 1795173289008\n',
    '2026-11-20T20:16:01.013000+09:00\t(service app) registered 1 targets in (tg)\n2026-11-20T20:15:32.088000+09:00\t(service app) has started 1 tasks: (task c)\n2026-11-20T20:15:31.412000+09:00\t(service app) deregistered 1 targets in (tg)\n');
  assert.equal(e.ecs.taskStarted, 43.08);
  assert.equal(e.ecs.targetRegistered, 72.005);
  console.log('self-test ok');
  process.exit(0);
}

const dirs = process.argv.slice(2);
assert.ok(dirs.length, '사용: node scripts/drill-report.mjs <결과 폴더>...');
for (const d of dirs) {
  const ev = existsSync(join(d, 'events.txt')) ? readFileSync(join(d, 'events.txt'), 'utf8') : '';
  const r = analyze(readFileSync(join(d, 'writer.log'), 'utf8'), readFileSync(join(d, 'marks.log'), 'utf8'), ev);
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
  // 새 판정 (2026-11-20): 보낸 시각 기준, 2xx · 409만 쓸 수 있었던 응답. 인프라 회복(표시)과 손님 회복을 나란히
  const sec = (v) => (v == null ? '-' : `+${v}초`);
  console.log('\n| 손님 쪽 (새 판정) | 장애 뒤 요청 | 2xx | 409 | 401 | 그 밖 4xx | 5xx | 응답 없음 | 첫 실패 | 정상화 | 정상화 뒤 실패 0으로 본 시간 | 요청 사이 최대 공백 | p95 전 → 중 → 후(ms) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of ['write', 'read']) {
    const u = r[k].user;
    const c = u.counts;
    const rec = !u.measured ? '미측정' : u.recoverySec === 0 ? '측정 조건에서 실패 0건' : u.recoverySec == null ? '기록 끝까지 못 봄' : sec(u.recoverySec);
    console.log(`| ${k === 'write' ? '쓰기(예약, 1초마다)' : '읽기(목록, 0.25초마다)'} | ${c.ok + c.c409 + c.c401 + c.c4xx + c.c5xx + c.none} | ${c.ok} | ${c.c409} | ${c.c401} | ${c.c4xx} | ${c.c5xx} | ${c.none} | ${sec(u.firstFailSec)} | ${rec} | ${u.watchedAfterSec ?? '-'}초 | ${u.maxGapSec ?? '-'}초 | ${u.p95.before ?? '-'} → ${u.p95.during ?? '-'} → ${u.p95.after ?? '-'} |`);
  }
  const infra = r.mark_recovered ?? r.mark_failover_completed;
  console.log(`- 회복 순서(주입 기준): ECS 대체 태스크 시작 ${sec(r.ecs.taskStarted)} → ALB 대상 등록 ${sec(r.ecs.targetRegistered)} → 인프라 회복 표시 ${sec(infra)} → 손님 쓰기 정상화 ${r.write.user.measured ? (r.write.user.recoverySec === 0 ? '실패 없음' : sec(r.write.user.recoverySec)) : '미측정'}`);
  console.log('- 해상도: 손님 요청은 보낸 시각 기준(쓰기 1초 · 읽기 0.25초 간격, 응답을 최대 5초 기다려 그동안 다음 요청이 밀림), 인프라 표시는 3초마다 확인 + aws 호출 시간, ECS 이벤트는 AWS가 남긴 시각(ms)');
}
