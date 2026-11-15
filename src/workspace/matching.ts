/**
 * Explainable relevance ranking for *all* business sectors, over loaded OCDS notices.
 * A score indicates possible topic/location alignment only: NOT verified eligibility.
 */
type TenderCandidate = {
  title?: string; description?: string; category?: string; province?: string;
  eligibility?: string; specialConditions?: string; closesAt?: string;
};
type CompanyDetails = Record<string, string>;
const clusters: { name: string; phrases: string[] }[] = [
  { name: 'construction', phrases: ['construction', 'building', 'renovation', 'refurbishment', 'civil engineering', 'building works'] },
  { name: 'roads & infrastructure', phrases: ['roads', 'asphalt', 'bridge', 'stormwater', 'earthworks', 'paving', 'road maintenance', 'infrastructure'] },
  { name: 'electrical', phrases: ['electrical', 'wiring', 'lighting', 'substation', 'solar power', 'electrical installation'] },
  { name: 'plumbing', phrases: ['plumbing', 'sanitation', 'drainage', 'sewer', 'water pipeline'] },
  { name: 'roofing', phrases: ['roofing', 'waterproofing', 'roof repairs'] },
  { name: 'painting', phrases: ['painting', 'coating', 'paint work'] },
  { name: 'landscaping', phrases: ['landscaping', 'gardening', 'grounds maintenance', 'vegetation clearing'] },
  { name: 'mechanical & HVAC', phrases: ['mechanical', 'hvac', 'air conditioning', 'ventilation', 'plant maintenance'] },
  { name: 'IT & software', phrases: ['information technology', 'ict', 'computer', 'software', 'web development', 'cybersecurity', 'networking', 'cloud computing', 'digital services'] },
  { name: 'security', phrases: ['security', 'guarding', 'surveillance', 'access control', 'cctv'] },
  { name: 'cleaning', phrases: ['cleaning', 'hygiene', 'janitorial', 'sanitation services', 'waste collection', 'pest control'] },
  { name: 'transport & logistics', phrases: ['logistics', 'freight', 'delivery', 'transport', 'courier', 'distribution', 'fleet management'] },
  { name: 'professional services', phrases: ['consulting', 'audit', 'accounting', 'legal services', 'advisory', 'professional services', 'engineering services'] },
  { name: 'training & education', phrases: ['training', 'education', 'learning', 'skills development', 'facilitation', 'workshop', 'curriculum'] },
  { name: 'healthcare', phrases: ['healthcare', 'medical', 'hospital', 'clinical', 'pharmaceutical', 'health services'] },
  { name: 'catering', phrases: ['catering', 'food supply', 'meals', 'hospitality', 'accommodation', 'events'] },
  { name: 'agriculture', phrases: ['agriculture', 'farming', 'livestock', 'irrigation', 'agricultural'] },
  { name: 'manufacturing & supply', phrases: ['manufacturing', 'industrial supply', 'equipment supply', 'material supply', 'procurement of goods'] },
  { name: 'marketing & media', phrases: ['marketing', 'advertising', 'graphic design', 'branding', 'media', 'public relations', 'communications'] },
  { name: 'social development', phrases: ['nonprofit', 'social services', 'community development', 'social development', 'youth development', 'social work'] }
];
const stop = new Set(['services','service','provision','providing','supply','supplies','business','contract','contracts','tender','tenders','company','companies','projects','project','requirements','required','government','national','municipality','department','including','support','general','professional','management','maintenance','invitation','period','years','works','goods','south','africa','province','delivery','appointment','provider','providers','request','proposal','various','within','areas','specified','appointment','term','once','under','with','from','this','that','will','have','your','their','more','than','such']);
const provinces = ['gauteng','western cape','kwazulu-natal','eastern cape','free state','limpopo','mpumalanga','northern cape','north west'];
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function clustersFor(text: string) {
  const cleaned = ' ' + norm(text) + ' ';
  return clusters.filter(c => c.phrases.some(p => cleaned.includes(' ' + norm(p) + ' '))).map(c => c.name);
}
function keywords(text: string) {
  return [...new Set(norm(text).split(' ').filter(word => word.length > 4 && !stop.has(word)))].slice(0, 45);
}
export function hasMatchingProfile(profile: CompanyDetails) {
  return Boolean([profile.category, profile.services, profile.description].some(value => String(value || '').trim())
    && [profile.province, profile.coverage, profile.city].some(value => String(value || '').trim()));
}
function cidbGrade(text: string) {
  const m = /(?:cidb[^\d]{0,35})?(\d)\s*(GB|CE|EB|EP|ME|SO|SH|SQ)/i.exec(text);
  return m ? { grade: Number(m[1]), classCode: m[2].toUpperCase() } : null;
}
export function matchTender(tender: TenderCandidate, profile: CompanyDetails) {
  if (!hasMatchingProfile(profile)) return { score: 0, label: 'Complete profile', reasons: [] as string[], warning: '' };
  const profileText = [profile.category, profile.services, profile.description, profile.projects].filter(Boolean).join(' ');
  const noticeText = [tender.title, tender.category, tender.description?.slice(0, 2200)].filter(Boolean).join(' ');
  const companyGroups = clustersFor(profileText);
  const tenderGroups = clustersFor(noticeText);
  const sharedGroups = tenderGroups.filter(group => companyGroups.includes(group));
  const commonTerms = keywords([profile.category, profile.services, profile.description].filter(Boolean).join(' ')).filter(word => keywords(noticeText).includes(word));
  const reasons: string[] = [];
  let score = 10;
  let hasServiceFit = false;
  if (sharedGroups.length) {
    score += 48;
    hasServiceFit = true;
    reasons.push('Service fit: ' + sharedGroups.slice(0, 3).join(', '));
  } else if (commonTerms.length >= 2) {
    score += 41;
    hasServiceFit = true;
    reasons.push('Shared capabilities: ' + commonTerms.slice(0, 3).join(', '));
  } else if (commonTerms.length === 1) {
    score += 28;
    hasServiceFit = true;
    reasons.push('Shared service keyword: ' + commonTerms[0]);
  } else {
    reasons.push('No clear service overlap in this notice');
  }
  const locations = norm([profile.province, profile.coverage, profile.city].filter(Boolean).join(' '));
  const mentioned = norm(tender.province || '');
  const nationally = /nationwide|national|south africa|all provinces|across the country/.test(locations);
  const noticeProvinces = provinces.filter(p => mentioned.includes(norm(p)));
  if (!noticeProvinces.length) reasons.push('Tender location needs verification');
  else if (nationally) { score += 15; reasons.push('Nationwide coverage stated'); }
  else if (noticeProvinces.some(p => locations.includes(norm(p)))) { score += 19; reasons.push('Inside your declared service area'); }
  else { score -= 12; reasons.push('Outside your declared service area'); }
  const close = tender.closesAt ? new Date(tender.closesAt) : null;
  if (close && !Number.isNaN(close.getTime()) && close.getTime() >= Date.now()) {
    score += 8; reasons.push('Published deadline appears open');
  }
  const asked = cidbGrade([tender.eligibility, tender.specialConditions, tender.description?.slice(0, 1500)].filter(Boolean).join(' '));
  const held = cidbGrade(profile.cidb || '');
  let warning = '';
  if (asked && held && asked.classCode === held.classCode) {
    if (held.grade >= asked.grade) { score += 5; reasons.push('Declared CIDB grade may align'); }
    else { score -= 35; warning = 'The stated CIDB grade may exceed your declared grade. Verify the full eligibility rules.'; }
  } else if (asked) warning = 'CIDB appears in the notice. Independently check the full classification and eligibility conditions.';
  if (!hasServiceFit) score = Math.min(score, 30);
  if (companyGroups.length && tenderGroups.length && !sharedGroups.length && commonTerms.length < 2) score = Math.min(score, 35);
  score = Math.max(0, Math.min(95, score));
  return { score, label: score >= 70 ? 'Strong alignment' : score >= 52 ? 'Worth reviewing' : 'Review fit', reasons, warning };
}
