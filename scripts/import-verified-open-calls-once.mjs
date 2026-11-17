// One-time, source-audited funding publication into OPPOTRON production Firestore.
// Runs after a successful build, and NEVER in Vercel previews.
// Source records: api/_lib/verified-open-calls-2026.js, audited 17 November 2026.
import {VERIFIED_OPEN_CALLS,VERIFIED_CALLS_CHECKED_AT} from '../api/_lib/verified-open-calls-2026.js';
import {normalizeOpportunity,identityKey,isExpired,publicUrl} from '../api/_lib/opportunities.js';
import {insertOpportunity} from '../api/admin.js';
import {firestore} from '../api/_lib/firestore-rest.js';
import {googleAccessToken,serviceConfigured} from '../api/_lib/service-auth.js';
import {corporateFunderId} from '../api/_lib/csi-funder-transform.js';

if(process.env.VERCEL_ENV!=='production'){
 console.log('[Funding Goldmine] Skipped: not a Vercel production deployment.');
}else{
 if(process.env.FIREBASE_PROJECT_ID!=='builda-51678'||process.env.VITE_FIREBASE_PROJECT_ID!=='builda-51678')
  throw new Error('[Funding Goldmine] Unexpected Firebase project; import refused.');
 if(!serviceConfigured())throw new Error('[Funding Goldmine] Firebase service account credentials unavailable.');
 if(VERIFIED_OPEN_CALLS.length!==25||VERIFIED_CALLS_CHECKED_AT!=='2026-11-17')
  throw new Error('[Funding Goldmine] Reviewed data integrity mismatch.');
 const keys=new Set();
 for(const raw of VERIFIED_OPEN_CALLS){
  const op=normalizeOpportunity(raw);
  if(!raw.sourceUrl||!publicUrl(raw.sourceUrl)||raw.verificationStatus!=='verified'||raw.status!=='published'||isExpired(op))
   throw new Error('[Funding Goldmine] Unverified, expired or malformed call: '+raw.title);
  const key=raw.funder.toLowerCase()+'|'+raw.title.toLowerCase();
  if(keys.has(key))throw new Error('[Funding Goldmine] Duplicate source record: '+raw.title);
  keys.add(key);
 }
 const token=await googleAccessToken();
 const existing=[];let cursor='';
 do{
  const page=await firestore.list(token,'opportunities',100,cursor);
  existing.push(...page.items);cursor=page.nextPageToken;
 }while(cursor&&existing.length<2000);
 const originals=new Set(existing.map(x=>String(x.funder||'').trim().toLowerCase()+'|'+String(x.title||'').trim().toLowerCase()));
 let created=0,skipped=0,contactsUpdated=0;
 const errors=[];
 const verifiedIds=[];
 for(const raw of VERIFIED_OPEN_CALLS){
  const key=raw.funder.trim().toLowerCase()+'|'+raw.title.trim().toLowerCase();
  if(originals.has(key)){skipped++;continue;}
  try{
   const createdRecord=await insertOpportunity(token,raw,{actor:'source-audit-2026-11-17'});
   if(!createdRecord?.id)throw new Error('No Firestore opportunity ID returned.');
   verifiedIds.push(createdRecord.id);
   created++;originals.add(key);
  }catch(err){
   if(err.status===409){skipped++;originals.add(key);}
   else errors.push({title:raw.title,message:String(err.message||err).slice(0,180)});
  }
 }
 // Fill verified contact channels only where unknown. Do not overwrite administrators' edits.
 const seen=new Set();
 for(const raw of VERIFIED_OPEN_CALLS){
  if(seen.has(raw.funder))continue;
  seen.add(raw.funder);
  const path='funders/'+corporateFunderId(raw.funder);
  try{
   const current=await firestore.get(token,path);
   if(!current)continue;
   const patch={};
   if(!current.website)patch.website=new URL(raw.sourceUrl).origin+'/';
   if(raw.contactEmail&&!current.contactEmail)patch.contactEmail=raw.contactEmail;
   if(raw.contactPhone&&!current.contactPhone)patch.contactPhone=raw.contactPhone;
   if(Object.keys(patch).length){await firestore.update(token,path,patch);contactsUpdated++;}
  }catch(e){errors.push({title:'Funder contact: '+raw.funder,message:String(e.message||e).slice(0,180)});}
 }
 // Extra high-value corporate funder contact verified from Absa's official source.
 try{
  const path='funders/'+corporateFunderId('Absa Group Limited');
  const current=await firestore.get(token,path);
  if(current&&!current.website){await firestore.update(token,path,{website:'https://www.absa.africa/csi-trust/'});contactsUpdated++;}
 }catch(e){errors.push({title:'Absa official website',message:String(e.message||e).slice(0,180)});}
 const sampleIds=verifiedIds.slice(0,3);
 for(const id of sampleIds){
  const record=await firestore.get(token,'opportunities/'+id);
  if(record?.status!=='published'||record.verificationStatus!=='verified'||!record.sourceUrl)
   errors.push({title:'Readback '+id,message:'Imported opportunity readback failed.'});
 }
 const summary={checkedAt:VERIFIED_CALLS_CHECKED_AT,reviewed:VERIFIED_OPEN_CALLS.length,created,skipped,contactsUpdated,
  readBackCount:sampleIds.length,errors};
 console.log('[Funding Goldmine] production import summary '+JSON.stringify(summary));
 if(errors.length)throw new Error('[Funding Goldmine] Partial failure: '+errors.length+' errors. Rebuild is safe; records are not duplicated.');
 if(created+skipped!==VERIFIED_OPEN_CALLS.length)throw new Error('[Funding Goldmine] Publication total mismatch.');
 console.log('[Funding Goldmine] VERIFIED in production Firestore: '+created+' new published opportunities, '+skipped+' already present.');
}
