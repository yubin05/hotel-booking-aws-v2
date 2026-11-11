import { describe, expect, it } from 'vitest';
import { ApiError, withRetry } from './api';

// 매번 정해 둔 결과를 차례로 돌려주는 가짜 요청. 몇 번 보냈는지 센다
function fake(results: (unknown | Error)[]) {
  let calls = 0;
  const send = async () => {
    const r = results[calls++];
    if (r instanceof Error) throw r;
    return r;
  };
  return { send, calls: () => calls };
}

describe('withRetry (결과를 모르는 실패만 같은 요청으로 다시 보냄)', () => {
  it('503(시간 초과)이면 다시 보내고, 두 번째에 성공하면 그 결과를 돌려준다', async () => {
    const f = fake([new ApiError(503, '지금은 처리할 수 없습니다.'), { id: 'b1' }]);
    await expect(withRetry(f.send, [0, 0])).resolves.toEqual({ id: 'b1' });
    expect(f.calls()).toBe(2);
  });

  it('연결 자체가 실패해도(fetch의 TypeError) 다시 보낸다', async () => {
    const f = fake([new TypeError('Failed to fetch'), { id: 'b1' }]);
    await expect(withRetry(f.send, [0, 0])).resolves.toEqual({ id: 'b1' });
    expect(f.calls()).toBe(2);
  });

  it('409(이미 예약된 날짜) 같은 확실한 거절은 다시 보내지 않는다', async () => {
    const f = fake([new ApiError(409, '이미 예약된 날짜입니다.'), { id: 'b1' }]);
    await expect(withRetry(f.send, [0, 0])).rejects.toMatchObject({ status: 409 });
    expect(f.calls()).toBe(1);
  });

  it('정한 횟수만큼 다시 보내도 안 되면 마지막 오류를 그대로 알린다', async () => {
    const f = fake([new ApiError(503, '1'), new ApiError(503, '2'), new ApiError(503, '3'), { id: 'b1' }]);
    await expect(withRetry(f.send, [0, 0])).rejects.toMatchObject({ status: 503, message: '3' });
    expect(f.calls()).toBe(3);
  });
});
