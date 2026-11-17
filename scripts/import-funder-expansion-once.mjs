// One-time audited funder/contact enrichment and grant expansion.
// This file is intentionally non-destructive, idempotent and production-only.
// Once imported, remove the hook from the normal build as in prior release.
import {MAJOR_FUNDERS} from '../api/_lib/major-funders-2026.js';
import {ADDITIONAL_VERIFIED_CALLS,FUNDING_EXPANSION_AUDITED_AT} from '../api/_lib/funding-expansion-2026.js';
import {VERIFIED_OPEN_CALLS} from '../api/_lib/verified-open-calls-2026.js';
import {publicUrl,normalizeOpportunity,isExpired} from '../api/_lib/opportunities.js';
import {firestore} from '../api/_lib/firestore-rest.js';
import {googleAccessToken,serviceConfigured} from '../api/_lib/service-auth.js';
import {corporateFunderId} from '../api/_lib/csi-funder-transform.js';
import {insertOpportunity} from '../api/admin.js';

const normalize=name=>String(name||'').toLowerCase().replace(/^the\s+/,'').replace(/[^a-z0-9]+/g,' ').trim();
const auditStamp=()=>new Date().toISOString();
async function all(token,collection,cap=3000){
 const items=[];let cursor='';
 do{
  const page=await firestore.list(token,collection,200,cursor);
  items.push(...page.items);cursor=page.nextPageToken;
 }while(cursor&&items.length<cap);
 if(cursor)throw new Error('Funder expansion stopped at '+cap+' records; cannot deduplicate the full collection.');
 return items;
}
if(process.env.VERCEL_ENV!=='production'){
 console.log('[Funder expansion] Skipped outside production.');
}else{
 if(process.env.FIREBASE_PROJECT_ID!=='builda-51678'||process.env.VITE_FIREBASE_PROJECT_ID!=='builda-51678')
  throw new Error('[Funder expansion] Unexpected Firebase project; refusing writes.');
 if(!serviceConfigured())throw new Error('[Funder expansion] Missing Firebase server credentials.');
 if(FUNDING_EXPANSION_AUDITED_AT!=='2026-11-17'||MAJOR_FUNDERS.length<60||ADDITIONAL_VERIFIED_CALLS.length<10)
  throw new Error('[Funder expansion] Audited batch integrity mismatch.');

 // Deployment may occur days after the research: skip calls that have since closed
 // instead of failing the whole build or publishing expired notices.
 const expiredAtImport=ADDITIONAL_VERIFIED_CALLS.filter(c=>c.status==='published'&&isExpired(c));
 const published=ADDITIONAL_VERIFIED_CALLS.filter(c=>c.status==='published'&&!isExpired(c));
 const pairs=new Set();
 for(const call of published){
  const op=normalizeOpportunity(call);
  const identity=normalize(call.funder)+'|'+normalize(call.title);
  if(pairs.has(identity)||!publicUrl(call.sourceUrl)||call.verificationStatus!=='verified'||isExpired(op))
   throw new Error('[Funder expansion] Duplicate, expired or unverified call: '+call.title);
  pairs.add(identity);
 }
 const funderNames=new Set();
 for(const f of MAJOR_FUNDERS){
  const key=normalize(f.name);
  if(!key||funderNames.has(key)||!publicUrl(f.website)||!publicUrl(f.sourceUrl))
   throw new Error('[Funder expansion] Invalid funder reference: '+f.name);
  if(f.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail))throw new Error('Invalid contact: '+f.name);
  funderNames.add(key);
 }

 const token=await googleAccessToken();
 const existingFunders=await all(token,'funders');
 const existingOpportunities=await all(token,'opportunities');
 const byFunder=new Map(existingFunders.map(f=>[normalize(f.name),f]));
 const byOpportunity=new Set(existingOpportunities.map(o=>normalize(o.funder)+'|'+normalize(o.title)));
 let fundersCreated=0,contactsEnriched=0,fundersSkipped=0,callsCreated=0,callsSkipped=0;
 const errors=[];
 // Add an official reference for every original and new call funder, even if
 // this organisation was absent from the historical corporate / Gauteng seeds.
 const funders=[...MAJOR_FUNDERS];
 const present=new Set(funders.map(f=>normalize(f.name)));
 for(const op of [...VERIFIED_OPEN_CALLS,...ADDITIONAL_VERIFIED_CALLS.filter(c=>c.status==='published')]){
  if(present.has(normalize(op.funder)))continue;
  const url=publicUrl(op.sourceUrl);
  if(!url)continue;
  funders.push({name:op.funder,website:new URL(url).origin+'/',sourceUrl:url,sectors:[op.sector],contactEmail:op.contactEmail||'',contactPhone:op.contactPhone||''});
  present.add(normalize(op.funder));
 }
 for(const item of funders){
  const key=normalize(item.name);
  const old=byFunder.get(key);
  const fields={
   ...(old||{}),name:old?.name||item.name,id:old?.id||corporateFunderId(item.name),slug:old?.slug||corporateFunderId(item.name),
   website:old?.website||publicUrl(item.website)||'',
   contactEmail:old?.contactEmail||item.contactEmail||'',
   contactPhone:old?.contactPhone||item.contactPhone||'',
   sectors:Array.isArray(old?.sectors)&&old.sectors.length?old.sectors:(item.sectors||[]),
   sourceUrls:Array.isArray(old?.sourceUrls)&&old.sourceUrls.length?old.sourceUrls:[publicUrl(item.sourceUrl)].filter(Boolean),
   published:old?Boolean(old.published):true,
   updatedAt:old?.updatedAt||auditStamp(),
   createdAt:old?.createdAt||auditStamp()
  };
  try{
   if(old){
    const patch={};
    for(const field of ['website','contactEmail','contactPhone','sectors','sourceUrls']){
     if((!old[field]||(Array.isArray(old[field])&&!old[field].length))&&fields[field]&&(Array.isArray(fields[field])?fields[field].length:true))
      patch[field]=fields[field];
    }
    if(Object.keys(patch).length){
     patch.contactResearchCheckedAt=FUNDING_EXPANSION_AUDITED_AT;
     await firestore.update(token,'funders/'+old.id,patch);
     contactsEnriched++;
    }else fundersSkipped++;
   }else{
    await firestore.create(token,'funders/'+fields.id,fields);
    fundersCreated++;
    byFunder.set(key,fields);
   }
  }catch(e){
   if(e.status===409)fundersSkipped++;
   else errors.push({name:item.name,error:String(e.message||e).slice(0,160)});
  }
 }
 for(const call of published){
  const key=normalize(call.funder)+'|'+normalize(call.title);
  if(byOpportunity.has(key)){callsSkipped++;continue;}
  try{
   const created=await insertOpportunity(token,call,{actor:'official-source-expansion-2026-11-17'});
   if(!created?.id)throw new Error('No opportunity ID returned');
   const check=await firestore.get(token,'opportunities/'+created.id);
   if(check?.status!=='published'||check?.verificationStatus!=='verified')throw new Error('Firestore readback did not match');
   callsCreated++;byOpportunity.add(key);
  }catch(e){
   if(e.status===409){callsSkipped++;byOpportunity.add(key);}
   else errors.push({name:call.title,error:String(e.message||e).slice(0,160)});
  }
 }
 const readFunders=await all(token,'funders');
 const readOpportunities=await all(token,'opportunities');
 const today=Date.now();
 const current=readOpportunities.filter(o=>o.status==='published'&&o.verificationStatus==='verified'&&(o.deadline?(!isExpired(o,today)):/^rolling applications\b/i.test(o.round||'')));
 const summary={auditedAt:FUNDING_EXPANSION_AUDITED_AT,expiredAtImport:expiredAtImport.length,referenceFunders:MAJOR_FUNDERS.length,
  validNewCalls:published.length,fundersCreated,contactsEnriched,fundersSkipped,
  callsCreated,callsSkipped,totalFunders:readFunders.length,totalOpportunities:readOpportunities.length,
  verifiedCurrentlyOpen:current.length,errors};
 console.log('[Funder expansion] production import summary '+JSON.stringify(summary));
 if(errors.length)throw new Error('[Funder expansion] Partial failures: '+errors.length+'; safe to retry without duplicating records.');
 console.log('[Funder expansion] Completed audited non-destructive seed; 200 funders / 50 open opportunities are targets, not assumed facts.');
}
