import {verifyUser} from './_lib/auth.js';
import {googleAccessToken,serviceConfigured} from './_lib/service-auth.js';
import {firestore,errorResponse} from './_lib/firestore-rest.js';
import {publicUrl} from './_lib/opportunities.js';

// Authenticated, read-only public projection. Never return admin's internal notes,
// account metadata, research contacts flagged private, or unpublished opportunities.
export function publicFunder(record={}){
 const name=String(record.name||'').trim();
 const website=publicUrl(record.website||'') ||
  (Array.isArray(record.sourceUrls)?record.sourceUrls.map(url=>publicUrl(url)).find(Boolean):'') || '';
 const cleaned=String(record.description||'').trim();
 const focus=(Array.isArray(record.sectors)?record.sectors:[]).map(x=>String(x||'').trim())
  .filter(x=>x&&!/^(corporate csi|general|other)$/i.test(x)).slice(0,15);
 // The historical CSI report is an internal research aid, not public-facing funder copy.
 return {
  id:String(record.id||record.slug||'').slice(0,80),
  name:name.slice(0,180),
  description:/^Historically reported CSI focus:/i.test(cleaned)?'':cleaned.slice(0,450),
  focus,
  geography:String(record.geography||'').slice(0,240),
  website,
  contactEmail:String(record.contactEmail||'').slice(0,254),
  contactPhone:String(record.contactPhone||'').slice(0,100)
 };
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 try{
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
  await verifyUser(req);
  if(!serviceConfigured())throw Object.assign(new Error('Funding directory is temporarily unavailable.'),{status:503});
  const token=await googleAccessToken();
  const records=[];let cursor='';
  do{
   const page=await firestore.list(token,'funders',200,cursor);
   records.push(...page.items);
   cursor=page.nextPageToken;
  }while(cursor&&records.length<1000);
  return res.status(200).json({items:records.map(publicFunder).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name)),
   hasMore:Boolean(cursor)});
 }catch(error){return errorResponse(res,error);}
}
