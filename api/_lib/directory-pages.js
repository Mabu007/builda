// Pure, bounded directory helpers shared by the authenticated API endpoints.
// The API sends only the requested page; matching and ordering run server-side.
export const DIRECTORY_PAGE_LIMIT=40;
const LIMITS={funders:20,opportunities:12,featured:3};
export function requestPage(raw,kind='opportunities'){
 const value=Number(raw);
 return Number.isSafeInteger(value)&&value>0&&value<=100000?value:1;
}
export function requestLimit(raw,kind='opportunities'){
 const value=Number(raw);
 return Number.isSafeInteger(value)&&value>=1?Math.min(value,DIRECTORY_PAGE_LIMIT):LIMITS[kind]||12;
}
export function pageItems(items,page=1,limit=12){
 const safe=Math.max(1,Math.trunc(page)),size=Math.max(1,Math.min(DIRECTORY_PAGE_LIMIT,Math.trunc(limit)));
 const start=Math.min(items.length,(safe-1)*size);
 return {items:items.slice(start,start+size),page:safe,pageSize:size,total:items.length,hasMore:start+size<items.length};
}
export const normalName=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
export const queryText=v=>String(v||'').trim().toLowerCase().slice(0,120);
export function openCall(op,now=Date.now()){
 if(op?.status!=='published'||op?.verificationStatus!=='verified')return false;
 if(op.deadline){
  const end=Date.parse(String(op.deadline)+'T23:59:59+02:00');
  return Number.isFinite(end)&&end>=now;
 }
 return /^rolling applications\b/i.test(String(op.round||''));
}
export function callCounts(calls,now=Date.now()){
 const counts=new Map();
 for(const c of calls){
  if(!openCall(c,now))continue;
  const key=normalName(c.funder);
  counts.set(key,(counts.get(key)||0)+1);
 }
 return counts;
}
export function funderRows(funders,opportunities,search='',now=Date.now()){
 const q=queryText(search),counts=callCounts(opportunities,now);
 return funders.filter(f=>f.name&&(!q||[f.name,f.description,...(f.focus||[]),f.geography].join(' ').toLowerCase().includes(q)))
  .map(f=>({...f,openCallCount:counts.get(normalName(f.name))||0}))
  .sort((a,b)=>b.openCallCount-a.openCallCount||a.name.localeCompare(b.name));
}
const categories=[
 'Education & Research','Social Services & Welfare','Health & Wellness',
 'Arts, Culture & Recreation','Community Development & Housing',
 'Environment & Conservation','Law, Advocacy & Human Rights',
 'Religion & Faith-Based Services','Philanthropy & Volunteering',
 'Business & Professional Associations','International Activities'
];
export function categoryFor(op){
 const sector=String(op.sector||'').toLowerCase();
 const text=sector+' '+String(op.title||'')+' '+String(op.description||'').slice(0,200);
 const exact=categories.find(x=>x.toLowerCase()===sector);
 if(exact)return exact;
 if(/religious|faith|church|mosque|worship/.test(sector))return categories[7];
 if(/philanthrop|volunteer|grantmaker/.test(sector))return categories[8];
 if(/international|humanitarian international|cross.border/.test(sector))return categories[10];
 if(/association|trade union|professional bod|cooperative|skills programme|seta|enterprise|economic empower|business/.test(sector))return categories[9];
 if(/law|justice|rights|advocac|gender|women empower|victim/.test(sector))return categories[6];
 if(/environment|climat|conserv|wildlife|recycl|ecolog/.test(sector))return categories[5];
 if(/arts|culture|recreation|sport|music|dance|theatre/.test(sector))return categories[3];
 if(/health|wellness|mental|disability|hiv|aids/.test(sector))return categories[2];
 if(/education|research|literacy|learning|ecd|early childhood|school|youth develop/.test(sector))return categories[0];
 if(/food|welfare|shelter|social|child protection|older person/.test(sector))return categories[1];
 if(/community|housing|poverty|development/.test(sector))return categories[4];
 return /international|global|africa-wide/i.test(text)?categories[10]:categories[4];
}
const terms=v=>[...new Set(String(v||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>=5&&!['application','community','programme','funding','services','development','organisation','project','nonprofit','support','grant'].includes(w)))];
const fieldNames=['name','registration','description','category','province','coverage','services','beneficiaries','projects','goals'];
export const personalised=p=>fieldNames.filter(k=>String(p?.[k]||'').trim()).length>=3;
// Keep the same score ordering as matchOpportunity in src/workspace/funding.ts;
// no private organisation data is persisted or shared between requests.
export function matchScore(op,p={},now=Date.now()){
 if(!personalised(p))return 0;
 if(op.deadline&&Date.parse(op.deadline+'T23:59:59+02:00')<now)return 0;
 const profile=[p.category,p.description,p.services,p.projects,p.goals,p.fundingPriorities].filter(Boolean).join(' ').toLowerCase();
 const funding=[op.title,op.sector,op.description,op.eligibility].filter(Boolean).join(' ').toLowerCase();
 let score=0;
 const tags=terms(p.category||'');
 if(tags.length&&tags.some(w=>funding.includes(w)))score+=50;
 const shared=terms(profile).filter(w=>funding.includes(w)).slice(0,5);
 if(shared.length>=2)score+=25;else if(shared.length)score+=13;
 const region=String(op.coverage||'').toLowerCase(),home=String(p.province||'').toLowerCase(),areas=String(p.coverage||'').toLowerCase();
 if(!region||/south africa|national|nationwide|all provinces|countrywide/i.test(region))score+=15;
 else if((home&&region.includes(home))||(areas&&areas.includes(region)))score+=15;
 return Math.max(0,Math.min(95,score));
}
export const stateOrder=(op,now=Date.now())=>openCall(op,now)?0:op.deadline&&Date.parse(String(op.deadline)+'T23:59:59+02:00')<now?2:1;
export function opportunityRows(opportunities,{sector='',search='',profile={}}={},now=Date.now()){
 const q=queryText(search);
 const filtered=opportunities.filter(op=>op.status==='published'&&(!sector||categoryFor(op)===sector)
  &&(!q||[op.title,op.funder,op.sector,op.description,op.contactEmail,op.contactPhone].join(' ').toLowerCase().includes(q)));
 const useProfile=personalised(profile);
 const scores=useProfile?new Map(filtered.map(op=>[op.id,matchScore(op,profile,now)])):null;
 return filtered.sort((a,b)=>stateOrder(a,now)-stateOrder(b,now)||
  (scores?(scores.get(b.id)||0)-(scores.get(a.id)||0):0)||
  String(a.deadline||'9999').localeCompare(String(b.deadline||'9999'))||
  String(a.title||'').localeCompare(String(b.title||'')));
}
export function publicOpportunity(record={}){
 const copy={};
 for(const key of ['id','title','funder','description','sector','eligibility','registration','coverage','amount','deadline','round','requirements','applicationUrl','sourceUrl','contactEmail','contactPhone','applicationInstructions','documents','verificationStatus','status','published','lastCheckedAt','researchType','researchAudience','researchCaveat','researchNextAction','researchFit','researchDeadlineText']){
  if(record[key]!==undefined)copy[key]=record[key];
 }
 return copy;
}
