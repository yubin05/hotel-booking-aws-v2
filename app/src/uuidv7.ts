import { randomBytes } from 'node:crypto';

// UUIDv7(RFC 9562): 앞 48비트가 밀리초 시각이라 만든 순서대로 정렬된다
export function uuidv7(): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // 버전 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 변형
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
