// E-02 인기 객실 예약 쏠림: 같은 객실에 310명이 같은 순간 한 번씩 예약 (docs/07-experiments.md)
//  - 같은 날짜 100건: 모두 60일 뒤부터 2박 → 1건만 201, 99건 409
//  - 엇갈린 날짜 100건: 70일 뒤부터 하루씩 밀린 2박 10가지 × 10건 (1~3일, 2~4일 …) → 이웃끼리 하루씩 겹침
//  - 1박 110건: 같은 구간의 밤 11개마다 1박 × 10건 → 2박 사이에 남는 하룻밤을 채움
//    끝나면 구간의 밤 11개가 빈 밤 없이 모두 예약돼야 한다 (빈 밤이 있으면 그 밤의 1박 요청이 들어갔어야 함)
// 준비: docker compose down -v && docker compose up -d --build --wait (교착 카운터도 0부터 센다)
// 실행: load/run-k6.sh e02-popular-room.js
import http from 'k6/http';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL ?? 'http://app:3000';
const HOTEL_ID = '22222222-0000-0000-0000-000000000001'; // 시드 첫 숙소. 이 숙소의 스탠다드 룸 하나에 몰린다
const SAME = 100;
const STAGGER = 100;
const ONE_NIGHT = 110;
const TOTAL = SAME + STAGGER + ONE_NIGHT;
const TAKEN = '해당 날짜에 이미 예약이 있습니다.';

const booked = new Counter('bookings_created');
const sameBooked = new Counter('same_date_booked'); // 같은 날짜 100건 중 성공
const taken = new Counter('bookings_taken'); // 날짜가 겹쳐서 정상 거절(409)
// 그 밖의 모든 응답: 500(교착 등), 연결 오류. 409는 겹친 예약이 커밋된 뒤에만 나오므로 "비었는데 거절"은 여기로만 온다
const unexpected = new Counter('bookings_unexpected');

export const options = {
  setupTimeout: '5m', // 310명 가입 (비밀번호 해시가 느림)
  scenarios: {
    rush: { executor: 'per-vu-iterations', vus: TOTAL, iterations: 1 },
  },
  thresholds: {
    same_date_booked: ['count==1'],
    bookings_unexpected: ['count==0'],
  },
};

// 409(겹친 날짜)는 정상 거절이라 실패율에서 뺀다
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const isoDate = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);

export function setup() {
  const room = http.get(`${BASE}/api/hotels/${HOTEL_ID}`).json('data.rooms').find((r) => r.type === 'standard');
  if (!room) throw new Error(`시드 숙소 ${HOTEL_ID}에 스탠다드 룸이 없습니다`);
  const run = Date.now().toString(36);
  // 가입 응답에 토큰이 들어 있어 로그인은 따로 하지 않는다
  const regs = http.batch(
    Array.from({ length: TOTAL }, (_, i) => [
      'POST',
      `${BASE}/api/auth/register`,
      JSON.stringify({ email: `k6-${run}-${i}@example.com`, password: 'k6-password', name: `k6 ${i}` }),
      { headers: JSON_HEADERS },
    ]),
  );
  const tokens = regs.map((r) => {
    if (r.status !== 201) throw new Error(`가입 실패 ${r.status}: ${r.body}`);
    return r.json('data.token');
  });
  // 날짜는 여기서 한 번만 계산한다 (실행 중 자정을 넘겨도 요청과 검사가 같은 날짜를 쓰게)
  const stays = tokens.map((_, i) => {
    if (i < SAME) return [isoDate(60), isoDate(62)];
    if (i < SAME + STAGGER) {
      const start = 70 + ((i - SAME) % 10);
      return [isoDate(start), isoDate(start + 2)];
    }
    const night = 70 + ((i - SAME - STAGGER) % 11);
    return [isoDate(night), isoDate(night + 1)];
  });
  console.log(`run=k6-${run} 사용자 ${tokens.length}명, 객실 ${room.name} ${room.id}`);
  return { run, roomId: room.id, tokens, stays };
}

// 310명이 같은 순간에 한 번씩 누른다 (사람마다 다른 계정)
export default function (data) {
  const i = exec.scenario.iterationInTest;
  const [checkIn, checkOut] = data.stays[i];
  const same = i < SAME;
  const group = same ? 'same' : i < SAME + STAGGER ? 'stagger' : 'one-night';
  const res = http.post(
    `${BASE}/api/bookings`,
    JSON.stringify({ room_id: data.roomId, check_in_date: checkIn, check_out_date: checkOut, guests: 1 }),
    {
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${data.tokens[i]}`, 'Idempotency-Key': `k6-${data.run}-${i}` },
      tags: { name: 'booking', dates: group },
    },
  );
  const ok = res.status === 201;
  const rejected = res.status === 409 && (res.body ?? '').includes(TAKEN);
  // 0도 넣어야 한 건도 없을 때 요약에 0으로 나온다
  booked.add(ok ? 1 : 0);
  if (same) sameBooked.add(ok ? 1 : 0);
  taken.add(rejected ? 1 : 0);
  unexpected.add(ok || rejected ? 0 : 1);
}
