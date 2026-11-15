import { verifyUser, respondError, only } from './_lib/auth.js';

const endpoint = 'https://ocds-api.etenders.gov.za/api/OCDSReleases';
const cache = new Map();
const asText = (v, max = 4000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const safeUrl = (v) => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
export function normalize(release) {
  const t = release?.tender;
  if (!t || (!t.title && !t.description)) return null;
  const ocid = asText(release.ocid, 180);
  if (!ocid) return null;
  const docs = (Array.isArray(t.documents) ? t.documents : []).slice(0, 12).map(d => ({ title: asText(d.title || d.documentType || 'Tender document', 160), url: safeUrl(d.url) })).filter(d => d.url);
  return {
    id: ocid, reference: asText(t.id || release.id, 150), title: asText(t.title || t.description, 280),
    description: asText(t.description || release.description, 5000), buyer: asText(release.buyer?.name || t.procuringEntity?.name || 'Not specified', 200),
    province: asText(t.province || t.deliveryLocation || 'Not specified', 120),
    category: asText(t.category || t.mainProcurementCategory || 'Not specified', 120),
    status: asText(t.status, 60), publishedAt: asText(release.date, 60),
    closesAt: asText(t.tenderPeriod?.endDate, 60),
    briefing: t.briefingSession?.isSession ? { date: asText(t.briefingSession.date, 80), venue: asText(t.briefingSession.venue, 300), compulsory: Boolean(t.briefingSession.compulsory) } : null,
    eligibility: asText(t.eligibilityCriteria, 4000), specialConditions: asText(t.specialConditions, 4000),
    submission: asText(t.submissionMethodDetails, 1000),
    value: typeof t.value?.amount === 'number' ? t.value.amount : null,
    currency: asText(t.value?.currency, 6), documents: docs,
    source: 'National Treasury eTenders OCDS',
    sourceUrl: safeUrl(t.communication?.atypicalToolUrl) || 'https://ocds-api.etenders.gov.za/api/OCDSReleases/release/' + encodeURIComponent(ocid)
  };
}
export default async function handler(req, res) {
  if (!only(req, res, 'GET')) return;
  try {
    await verifyUser(req);
    const page = Math.max(1, Math.min(40, Number.parseInt(String(req.query.page || '1'), 10) || 1));
    const days = Math.max(7, Math.min(120, Number.parseInt(String(req.query.days || '60'), 10) || 60));
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const dateTo = new Date().toISOString().slice(0, 10);
    const key = [page, days, dateTo].join(':');
    const existing = cache.get(key);
    if (existing && Date.now() - existing.time < 300000) return res.status(200).json(existing.data);
    const url = new URL(endpoint);
    url.searchParams.set('PageNumber', String(page));
    url.searchParams.set('PageSize', '250');
    url.searchParams.set('dateFrom', dateFrom);
    url.searchParams.set('dateTo', dateTo);
    const upstream = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(16000) });
    if (!upstream.ok) throw Object.assign(new Error('Government data feed unavailable.'), { status: 502 });
    const payload = await upstream.json();
    if (!Array.isArray(payload.releases)) throw Object.assign(new Error('Unexpected government data format.'), { status: 502 });
    const unique = new Map();
    for (const raw of payload.releases) {
      const item = normalize(raw);
      if (!item) continue;
      const prior = unique.get(item.id);
      if (!prior || item.publishedAt > prior.publishedAt) unique.set(item.id, item);
    }
    const items = [...unique.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const data = { items, page, pageSize: 250, hasMore: page < 40 && (payload.releases.length === 250 || Boolean(payload.links?.next)),
      updatedAt: new Date().toISOString(), source: 'National Treasury Transparency Portal (OCDS)',
      coverage: 'Recent published releases, not the complete tender database. Verify deadlines and documents with the issuing authority.' };
    cache.set(key, { time: Date.now(), data });
    if (cache.size > 90) cache.clear();
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    return res.status(200).json(data);
  } catch (error) { return respondError(res, error); }
}