import { createVerify } from 'node:crypto';

const issuer = 'https://securetoken.google.com/';
let cachedCerts = null;
let refreshAt = 0;

async function googleCerts() {
  if (cachedCerts && Date.now() < refreshAt) return cachedCerts;
  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Unable to validate authentication.');
  const certs = await response.json();
  const ttl = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 900);
  cachedCerts = certs;
  refreshAt = Date.now() + Math.min(ttl, 3600) * 1000;
  return certs;
}
function decode(input) {
  return JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
}
export async function verifyUser(req) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw Object.assign(new Error('Firebase project is not configured.'), { status: 503 });
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!token) throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 16000) throw Object.assign(new Error('Invalid session.'), { status: 401 });
  let header, payload;
  try { header = decode(parts[0]); payload = decode(parts[1]); }
  catch { throw Object.assign(new Error('Invalid session.'), { status: 401 }); }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      payload.aud !== projectId || payload.iss !== issuer + projectId ||
      typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 ||
      typeof payload.exp !== 'number' || payload.exp <= now ||
      typeof payload.iat !== 'number' || payload.iat > now + 30 ||
      typeof payload.auth_time !== 'number' || payload.auth_time > now + 30) {
    throw Object.assign(new Error('Invalid or expired session.'), { status: 401 });
  }
  const cert = (await googleCerts())[header.kid];
  if (!cert) throw Object.assign(new Error('Session key not recognised.'), { status: 401 });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(parts[0] + '.' + parts[1]);
  verifier.end();
  if (!verifier.verify(cert, Buffer.from(parts[2], 'base64url'))) throw Object.assign(new Error('Invalid session signature.'), { status: 401 });
  return { uid: payload.sub, email: payload.email || '' };
}
export function respondError(res, error) {
  const status = Number(error?.status) || 500;
  const safe = status >= 500 ? 'The service is temporarily unavailable.' : String(error?.message || 'Request rejected.');
  return res.status(status).json({ error: safe });
}
export function only(req, res, method) {
  if (req.method !== method) { res.setHeader('Allow', method); res.status(405).json({ error: 'Method not allowed.' }); return false; }
  return true;
}