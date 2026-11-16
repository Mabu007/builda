import {randomUUID,createHash} from 'node:crypto';
import {requireAdmin,errorResponse,firestore} from './_lib/firestore-rest.js';
import {normalizeOpportunity,identityKey,canonicalKey,isExpired,publicUrl} from './_lib/opportunities.js';
import {searchFunding,extractFunding,storeFundingPdfs} from './_lib/discovery.js';
import {listFirebaseUsers,serviceConfigured} from './_lib/service-auth.js';
const now=()=>new Date().toISOString();
const requestCounts=new Map();
function throttle(uid,action){
 const instant=Date.now(),key=uid+':'+(action==='start'||action==='tick'||action==='reverify'?'discovery':'standard');
 const history=(requestCounts.get(key)||[]).filter(t=>instant-t<60000);
 if(history.length> (key.endsWith('discovery')?24:100))throw Object.assign(new Error('Admin request rate limit reached. Retry shortly.'),{status:429});
 history.push(instant);requestCounts.set(key,history);
 if(requestCounts.size>500)requestCounts.clear();
}
async function upsertFunder(token,record){
 const id=createHash('sha256').update(record.funder.trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')).digest('hex').slice(0,40);
 const path='funders/'+id,prior=await firestore.get(token,path);
 await firestore.set(token,path,{name:record.funder,slug:id,published:record.published||prior?.published||false,
  sectors:[...new Set([...(prior?.sectors||[]),record.sector].filter(Boolean))].slice(0,30),
  updatedAt:now(),createdAt:prior?.createdAt||now()});
}

const bounded=(v,max=150)=>String(v||'').slice(0,max);
const jobPath=id=>'discoveryJobs/'+id;
const opportunityPath=id=>'opportunities/'+id;
function requireId(id){if(!/^[a-zA-Z0-9_-]{12,80}$/.test(String(id||'')))throw Object.assign(new Error('Invalid identifier.'),{status:400});return id;}
async function all(token,path,cap=500){
 const items=[];let cursor='';
 do {
  const page=await firestore.list(token,path,Math.min(100,cap-items.length),cursor);
  items.push(...page.items);cursor=page.nextPageToken;
 }while(cursor&&items.length<cap);
 return {items,hasMore:!!cursor};
}
export async function insertOpportunity(token,input,{actor='admin'}={}) {
 const valid=normalizeOpportunity(input),id=identityKey(valid),canonical=canonicalKey(valid);
 if(valid.status==='published'&&valid.verificationStatus!=='verified')throw Object.assign(new Error('Verify this opportunity against its official source before publishing.'),{status:400});
 const record={...valid,id,identityKey:id,canonicalKey:canonical,createdAt:now(),updatedAt:now(),createdBy:actor};
 const ids=[{path:opportunityPath(id),fields:record},{path:'opportunityKeys/i_'+id,fields:{opportunityId:id,kind:'identity',createdAt:record.createdAt}}];
 if(canonical)ids.push({path:'opportunityKeys/u_'+canonical,fields:{opportunityId:id,kind:'url',createdAt:record.createdAt}});
 await firestore.atomicCreate(token,ids);
 try{await upsertFunder(token,record);}catch{/* Funding record remains canonical even if funder enrichment needs retry. */}
 return record;
}
async function saveOpportunity(token,input,actor){
 const id=requireId(input.id),existing=await firestore.get(token,opportunityPath(id));
 if(!existing)throw Object.assign(new Error('Opportunity not found.'),{status:404});
 const valid=normalizeOpportunity({...existing,...input},{...existing,source:existing.source,extractedAt:existing.extractedAt});
 if(valid.status==='published'&&valid.verificationStatus!=='verified')throw Object.assign(new Error('Set verification to Verified after reviewing the official source before publishing.'),{status:400});
 const update={...valid,updatedAt:now(),updatedBy:actor};
 await firestore.update(token,opportunityPath(id),update);
 try{await upsertFunder(token,{...existing,...update});}catch{/* Funder enrichment is non-critical. */}
 return {...existing,...update};
}
async function removeOpportunity(token,id) {
 requireId(id);
 const existing=await firestore.get(token,opportunityPath(id));if(!existing)throw Object.assign(new Error('Opportunity not found.'),{status:404});
 await firestore.remove(token,opportunityPath(id));
 for(const key of ['i_'+(existing.identityKey||id),existing.canonicalKey?'u_'+existing.canonicalKey:'']){
  if(!key)continue;
  try{await firestore.remove(token,'opportunityKeys/'+key);}catch{}
 }
 return {deleted:true,id};
}
export async function startDiscovery(token,{mode,query,url,limit=20},uid) {
 const searchMode=mode!=='url';
 if(searchMode&&String(query||'').trim().length<8)throw Object.assign(new Error('Enter a funding search query of at least eight characters.'),{status:400});
 if(!searchMode&&!publicUrl(url))throw Object.assign(new Error('Enter a valid public HTTPS funding website URL.'),{status:400});
 const id=randomUUID().replaceAll('-',''),stamp=now();
 const job={id,mode:searchMode?'search':'url',query:searchMode?bounded(query,500):'',sourceUrl:searchMode?'':publicUrl(url),
  limit:Math.min(50,Math.max(1,Number(limit)||20)),status:'queued',urls:searchMode?[]:[{url:publicUrl(url)}],
  cursor:0,provider:'',fallback:false,errors:[],createdBy:uid,createdAt:stamp,updatedAt:stamp};
 await firestore.create(token,jobPath(id),job);
 return job;
}
export async function processDiscoveryJob(token,id) {
 requireId(id);
 const current=await firestore.get(token,jobPath(id));
 if(!current)throw Object.assign(new Error('Discovery job not found.'),{status:404});
 if(['done','failed'].includes(current.status))return current;
 const cursor=Number(current.cursor||0),stage=current.status;
 const lockId='discoveryLocks/'+id+'_'+(stage==='queued'?'search':cursor);
 try{await firestore.create(token,lockId,{createdAt:now()});}
 catch(e){if(e.status===409)return current;throw e;}
 try{
  if(stage==='queued'){
   if(current.mode==='url'){
    await firestore.update(token,jobPath(id),{status:'scraping',updatedAt:now()});
    return {...current,status:'scraping'};
   }
   const search=await searchFunding(current.query,current.limit);
   const urls=search.results.slice(0,50),status=urls.length?'scraping':'done';
   const patch={status,urls,provider:search.provider,fallback:search.fallback,providerNotice:search.notice||'',updatedAt:now()};
   await firestore.update(token,jobPath(id),patch);
   return {...current,...patch};
  }
  if(stage==='scraping'){
   const urls=Array.isArray(current.urls)?current.urls:[],item=urls[cursor];
   if(!item){await firestore.update(token,jobPath(id),{status:'done',updatedAt:now()});return {...current,status:'done'};}
   const stamp=now(),candidateId=id+'_'+String(cursor).padStart(4,'0');
   let candidate;
   try{
    const extracted=await extractFunding(item.url);
    const duplicateId=extracted.data?identityKey(extracted.data):'';
    const existing=duplicateId?await firestore.get(token,opportunityPath(duplicateId)):null;
    candidate={id:candidateId,jobId:id,sourceUrl:item.url,title:extracted.title||item.title||'Unidentified funding page',
     summary:item.snippet||extracted.excerpt||'',data:extracted.data||null,
     duplicateOf:existing?.id||'',status:extracted.data?'review':'incomplete',notice:extracted.notice||'',error:'',
     extractedAt:stamp,provider:'firecrawl'};
   }catch(error){
    candidate={id:candidateId,jobId:id,sourceUrl:item.url,title:item.title||'Extraction failed',summary:item.snippet||'',
     data:null,duplicateOf:'',status:'error',notice:'',error:String(error.message||'Extraction failed.').slice(0,220),
     extractedAt:stamp,provider:'firecrawl'};
   }
   await firestore.set(token,'discoveryCandidates/'+candidateId,candidate);
   const next=cursor+1,complete=next>=urls.length;
   const patch={cursor:next,status:complete?'done':'scraping',updatedAt:now(),
    ...(candidate.error?{errors:[...(current.errors||[]).slice(-9),{url:item.url,message:candidate.error}]}:{})};
   await firestore.update(token,jobPath(id),patch);
   return {...current,...patch};
  }
 }catch(error){
  const patch={status:'failed',errors:[...(current.errors||[]).slice(-9),{message:String(error.message).slice(0,180)}],updatedAt:now()};
  await firestore.update(token,jobPath(id),patch);
  return {...current,...patch};
 }
 return current;
}
async function importCandidate(token,id,overrides,uid){
 requireId(id);const candidate=await firestore.get(token,'discoveryCandidates/'+id);
 if(!candidate||!candidate.data)throw Object.assign(new Error('No structured extract is available to import.'),{status:400});
 if(candidate.status==='imported')throw Object.assign(new Error('This candidate was already imported.'),{status:409});
 const combined={...candidate.data,...(overrides||{}),sourceUrl:candidate.sourceUrl,source:'firecrawl',status:'draft',verificationStatus:'unverified',extractedAt:candidate.extractedAt};
 const record=await insertOpportunity(token,combined,{actor:uid});
 await firestore.update(token,'discoveryCandidates/'+id,{status:'imported',importedOpportunityId:record.id,updatedAt:now()});
 return record;
}
async function counts(token){
 const [people,opps,candidates,jobs]=await Promise.all([
  all(token,'contractors',1000),all(token,'opportunities',1000),all(token,'discoveryCandidates',400),all(token,'discoveryJobs',300)]);
 return {
  totalUsers:serviceConfigured()?null:people.items.length,organisations:people.items.length,
  totalOpportunities:opps.items.length,published:opps.items.filter(o=>o.status==='published').length,
  active:opps.items.filter(o=>o.status==='published'&&!isExpired(o)).length,
  pendingReviews:candidates.items.filter(c=>c.status==='review'||c.status==='incomplete').length,
  discoveryJobs:jobs.items.length,discoveryRunning:jobs.items.filter(j=>!['done','failed'].includes(j.status)).length,
  recentlyDiscovered:candidates.items.slice(-30).length,
  partial:people.hasMore||opps.hasMore||candidates.hasMore||jobs.hasMore
 };
}
export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');
 try{
  const admin=await requireAdmin(req),token=admin.token,action=String(req.query.action||'overview');
  throttle(admin.uid,action);
  if(Buffer.byteLength(JSON.stringify(req.body||{}),'utf8')>140000)throw Object.assign(new Error('Request is too large.'),{status:400});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(req.method==='GET'){
   if(action==='session')return res.status(200).json({admin:true,uid:admin.uid,serviceAccountConfigured:serviceConfigured(),providers:{firecrawl:!!process.env.FIRECRAWL_API_KEY,tavily:!!process.env.TAVILY_API_KEY}});
   if(action==='overview')return res.status(200).json(await counts(token));
   if(action==='users'){
    const profiles=await all(token,'contractors',1000);
    let authData=null,authError='';
    if(serviceConfigured())try{authData=await listFirebaseUsers(3);}catch(error){authError=String(error.message);}
    const map=new Map(profiles.items.map(p=>[p.ownerId||p.id,p]));
    const items=authData?authData.users.map(user=>({...user,organisation:map.get(user.uid)||null})):
      profiles.items.map(p=>({uid:p.ownerId||p.id,email:p.email||'',createdAt:p._createdAt||'',lastLoginAt:'',disabled:false,organisation:p}));
    return res.status(200).json({items,complete:!!authData&&!authData.hasMore,
      warning:authError||(!authData?'Firebase service account not configured. Showing organisation records only; Authentication-only users and last login dates are unavailable.':'')});
   }
   if(action==='opportunities')return res.status(200).json(await all(token,'opportunities',1000));
   if(action==='candidates')return res.status(200).json(await all(token,'discoveryCandidates',400));
   if(action==='jobs')return res.status(200).json(await all(token,'discoveryJobs',200));
   if(action==='job')return res.status(200).json({job:await firestore.get(token,jobPath(requireId(req.query.id)))});
   throw Object.assign(new Error('Unknown action.'),{status:404});
  }
  if(req.method==='POST'){
   if(action==='create')return res.status(201).json(await insertOpportunity(token,body,{actor:admin.uid}));
   if(action==='update')return res.status(200).json(await saveOpportunity(token,body,admin.uid));
   if(action==='delete')return res.status(200).json(await removeOpportunity(token,body.id));
   if(action==='start')return res.status(201).json(await startDiscovery(token,body,admin.uid));
   if(action==='tick')return res.status(200).json(await processDiscoveryJob(token,body.id));
   if(action==='import')return res.status(201).json(await importCandidate(token,body.id,body.overrides,admin.uid));
   if(action==='discard'){await firestore.update(token,'discoveryCandidates/'+requireId(body.id),{status:'discarded',updatedAt:now()});return res.status(200).json({discarded:true});}
   if(action==='store-pdfs'){
    const id=requireId(body.id),doc=await firestore.get(token,opportunityPath(id));
    if(!doc)throw Object.assign(new Error('Opportunity not found.'),{status:404});
    const documents=await storeFundingPdfs(id,doc.documents||[]);
    const updated=await firestore.update(token,opportunityPath(id),{documents,updatedAt:now(),updatedBy:admin.uid});
    return res.status(200).json(updated);
   }
   if(action==='reverify'){
    const id=requireId(body.id),doc=await firestore.get(token,opportunityPath(id));
    if(!doc||!publicUrl(doc.sourceUrl))throw Object.assign(new Error('A valid official source URL is required.'),{status:400});
    const extracted=await extractFunding(doc.sourceUrl);
    const stamp=now(),candidateId=randomUUID().replaceAll('-','');
    await firestore.create(token,'discoveryCandidates/'+candidateId,{
     id:candidateId,jobId:'reverification',sourceUrl:doc.sourceUrl,title:extracted.title,data:extracted.data,
     duplicateOf:id,status:extracted.data?'review':'incomplete',notice:extracted.notice,error:'',extractedAt:stamp,provider:'firecrawl'
    });
    await firestore.update(token,opportunityPath(id),{lastCheckedAt:stamp,updatedAt:stamp});
    return res.status(200).json({candidateId,notice:extracted.notice});
   }
  }
  res.setHeader('Allow','GET, POST');
  return res.status(405).json({error:'Method not allowed.'});
 }catch(error){return errorResponse(res,error);}
}
