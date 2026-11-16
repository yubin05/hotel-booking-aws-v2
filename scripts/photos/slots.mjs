// 사진 칸 목록 (ADR-055). 앱 저장소의 시드 SQL이 같은 키로 주소를 만든다
//   숙소 0001~0010: 시드(seed.sql), 객실 3개
//   숙소 0011~1010: 운영 규모(seed-volume.sql의 n = 1~1000, 번호 = n + 10), 객실 5개
// 숙소마다 사진 2장, 객실마다 1장. 그림은 원본 11장을 돌려 쓰되 파일 · 주소는 칸마다 따로
export const SIZES = [640, 1200];
export const SOURCES = 11;
export const HOTELS = 1010;

const pad = (n) => String(n).padStart(4, '0');

// [S3 키(크기 · 확장자 제외), 원본 번호]
export function slots() {
  const out = [];
  for (let h = 1; h <= HOTELS; h++) {
    out.push([`hotels/${pad(h)}/1`, h % SOURCES], [`hotels/${pad(h)}/2`, (h + 4) % SOURCES]);
    const rooms = h <= 10 ? 3 : 5;
    for (let k = 1; k <= rooms; k++) out.push([`rooms/${pad(h)}/${k}`, (h + k) % SOURCES]);
  }
  return out;
}
