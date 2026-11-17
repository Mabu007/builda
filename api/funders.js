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
 return {
  id:String(record.id||record.slug||'').slice(0,80),
  name:name.slice(0,180),
  description:String(record.description||'').slice(0,2400),
  focus:Array.isArray(record.sectors)?record.sectors.map(v=>String(v).slice(0,80)).slice(0,12):[],
  support:Array.isArray(record.fundingTypes)?record.fundingTypes.map(v=>String(v).slice(0,100)).slice(0,12):[],
  geography:String(record.geography||'').slice(0,240),
  website,
  contactEmail:String(record.contactEmail||'').slice(0,254),
  contactPhone:String(record.contactPhone||'').slice(0,100),
  historicalCsi:record.csiResearch?.sourceEdition===2025?{
   reported2024_25Rm:typeof record.csiResearch.reported2024_25Rm==='number'?record.csiResearch.reported2024_25Rm:null,
   reported2024_25Label:String(record.csiResearch.reported2024_25Label||'Not available'),
   reported2023_24Rm:typeof record.csiResearch.reported2023_24Rm==='number'?record.csiResearch.reported2023_24Rm:null,
   reported2023_24Label:String(record.csiResearch.reported2023_24Label||'Not available'),
   focus:String(record.csiResearch.reportedDevelopmentFocus||'').slice(0,1500),
   report:String(record.csiResearch.sourceReport||'').slice(0,380),
   handbookPage:Number(record.csiResearch.page||0),
   qualification:String(record.csiResearch.qualification||'').slice(0,750),
   reportPeriod:'2024/25 handbook comparison',
   researchStatus:'Historical CSI spending, not a current funding call'
  }:undefined
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
