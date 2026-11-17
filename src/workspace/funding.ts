export type FundingOpportunity={
 id:string;title:string;funder:string;description:string;sector:string;eligibility:string;
 registration:string;coverage:string;amount:string;deadline:string;round:string;
 requirements:string[];applicationUrl:string;sourceUrl:string;contactEmail?:string;contactPhone?:string;applicationInstructions?:string;documents:{title:string;sourceUrl:string;storageKey?:string;status?:string;size?:number}[];
 verificationStatus:string;status:string;published:boolean;lastCheckedAt?:string;
 source?:string;researchLeadId?:string;researchStatus?:string;researchType?:string;researchFit?:string;
 researchAudience?:string;researchDeadlineText?:string;researchCheckedAt?:string;
 researchCaveat?:string;researchNextAction?:string;
};
export type MatchResult={score:number;reasons:string[];gaps:string[];eligible:boolean;missingDocuments:string[]};
export const FUNDING_PROFILE_FIELDS=['name','registration','description','category','province','coverage','services','beneficiaries','projects','goals'] as const;
export function profileProgress(profile:Record<string,string>){
 const count=FUNDING_PROFILE_FIELDS.filter(field=>String(profile[field]||'').trim().length>0).length;
 return {count,percent:Math.round(count/FUNDING_PROFILE_FIELDS.length*100),personalised:count>=3};
}

const tokens=(input:string)=>[...new Set(String(input||'').toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>=5&&!['application','community','programme','funding','services','development','organisation','project','nonprofit','support','grant'].includes(word)))];
const safeDate=(value?:string)=>value?Date.parse(value+'T23:59:59+02:00'):NaN;
export const opportunityExpired=(o:FundingOpportunity)=>Boolean(o.deadline&&Number.isFinite(safeDate(o.deadline))&&safeDate(o.deadline)<Date.now());
export function matchOpportunity(o:FundingOpportunity,p:Record<string,string>,files:{name:string;category:string}[]=[]):MatchResult{
 const reasons:string[]=[],gaps:string[]=[],missingDocuments:string[]=[];
 if(!profileProgress(p).personalised)return{score:0,reasons:['Add at least 30% of your organisation profile for tailored ranking.'],gaps:[],missingDocuments,eligible:false};
 if(opportunityExpired(o))return{score:0,reasons:['Deadline has passed.'],gaps:['Closed opportunity'],missingDocuments,eligible:false};
 const profile=[p.category,p.description,p.services,p.projects,p.goals,p.fundingPriorities].filter(Boolean).join(' ').toLowerCase();
 const funding=[o.title,o.sector,o.description,o.eligibility].filter(Boolean).join(' ').toLowerCase();
 let score=0;
 const category=tokens(p.category||'');
 if(category.length&&category.some(word=>funding.includes(word))){score+=50;reasons.push('Matches your focus area: '+p.category);}
 const shared=tokens(profile).filter(word=>funding.includes(word)).slice(0,5);
 if(shared.length>=2){score+=25;reasons.push('Shared themes: '+shared.slice(0,3).join(', '));}
 else if(shared.length){score+=13;reasons.push('Relevant programme keyword: '+shared[0]);}
 const region=String(o.coverage||'').toLowerCase(),home=String(p.province||'').toLowerCase(),areas=String(p.coverage||'').toLowerCase();
 if(!region||/south africa|national|nationwide|all provinces|countrywide/i.test(region)){score+=15;reasons.push('No restricted province identified; confirm with the funder.');}
 else if((home&&region.includes(home))||(areas&&areas.includes(region))){score+=15;reasons.push('Matches your stated operating location.');}
 else {gaps.push('Location eligibility needs verification.');}
 const reg=String(o.registration||'').toLowerCase();
 if(reg.includes('npo')&&!p.registration){gaps.push('NPO registration may be required.');missingDocuments.push('NPO registration certificate');}
 if(reg.includes('npc')&&!p.npcNumber){gaps.push('NPC registration may be required.');missingDocuments.push('NPC incorporation certificate');}
 if(reg.includes('pbo')&&!p.pboNumber){gaps.push('PBO reference or tax exemption may be required.');missingDocuments.push('PBO confirmation');}
 const fileNames=files.map(f=>(f.name+' '+f.category).toLowerCase());
 for(const item of o.requirements||[]){
  const req=String(item).toLowerCase();
  if(/constitution/.test(req)&&!fileNames.some(f=>f.includes('constitution')))missingDocuments.push('Constitution');
  if(/financial statement|annual financial|audited/.test(req)&&!fileNames.some(f=>/financial|audit/.test(f)))missingDocuments.push('Financial statements');
  if(/npo certificate|npo registration/.test(req)&&!fileNames.some(f=>/registration/.test(f)))missingDocuments.push('NPO registration certificate');
  if(/organisation profile|organizational profile/.test(req)&&!fileNames.some(f=>/organisation profile/.test(f)))missingDocuments.push('Organisation profile');
 }
 if(!o.eligibility)gaps.push('Eligibility criteria were not supplied or verified.');
 if(o.verificationStatus!=='verified')gaps.push('Opportunity details have not been independently verified.');
 if(!o.deadline)gaps.push('Deadline not supplied; confirm with the funder.');
 return{score:Math.max(0,Math.min(95,score)),reasons,gaps,missingDocuments:[...new Set(missingDocuments)],eligible:score>=40};
}
