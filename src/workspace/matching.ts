/**
 * Deterministic, explainable matching over only the notices currently loaded.
 * Ranking is a relevance hint, NEVER eligibility verification or a probability.
 */
type TenderCandidate = {
  title?: string; description?: string; category?: string; province?: string;
  eligibility?: string; specialConditions?: string; closesAt?: string;
};
type CompanyDetails = Record<string, string>;
const serviceGroups: { name: string; terms: string[] }[] = [
  { name: 'building', terms: ['building', 'renovation', 'refurbishment', 'alterations', 'building works'] },
  { name: 'civil engineering', terms: ['civil', 'roads', 'roadwork', 'bridge', 'stormwater', 'infrastructure', 'earthworks', 'sewer', 'water pipeline'] },
  { name: 'electrical', terms: ['electrical', 'wiring', 'lighting', 'power installation', 'substation', 'solar'] },
  { name: 'plumbing', terms: ['plumbing', 'sanitation', 'drainage', 'pipes', 'water supply'] },
  { name: 'roofing', terms: ['roofing', 'roof repairs', 'waterproofing', 'roof installation'] },
  { name: 'painting', terms: ['painting', 'painting works', 'coating'] },
  { name: 'paving', terms: ['paving', 'surfacing', 'asphalt', 'tar road'] },
  { name: 'landscaping', terms: ['landscaping', 'gardening', 'grounds maintenance', 'vegetation'] },
  { name: 'mechanical', terms: ['mechanical', 'hvac', 'air conditioning', 'ventilation', 'plant maintenance'] },
  { name: 'supply', terms: ['construction supply', 'building materials', 'material supply', 'hardware supply'] },
];
const provinces = ['gauteng','western cape','kwazulu-natal','eastern cape','free state','limpopo','mpumalanga','northern cape','north west'];
function groupsFrom(text: string) { const normalized = text.toLowerCase(); return serviceGroups.filter(g => g.terms.some(term => normalized.includes(term))).map(g => g.name); }
export function hasMatchingProfile(profile: CompanyDetails) {
  return Boolean((profile.category || profile.services || profile.description || '').trim() && (profile.province || profile.coverage || profile.city || '').trim());
}
function cidbGrade(text: string) { const m = /(?:cidb[^\d]{0,35})?(\d)\s*(GB|CE|EB|EP|ME|SO|SH|SQ)/i.exec(text); return m ? { grade: Number(m[1]), classCode: m[2].toUpperCase() } : null; }
export function matchTender(tender: TenderCandidate, profile: CompanyDetails) {
  if (!hasMatchingProfile(profile)) return { score: 0, label: 'Complete profile', reasons: [] as string[], warning: '' };
  const profileText = [profile.category, profile.services, profile.description].filter(Boolean).join(' ');
  const noticeText = [tender.title, tender.description?.slice(0, 2000), tender.category].filter(Boolean).join(' ');
  const capabilities = groupsFrom(profileText);
  const required = groupsFrom(noticeText);
  const overlapping = required.filter(term => capabilities.includes(term));
  const reasons: string[] = [];
  let score = 22;
  if (overlapping.length) { score += 43; reasons.push('Services: ' + overlapping.join(', ')); }
  else if (required.length) { score -= 6; reasons.push('Service fit needs review'); }
  else reasons.push('Published service category is unclear');

  const locations = [profile.province, profile.coverage, profile.city].filter(Boolean).join(' ').toLowerCase();
  const nationally = /nationwide|national|south africa|all provinces|across the country/.test(locations);
  const noticeLocation = (tender.province || '').toLowerCase();
  const normalizeLocation = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const listedProvinces = provinces.filter(p => normalizeLocation(noticeLocation).includes(normalizeLocation(p)));
  if (listedProvinces.length === 0) { reasons.push('Location not confirmed'); }
  else if (nationally) { score += 15; reasons.push('Nationwide coverage declared'); }
  else if (listedProvinces.some(p => normalizeLocation(locations).includes(normalizeLocation(p)))) { score += 19; reasons.push('Works in your stated service area'); }
  else { score -= 10; reasons.push('Outside your stated province — verify coverage'); }

  const closes = tender.closesAt ? new Date(tender.closesAt) : null;
  if (closes && !Number.isNaN(closes.getTime()) && closes.getTime() > Date.now()) { score += 9; reasons.push('Tender deadline appears open'); }
  const asked = cidbGrade([tender.eligibility, tender.specialConditions, tender.description?.slice(0, 1500)].filter(Boolean).join(' '));
  const held = cidbGrade(profile.cidb || '');
  let warning = '';
  if (asked && held && asked.classCode === held.classCode) {
    if (held.grade >= asked.grade) { score += 7; reasons.push('Declared CIDB grade may meet the stated minimum'); }
    else { score -= 30; warning = 'Published CIDB grade may exceed your declared grade. Confirm tender requirements.'; }
  } else if (asked) { warning = 'A CIDB classification is mentioned. Independently verify all grading and registration requirements.'; }
  if (!overlapping.length && required.length) score = Math.min(score, 38);
  score = Math.max(0, Math.min(95, score));
  return {
    score,
    label: score >= 70 ? 'Strong alignment' : score >= 52 ? 'Worth reviewing' : 'Review fit',
    reasons,
    warning,
  };
}
