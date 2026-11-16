// 올릴 폴더 만들기: out/upload/<S3 키>/<크기>.webp 를 사진 칸마다 (ADR-055)
// 내용이 같은 복사본 14,100개라 하드 링크(같은 파일에 이름만 여러 개)로 디스크를 거의 안 씀
// 실행: npm run resize 다음 npm run stage, 그다음 README의 aws s3 sync
import { existsSync } from 'node:fs';
import { link, mkdir, rm } from 'node:fs/promises';
import { SIZES, slots } from './slots.mjs';

const name = (i) => String(i).padStart(2, '0');

for (let i = 0; i < 11; i++) {
  for (const w of SIZES) {
    if (!existsSync(`out/src/${name(i)}/${w}.webp`)) throw new Error(`out/src/${name(i)}/${w}.webp 없음: npm run resize 먼저`);
  }
}

await rm('out/upload', { recursive: true, force: true }); // 이 스크립트가 만든 폴더만 다시 만듦
let files = 0;
for (const [key, i] of slots()) {
  await mkdir(`out/upload/${key}`, { recursive: true });
  for (const w of SIZES) {
    await link(`out/src/${name(i)}/${w}.webp`, `out/upload/${key}/${w}.webp`);
    files++;
  }
}
console.log(`out/upload: 파일 ${files}개`);
