import { verifyUser, respondError, only } from './_lib/auth.js';

let saved = null;
let savedAt = 0;
const fallback = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' }
];
export async function allowedModels() {
  if (saved && Date.now() - savedAt < 3600000) return saved;
  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(9000) });
    if (!upstream.ok) throw new Error('Model catalogue unavailable.');
    const list = (await upstream.json()).data;
    if (!Array.isArray(list)) throw new Error('Unexpected model catalogue.');
    const models = list.filter(m => typeof m.id === 'string' && m.id.includes('/') &&
      m.pricing && m.pricing.prompt != null && m.pricing.completion != null)
      .map(m => ({ id: m.id, name: String(m.name || m.id).slice(0, 100),
        promptPrice: Number(m.pricing.prompt), completionPrice: Number(m.pricing.completion) }))
      .filter(m => Number.isFinite(m.promptPrice) && Number.isFinite(m.completionPrice) &&
        m.promptPrice >= 0 && m.completionPrice >= 0 &&
        m.promptPrice + m.completionPrice <= 0.000005)
      .sort((a, b) => a.promptPrice + a.completionPrice - b.promptPrice - b.completionPrice || a.name.localeCompare(b.name));
    if (!models.length) throw new Error('No economical models found.');
    // The default and reliable lower-cost models must remain selectable even when
    // the catalogue contains more than 120 free-preview entries.
    const pinned = new Set(['openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat']);
    const priorities = models.filter(m => pinned.has(m.id));
    saved = [...new Map([...priorities, ...models].map(m => [m.id, m])).values()].slice(0, 120);
    savedAt = Date.now();
  } catch { saved = fallback; savedAt = Date.now(); }
  return saved;
}
export default async function handler(req, res) {
  if (!only(req, res, 'GET')) return;
  try {
    await verifyUser(req);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ models: await allowedModels() });
  } catch (error) { return respondError(res, error); }
}
