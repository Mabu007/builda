import { randomUUID } from 'node:crypto';
import { verifyUser, respondError } from './_lib/auth.js';
import { signedR2 } from './_lib/r2.js';

const allowedTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const MAX = 15 * 1024 * 1024;
export default async function handler(req, res) {
  try {
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
    const { uid } = await verifyUser(req);
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const name = String(body.name || '').replace(/[^a-zA-Z0-9._ ()-]/g, '_').slice(0, 110);
      const type = String(body.type || '');
      const size = Number(body.size);
      if (!name || name === '.' || name === '..' || !allowedTypes.has(type) || !Number.isInteger(size) || size < 1 || size > MAX) {
        return res.status(400).json({ error: 'Use a PDF, image, Word or Excel file up to 15 MB.' });
      }
      const id = randomUUID();
      const key = 'contractors/' + uid + '/' + id + '/' + name;
      const url = signedR2('PUT', key, type);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ url, id, key, name, type, size, maxBytes: MAX, expiresIn: 300 });
    }
    const key = String(req.query.key || '');
    if (!/^contractors\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/[A-Za-z0-9._ ()-]{1,110}$/.test(key) ||
        !key.startsWith('contractors/' + uid + '/')) return res.status(403).json({ error: 'Document access denied.' });
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ url: signedR2('GET', key) });
    }
    const result = await fetch(signedR2('DELETE', key), { method: 'DELETE', signal: AbortSignal.timeout(8000) });
    if (!result.ok && result.status !== 404) throw Object.assign(new Error('Could not delete document.'), { status: 502 });
    return res.status(200).json({ deleted: true });
  } catch (error) { return respondError(res, error); }
}