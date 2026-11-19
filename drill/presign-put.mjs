// S3 미리 서명 PUT 주소 (5단계 되돌리기: 도쿄 dump 태스크가 덤프를 올릴 곳). AWS CLI의 s3 presign은 GET만 만들어서 직접 서명한다
//   node drill/presign-put.mjs <s3 GET 미리 서명 주소> <만료 초>   자격 증명은 환경 변수 AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY · AWS_SESSION_TOKEN
//   node drill/presign-put.mjs --self-test                      AWS 문서 예시(미리 서명 GET)와 같은 서명이 나오는지 확인
// 주소 모양(호스트 · 경로 · 리전)은 CLI가 만든 GET 주소에서 그대로 가져와 버킷 이름 규칙을 따로 다루지 않는다
// 서명 방식: AWS Signature Version 4, 쿼리 문자열 인증 (S3 문서 "Authenticating Requests: Using Query Parameters")
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
// RFC 3986: A-Z a-z 0-9 - _ . ~ 만 그대로 (encodeURIComponent는 ! ' ( ) * 를 남김)
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function presign({ method, host, path, region, accessKeyId, secretAccessKey, sessionToken, amzDate, expires }) {
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
    ...(sessionToken && { 'X-Amz-Security-Token': sessionToken }),
  };
  const query = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join('&');
  const canonical = [method, path, query, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = [date, region, 's3', 'aws4_request'].reduce((k, part) => hmac(k, part), `AWS4${secretAccessKey}`);
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}

if (process.argv[2] === '--self-test') {
  // S3 문서 예시: examplebucket/test.txt, us-east-1, 2013-05-24, 86400초 → 서명 aeeed9bb...
  const url = presign({
    method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    amzDate: '20130524T000000Z', expires: 86400,
  });
  assert.equal(new URL(url).searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  console.log('self-test ok');
  process.exit(0);
}

const [getUrl, expires] = process.argv.slice(2);
assert.ok(getUrl && expires, '사용: node drill/presign-put.mjs <s3 GET 미리 서명 주소> <만료 초>');
const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey, AWS_SESSION_TOKEN: sessionToken } = process.env;
assert.ok(accessKeyId && secretAccessKey, '자격 증명 환경 변수가 없음 (aws configure export-credentials --format env)');
const u = new URL(getUrl);
const region = u.searchParams.get('X-Amz-Credential').split('/')[2];
const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
console.log(presign({ method: 'PUT', host: u.host, path: u.pathname, region, accessKeyId, secretAccessKey, sessionToken, amzDate, expires: Number(expires) }));
