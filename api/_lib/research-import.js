import {GAUTENG_RESEARCH_ROWS,GAUTENG_RESEARCH_CHECKED_AT} from './gauteng-research-data.js';

export const RESEARCH_SOURCE = 'gauteng-ecd-arts-2026-11';
export const RESEARCH_ROWS = GAUTENG_RESEARCH_ROWS;
const string = x => typeof x === 'string' ? x.trim() : String(x ?? '').trim();
const column = (row, key) => string(row[key]);
const dateValue = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
const title = row => column(row,'Opportunity');
const funder = row => column(row,'Organisation / Funder');
const source = row => column(row,'Source / application URL');
const type = row => column(row,'Type');
const status = row => column(row,'Status (16 Nov 2026)');
const deadline = row => dateValue(column(row,'Deadline / intake'));

export function isResearchOpenCall(row, now=Date.now()) {
  const end=deadline(row);
  // Only explicit, dated open-application grants qualify; unconfirmed extensions are held for review.
  return status(row)==='Open application' && Boolean(end) &&
    Date.parse(end+'T23:59:59+02:00')>=now;
}
export function researchSector(row) {
  const terms=(title(row)+' '+type(row)).toLowerCase();
  if(/arts|culture|heritage|ballet|theatre|creative|perform/.test(terms))return 'Arts and culture';
  if(/ecd|literacy|child|play|educat|school|learning|creche|crèche/.test(terms))return 'Education';
  if(/youth|skills|enterprise/.test(terms))return 'Youth development';
  return 'General';
}
export function researchToOpportunity(row, now=Date.now()) {
 const eligibility=column(row,'Eligible audience'),caveat=column(row,'Important eligibility caveat');
 const audience=[eligibility,caveat].filter(Boolean).join('\n\nIMPORTANT: ');
 const kind=type(row),funding=column(row,'Funding / value');
 const applicable=isResearchOpenCall(row,now);
 return {
  title:title(row),funder:funder(row),sector:researchSector(row),
  description:[kind && 'Research category: '+kind,eligibility].filter(Boolean).join('. '),
  eligibility:audience,coverage:column(row,'Geography'),
  amount:funding==='Not specified'?'':funding,
  deadline:deadline(row),applicationUrl:'',sourceUrl:source(row),
  applicationInstructions:column(row,'Recommended next action'),
  round:'',requirements:[],documents:[],
  verificationStatus:'unverified',status:applicable?'published':'draft',
  source:RESEARCH_SOURCE,
  notes:['OPPOTRON research lead, last checked '+GAUTENG_RESEARCH_CHECKED_AT,
   'Reported status: '+status(row),'Fit: '+column(row,'Fit'),
   'Type: '+kind,'Original deadline/intake: '+column(row,'Deadline / intake'),
   caveat].filter(Boolean).join('\n'),
  researchLeadId:column(row,'ID'),
  researchStatus:status(row),researchType:kind,
  researchFit:column(row,'Fit'),researchAudience:eligibility,
  researchDeadlineText:column(row,'Deadline / intake'),
  researchCheckedAt:column(row,'Last checked')||GAUTENG_RESEARCH_CHECKED_AT,
  researchCaveat:caveat,
  researchNextAction:column(row,'Recommended next action')
 };
}
export const RESEARCH_FUNDERS = Object.values(GAUTENG_RESEARCH_ROWS.reduce((acc,row)=>{
 const name=funder(row);
 if(!acc[name])acc[name]={name,leadCount:0,types:[],statuses:[],sectors:[],sourceUrls:[],
  regions:[],lastCheckedAt:GAUTENG_RESEARCH_CHECKED_AT};
 const item=acc[name];
 item.leadCount++;
 for(const [key,val] of [['types',type(row)],['statuses',status(row)],
  ['sectors',researchSector(row)],['sourceUrls',source(row)],['regions',column(row,'Geography')]]){
  if(val&&!item[key].includes(val))item[key].push(val);
 }
 return acc;
},Object.create(null)));

export function researchSummary(now=Date.now()){
 return {leads:GAUTENG_RESEARCH_ROWS.length,funders:RESEARCH_FUNDERS.length,
  explicitlyOpen:GAUTENG_RESEARCH_ROWS.filter(row=>isResearchOpenCall(row,now)).length,
  uncertain:GAUTENG_RESEARCH_ROWS.filter(row=>/extension needs checking|not verified|window unconfirmed|intake unconfirmed/i.test(status(row))).length,
  checkedAt:GAUTENG_RESEARCH_CHECKED_AT,
  warning:'Research leads are not all open grants. Closed, unconfirmed, loan, training and in-kind entries remain private drafts until reviewed.'};
}
