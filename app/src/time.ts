// shortcut: 한국 숙소만 있다고 보고 날짜·시각을 KST(+09:00)로 계산한다. 해외 숙소가 생기면 숙소별 시간대를 저장한다
const KST_OFFSET_MS = 9 * 3_600_000;

export function kstToday(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// DB의 DATETIME은 UTC로 저장한다. 화면이 시간대를 헷갈리지 않도록 ISO 형식(Z)으로 내보낸다
export function utcIso(datetime: string): string {
  return `${datetime.replace(' ', 'T')}Z`;
}
