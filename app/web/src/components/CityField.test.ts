import { describe, expect, it } from 'vitest';
import { cityOptions } from './CityField';

describe('여행지 목록', () => {
  const cities = ['서울', '제주', '부산', '서귀포'];

  it('이미 지역이 들어 있어도 열 때는 전체 지역을 보여 준다', () => {
    expect(cityOptions(cities, '제주', false)).toEqual(cities);
  });

  it('글자를 고치기 시작하면 그 글자가 들어간 지역만 보여 준다', () => {
    expect(cityOptions(cities, '서', true)).toEqual(['서울', '서귀포']);
    expect(cityOptions(cities, ' ', true)).toEqual(cities);
  });
});
