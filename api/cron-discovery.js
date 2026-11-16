import {googleAccessToken,serviceConfigured} from './_lib/service-auth.js';
import {firestore} from './_lib/firestore-rest.js';
import {startDiscovery,processDiscoveryJob} from './admin.js';
import {extractFunding} from './_lib/discovery.js';
import {isExpired,identityKey} from './_lib/opportunities.js';
import {randomUUID} from 'node:crypto';
const weeklyQueries=[
 'South Africa NPO nonprofit grants open call applications education youth development CSI 2026 2027',
 'South Africa corporate CSI funding foundation grant programmes community development applications'
];
export default async function handler(req,res){
 try{
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  const expected=process.env.CRON_SECRET;
  if(!expected||req.headers.authorization!=='Bearer '+expected)return res.status(401).json({error:'Unauthorised scheduled request.'});
  if(!serviceConfigured())return res.status(503).json({error:'Firebase service account is required for unattended maintenance.'});
  const token=await googleAccessToken(),started=[],processed=[];
  const day=new Date().getUTCDay(),stamp=new Date().toISOString();
  if(day===1){
   const week=stamp.slice(0,10);
   const lock='discoveryLocks/weekly_'+week.replaceAll('-','');
   try{
    await firestore.create(token,lock,{createdAt:stamp});
    for(const query of weeklyQueries){const job=await startDiscovery(token,{mode:'search',query,limit:15},'scheduled');started.push(job.id);}
   }catch(error){if(error.status!==409)throw error;}
  }
  const jobs=(await firestore.list(token,'discoveryJobs',100)).items
    .filter(job=>!['done','failed'].includes(job.status)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).slice(0,3);
  for(const job of jobs){const value=await processDiscoveryJob(token,job.id);processed.push({id:job.id,status:value.status,cursor:value.cursor});}
  // Reverification is deliberately conservative: create a review candidate, never overwrite a published notice automatically.
  let reverified='';
  if(day===1){
   const opportunities=(await firestore.list(token,'opportunities',100)).items.filter(item=>item.status==='published'&&item.sourceUrl);
   const oldest=opportunities.sort((a,b)=>String(a.lastCheckedAt||'').localeCompare(String(b.lastCheckedAt||'')))[0];
   if(oldest){
    try{
     const extracted=await extractFunding(oldest.sourceUrl),candidateId=randomUUID().replaceAll('-','');
     await firestore.create(token,'discoveryCandidates/'+candidateId,{
       id:candidateId,jobId:'weekly-reverification',sourceUrl:oldest.sourceUrl,title:extracted.title||oldest.title,
       data:extracted.data||null,duplicateOf:oldest.id,status:extracted.data?'review':'incomplete',
       notice:extracted.notice||'',extractedAt:stamp,provider:'firecrawl'
     });
     await firestore.update(token,'opportunities/'+oldest.id,{lastCheckedAt:stamp});
     reverified=oldest.id;
    }catch{reverified='failed';}
   }
  }
  return res.status(200).json({started,processed,reverified,finishedAt:stamp});
 }catch(error){return res.status(502).json({error:'Scheduled discovery failed. Verify cron credentials and provider quotas.'});}
}
