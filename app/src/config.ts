function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name}이(가) 필요합니다.`);
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'app',
    password: required('DB_PASSWORD'),
    name: process.env.DB_NAME || 'hotel_booking',
  },
  jwtSecret: required('JWT_SECRET'),
};
