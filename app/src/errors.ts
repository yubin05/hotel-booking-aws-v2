// 핸들러에서 던지면 app.ts의 에러 처리기가 이 상태 코드로 응답한다
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
