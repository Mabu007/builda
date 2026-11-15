import { createHmac, createHash } from 'node:crypto';

const hash = data => createHash('sha256').update(data).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function r2Configured() {
  return ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].every(key => Boolean(process.env[key]));
}
export function signedR2(method, key, type) {
  if (!r2Configured()) throw Object.assign(new Error('Document storage is not configured.'), { status: 503 });
  const account = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-z0-9.-]+$/i.test(bucket)) throw Object.assign(new Error('Document storage configuration is invalid.'), { status: 503 });
  const host = account + '.r2.cloudflarestorage.com';
  const path = '/' + [bucket, ...key.split('/')].map(encode).join('/');
  const now = new Date();
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timestamp = day + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z';
  const scope = day + '/auto/s3/aws4_request';
  const signedHeaders = method === 'PUT' ? 'content-type;host' : 'host';
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': process.env.R2_ACCESS_KEY_ID + '/' + scope,
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': '300',
    'X-Amz-SignedHeaders': signedHeaders
  };
  const query = Object.keys(params).sort().map(k => encode(k) + '=' + encode(params[k])).join('&');
  const headers = method === 'PUT' ? 'content-type:' + type + '\nhost:' + host + '\n' : 'host:' + host + '\n';
  const canonical = [method, path, query, headers, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', timestamp, scope, hash(canonical)].join('\n');
  const secret = Buffer.from('AWS4' + process.env.R2_SECRET_ACCESS_KEY, 'utf8');
  const signingKey = hmac(hmac(hmac(hmac(secret, day), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return 'https://' + host + path + '?' + query + '&X-Amz-Signature=' + signature;
}