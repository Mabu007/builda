import {createHash} from 'node:crypto';
const shorten=(v,n=1500)=>typeof v==='string'?v.trim().slice(0,n):'';
export const sectors=['Education','Youth development','Healthcare','Community development','Food security','Environment','Women empowerment','Disability inclusion','Arts and culture','Sports','Economic empowerment','Human rights','General','Other'];
export function publicUrl(raw, {pdf=false}={}) {
 try {
  const url=new URL(raw);
  if(!['https:'].includes(url.protocol)||url.username||url.password||url.port&&url.port!=='443') return '';
  const host=url.hostname.toLowerCase();
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.includes('..')||host==='metadata.google.internal')return '';
  if(/^(?:\d+\.){3}\d+$/.test(host)||host.startsWith('[')||host.includes(':'))return ''; // block IP literals and IPv6
  if(host.length>253||url.href.length>1600)return '';
  url.hash='';
  [...url.searchParams.keys()].forEach(key=>{if(/^(utm_|fbclid$|gclid$|mc_|ref$|source$)/i.test(key))url.searchParams.delete(key);});
  url.hostname=host;url.pathname=url.pathname.replace(/\/{2,}/g,'/').replace(/\/$/,'')||'/';
  return url.href;
 }catch{return '';}
}
export function identityKey(values) {
 const name=shorten(values.funder,180).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const title=shorten(values.title,240).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const round=shorten(values.round||values.deadline||'ongoing',80).toLowerCase().replace(/[^a-z0-9-]+/g,'');
 return createHash('sha256').update(name+'|'+title+'|'+round).digest('hex').slice(0,40);
}
export function canonicalKey(value) {
 const url=publicUrl(value.canonicalUrl||value.sourceUrl||value.applicationUrl);
 if(!url)return '';
 return createHash('sha256').update(url+'|'+shorten(value.round||value.deadline||'ongoing',100).toLowerCase()).digest('hex').slice(0,40);
}
function textList(value,max=20) {
 const values=Array.isArray(value)?value:typeof value==='string'?value.split(/[\n;]+/):[];
 return [...new Set(values.map(v=>shorten(v,260)).filter(Boolean))].slice(0,max);
}
function docs(value) {
 if(!Array.isArray(value))return [];
 return value.slice(0,10).map(file=>{
  const url=publicUrl(file?.sourceUrl||file?.url);
  if(!url)return null;
  return {title:shorten(file?.title||'Supporting document',160),sourceUrl:url,storageKey:shorten(file?.storageKey,240),status:file?.status==='stored'?'stored':'external',size:Number.isInteger(file?.size)?file.size:0};
 }).filter(Boolean);
}
const isDate=value=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'));
export function normalizeOpportunity(raw={},existing={}) {
 const title=shorten(raw.title,280),funder=shorten(raw.funder,180)||'Not specified';
 if(!title)throw Object.assign(new Error('Opportunity title is required.'),{status:400});
 // A funding call may be shared by email, telephone or offline, without a website.
 // Keep source and application URLs separate: a source website is not automatically an application form.
 const sourceUrl=publicUrl(raw.sourceUrl||'');
 const applicationUrl=publicUrl(raw.applicationUrl||'');
 const contactEmail=shorten(raw.contactEmail,254);
 if(contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
  throw Object.assign(new Error('Enter a valid contact email address or leave it blank.'),{status:400});
 const contactPhone=shorten(raw.contactPhone,100);
 const applicationInstructions=shorten(raw.applicationInstructions,2500);
 if((raw.sourceUrl&&!sourceUrl)||(raw.applicationUrl&&!applicationUrl))throw Object.assign(new Error('Use valid public HTTPS source and application URLs.'),{status:400});
 const deadline=shorten(raw.deadline,30);if(!isDate(deadline))throw Object.assign(new Error('Deadline must use YYYY-MM-DD.'),{status:400});
 const amount=shorten(raw.amount,120),sector=shorten(raw.sector||'Other',90),round=shorten(raw.round,90);
 const requirements=textList(raw.requirements);
 const documents=docs(raw.documents);
 const verification=['unverified','reviewed','verified'].includes(raw.verificationStatus)?raw.verificationStatus:'unverified';
 const status=['draft','published','archived'].includes(raw.status)?raw.status:'draft';
 return {
  title,funder,description:shorten(raw.description,7000),sector,eligibility:shorten(raw.eligibility,4000),
  registration:shorten(raw.registration,250),coverage:shorten(raw.coverage,300),amount,deadline,round,
  requirements,applicationUrl,sourceUrl,contactEmail,contactPhone,applicationInstructions,
  canonicalUrl:publicUrl(raw.canonicalUrl||sourceUrl||applicationUrl),documents,
  verificationStatus:verification,status,published:status==='published',source:shorten(raw.source||'manual',40),
  extractedAt:shorten(raw.extractedAt||existing.extractedAt,40),
  lastCheckedAt:shorten(raw.lastCheckedAt||existing.lastCheckedAt,40),
  notes:shorten(raw.notes,2000)
 };
}
export function isExpired(op,now=Date.now()) {
 if(!op.deadline)return false;
 const time=Date.parse(op.deadline+'T23:59:59+02:00');
 return Number.isFinite(time)&&time<now;
}
export function matchFunding(op,org={}) {
 const evidence=[],gaps=[];
 const joined=[org.category,org.description,org.services,org.goals,org.fundingPriorities].filter(Boolean).join(' ').toLowerCase();
 const funding=[op.sector,op.title,op.description,op.eligibility].filter(Boolean).join(' ').toLowerCase();
 const sector=String(org.category||'').toLowerCase().trim();
 let score=0;
 const tokens=sector.split(/\W+/).filter(t=>t.length>=4);
 if(tokens.length&&tokens.some(t=>funding.includes(t))){score+=40;evidence.push('The focus area overlaps with your NPO profile');}
 const keyTerms=[...new Set(joined.split(/\W+/).filter(t=>t.length>=5&&!['organisation','programme','community','development','funding','application','support','services'].includes(t)))].slice(0,45);
 const overlap=keyTerms.filter(t=>funding.includes(t)).slice(0,5);
 if(overlap.length>=2){score+=25;evidence.push('Your programmes share relevant topics: '+overlap.slice(0,3).join(', '));}
 else if(overlap.length===1){score+=12;evidence.push('A programme keyword aligns: '+overlap[0]);}
 const location=String(org.province||org.coverage||'').toLowerCase();
 const coverage=String(op.coverage||'').toLowerCase();
 if(!coverage||/national|south africa|anywhere|all provinces|countrywide/i.test(coverage)){score+=20;evidence.push('No geographic restriction identified; verify original rules');}
 else if(location&&coverage.includes(location)){score+=20;evidence.push('Your operating area appears within the stated coverage');}
 else {gaps.push('Check whether your operating area is eligible');score-=15;}
 if(op.registration){
  const required=op.registration.toLowerCase();
  if(required.includes('pbo')&&!org.pboNumber)gaps.push('PBO documentation may be required');
  if(required.includes('npo')&&!org.registration)gaps.push('NPO registration may be required');
  if(required.includes('npc')&&!org.npcNumber)gaps.push('NPC registration may be required');
 }
 if(!op.eligibility)gaps.push('Funder eligibility criteria have not been verified');
 if(isExpired(op))return {score:0,reasons:['The listed application deadline has passed'],gaps,eligible:false};
 if(score<40 && (sector||keyTerms.length))return {score:Math.max(0,score),reasons:evidence,gaps,eligible:false};
 if(!sector&&!org.services)return {score:0,reasons:['Complete your mission and programmes to personalise opportunities'],gaps,eligible:false};
 return {score:Math.max(0,Math.min(95,score)),reasons:evidence,gaps,eligible:true};
}
