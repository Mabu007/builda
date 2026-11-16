import { verifyUser, only } from './_lib/auth.js';
import { allowedModels } from './models.js';
import { completeAI, DEFAULT_MODEL, respondAIError } from './_lib/openrouter.js';
import { buildMessages } from './assistant.js';

const calls = new Map();
export default async function handler(req, res) {
  if (!only(req, res, 'POST')) return;
  try {
    const { uid } = await verifyUser(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 36000) throw Object.assign(new Error('The request is too large.'), { status: 400 });
    if (!body.tender || typeof body.tender !== 'object' || !body.tender.title) {
      throw Object.assign(new Error('Select an opportunity first.'), { status: 400 });
    }
    const now = Date.now();
    const times = (calls.get(uid) || []).filter(t => now - t < 60000);
    if (times.length >= 6) throw Object.assign(new Error('Too many AI requests. Please retry shortly.'), { status: 429 });
    times.push(now); calls.set(uid, times); if (calls.size > 1800) calls.clear();
    const model = String(body.model || DEFAULT_MODEL).slice(0, 120);
    if (!(await allowedModels()).some(m => m.id === model)) throw Object.assign(new Error('Choose an available model in Settings.'), { status: 400 });
    const messages = buildMessages({
      company: body.company, documents: body.documents, tender: body.tender,
      messages: [{ role: 'user', content: 'Decode this selected opportunity for my organisation. Explain what is requested, possible fit, gaps, documents required where stated, deadlines, and practical next actions. Distinguish confirmed facts from things I need to verify.' }]
    });
    const result = await completeAI({ model, messages, maxTokens: 850 });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ ...result, disclaimer: 'AI-assisted explanation. Verify original notice documents and eligibility.' });
  } catch (error) { return respondAIError(res, error); }
}
