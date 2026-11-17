// One-time, production-only CSI funder migration.
// IMPORTANT: this is intentionally appended *after* tests, typecheck and bundle build.
// It imports historical funder research only, never creates funding opportunities.
import {CSI_COMPANIES} from '../api/_lib/csi-corporate-2025.js';
import {CSI_IMPORT_VERSION,corporateFunderId,csiFunderFields,csiResearchSummary} from '../api/_lib/csi-funder-transform.js';
import {firestore} from '../api/_lib/firestore-rest.js';
import {googleAccessToken,serviceConfigured} from '../api/_lib/service-auth.js';

if(process.env.VERCEL_ENV!=='production'){
 console.log('[CSI migration] Skipped: not a Vercel production deployment.');
}else{
 if(!serviceConfigured())throw new Error('[CSI migration] Firebase service credentials missing; import not attempted.');
 if(process.env.FIREBASE_PROJECT_ID!=='builda-51678'||process.env.VITE_FIREBASE_PROJECT_ID!=='builda-51678')throw new Error('[CSI migration] Unexpected Firebase target project; refusing to import.');
 const summary=csiResearchSummary();
 if(summary.companies!==120||summary.publishedSpend!==112||summary.notDisclosed!==5||
 summary.notAvailable!==3||summary.notes!==26)throw new Error('[CSI migration] Input dataset failed integrity checks.');
 const token=await googleAccessToken();
 const stamp=new Date().toISOString();
 let created=0,enriched=0,skipped=0,errors=[];
 let next=0;
 const workers=Array.from({length:8},async()=>{
  while(next<CSI_COMPANIES.length){
   const index=next++,row=CSI_COMPANIES[index];
   const path='funders/'+corporateFunderId(row.name);
   try{
    const existing=await firestore.get(token,path);
    if(existing?.csiResearch?.importVersion===CSI_IMPORT_VERSION){skipped++;continue;}
    const mapped=csiFunderFields(row,existing,stamp);
    if(existing){
     const patch={csiResearch:mapped.csiResearch,updatedAt:stamp};
     if(!existing.description)patch.description=mapped.description;
     if(!Array.isArray(existing.sectors)||!existing.sectors.length)patch.sectors=mapped.sectors;
     if(!Array.isArray(existing.fundingTypes)||!existing.fundingTypes.length)patch.fundingTypes=mapped.fundingTypes;
     await firestore.update(token,path,patch);enriched++;
    }else{
     try{await firestore.create(token,path,mapped);created++;}
     catch(e){if(e.status===409){skipped++;}else throw e;}
    }
   }catch(e){errors.push({company:row.name,error:String(e?.message||e).slice(0,160)});}
  }
 });
 await Promise.all(workers);
 console.log('[CSI migration] summary',JSON.stringify({created,enriched,skipped,errors:errors.length,total:CSI_COMPANIES.length}));
 if(errors.length){
  console.error('[CSI migration] Failed companies:',JSON.stringify(errors));
  throw new Error('[CSI migration] Some funders failed to import; rerun is safe and idempotent.');
 }
 if(created+enriched+skipped!==120)throw new Error('[CSI migration] Row count verification failed.');
 for(const name of ['Absa Group Limited','Harmony Gold Mining Company','Woolworths']){
  const record=await firestore.get(token,'funders/'+corporateFunderId(name));
  if(record?.csiResearch?.importVersion!==CSI_IMPORT_VERSION)throw new Error('[CSI migration] Verification failed for '+name);
 }
 console.log('[CSI migration] Verified imported research in production Firestore for three sampled companies.');
 console.log('[CSI migration] Successfully imported 120 historical corporate funders to production Firestore.');
}
