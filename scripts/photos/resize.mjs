// 원본 originals/00.jpg ~ 10.jpg → out/src/<번호>/<크기>.webp, 그리고 전체 용량 계산
// 실행: npm run resize
import { mkdir, stat } from 'node:fs/promises';
import sharp from 'sharp';
import { SIZES, SOURCES, slots } from './slots.mjs';

const name = (i) => String(i).padStart(2, '0');
const bytes = {}; // bytes[원본][크기]

for (let i = 0; i < SOURCES; i++) {
  // 페이지에서 오른쪽 클릭으로 저장하면 화면용 작은 미리보기(AVIF)가 받아짐 → 큰 판이 흐려지므로 멈춤
  const meta = await sharp(`originals/${name(i)}.jpg`).metadata();
  const [maxW, maxH] = [SIZES.at(-1), Math.round((SIZES.at(-1) * 2) / 3)];
  if (meta.width < maxW || meta.height < maxH) {
    throw new Error(`originals/${name(i)}.jpg가 ${meta.width}x${meta.height}로 ${maxW}x${maxH}보다 작음: 사진 페이지의 Download 버튼으로 다시 받기`);
  }
  await mkdir(`out/src/${name(i)}`, { recursive: true });
  bytes[i] = {};
  for (const w of SIZES) {
    const file = `out/src/${name(i)}/${w}.webp`;
    // 3:2로 가운데를 잘라 맞춤: 원본 대부분이 3:2이고 화면 칸은 모두 가로형이라, 세로 사진을 통째로 보내면 잘릴 부분까지 전송함
    // 메타데이터(촬영 기기 · 위치)는 sharp 기본값대로 지움. 원본보다 키우지 않음
    await sharp(`originals/${name(i)}.jpg`)
      .resize({ width: w, height: Math.round((w * 2) / 3), fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(file);
    bytes[i][w] = (await stat(file)).size;
  }
  const src = (await stat(`originals/${name(i)}.jpg`)).size;
  console.log(`${name(i)}: 원본 ${(src / 1024).toFixed(0)}KB → ${SIZES.map((w) => `${w} ${(bytes[i][w] / 1024).toFixed(0)}KB`).join(', ')}`);
}

const all = slots();
const total = all.reduce((sum, [, i]) => sum + SIZES.reduce((s, w) => s + bytes[i][w], 0), 0);
console.log(`사진 칸 ${all.length}개 × ${SIZES.length}크기 = 파일 ${all.length * SIZES.length}개, 리전당 ${(total / 1024 ** 3).toFixed(2)}GB`);
