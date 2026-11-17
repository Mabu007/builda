import type {FundingOpportunity} from './funding';
import {confirmedCall} from './confirmed-funding';

export type FundingState='open'|'closed'|'enquire';
export function fundingState(op:FundingOpportunity,now=Date.now()):FundingState{
 if(op.deadline){
  const end=Date.parse(op.deadline+'T23:59:59+02:00');
  if(Number.isFinite(end))return end>=now?'open':'closed';
 }
 return op.researchStatus==='Open application'?'enquire':'enquire';
}
export const displayFundingDate=(date?:string)=>{
 if(!date)return 'Not specified';
 const t=new Date(date+'T12:00:00Z');
 return Number.isFinite(t.getTime())?t.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):'Not specified';
};
export function daysToDeadline(op:FundingOpportunity,now=Date.now()):number|null{
 if(!op.deadline)return null;
 const end=Date.parse(op.deadline+'T23:59:59+02:00');
 return Number.isFinite(end)?Math.max(0,Math.ceil((end-now)/86400000)):null;
}
export function fundingStatusText(op:FundingOpportunity,now=Date.now()){
 const s=fundingState(op,now);
 return s==='closed'?'Closed':s==='open'?'Open for applications':'Contact funder';
}
export function plainSummary(op:FundingOpportunity){
 const confirmed=confirmedCall(op);
 if(confirmed)return confirmed.summary;
 const description=String(op.description||'').trim().replace(/^Research category:\s*[^.]+\.\s*/i,'');
 return description||String(op.researchAudience||'').trim()||
  'Learn about this programme and how your organisation could benefit.';
}
export function whoCanApply(op:FundingOpportunity){
 const confirmed=confirmedCall(op);
 if(confirmed)return confirmed.who;
 const original=String(op.researchAudience||op.eligibility||'').split(/\n\s*IMPORTANT\s*:/i)[0].trim();
 return original||'Check the funder’s eligibility criteria before preparing an application.';
}
export function importantCondition(op:FundingOpportunity):string{
 const confirmed=confirmedCall(op);
 if(confirmed?.important)return confirmed.important;
 const caveat=String(op.researchCaveat||'').trim();
 if(caveat)return caveat.replace(/^IMPORTANT:\s*/i,'');
 return String(op.eligibility||'').split(/\n\s*IMPORTANT\s*:/i)[1]?.trim()||'';
}
export function applicationSteps(op:FundingOpportunity):string[]{
 const confirmed=confirmedCall(op);
 if(confirmed?.steps?.length)return confirmed.steps;
 const steps=[];
 const instructions=String(op.applicationInstructions||op.researchNextAction||'').trim();
 if(instructions)steps.push(instructions);
 if(!steps.length){
  if(op.applicationUrl)steps.push('Open the application link and follow the funder’s instructions.');
  else if(op.contactEmail)steps.push('Email the funder to ask for the application requirements.');
  else if(op.contactPhone)steps.push('Call the funder to request the application details.');
  else if(op.sourceUrl)steps.push('Open the funder’s website for the full application instructions.');
  else steps.push('Contact the funder for the current application process.');
 }
 return steps;
}
export function applicationRoute(op:FundingOpportunity){
 const confirmed=confirmedCall(op);
 const applicationUrl=confirmed?.applyUrl||op.applicationUrl;
 const contactEmail=confirmed?.contactEmail||op.contactEmail;
 const sourceUrl=confirmed?.sourceUrl||op.sourceUrl;
 if(applicationUrl)return {url:applicationUrl,label:'Apply now',kind:'website' as const};
 if(contactEmail)return {url:'mailto:'+contactEmail,label:'Email to apply',kind:'email' as const};
 if(op.contactPhone)return {url:'tel:'+op.contactPhone.replace(/[^\d+]/g,''),label:'Call funder',kind:'phone' as const};
 if(sourceUrl)return {url:sourceUrl,label:'View funder website',kind:'website' as const};
 return null;
}
