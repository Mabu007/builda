import {verifyUser} from './_lib/auth.js';
import {googleAccessToken,serviceConfigured} from './_lib/service-auth.js';
import {firestore,errorResponse} from './_lib/firestore-rest.js';
import {directoryCollection} from './_lib/directory-store.js';
import {normalName,openCall,opportunityRows,pageItems,publicOpportunity,
 requestPage,requestLimit,queryText} from './_lib/directory-pages.js';

// Read-only authenticated API. All matching, sector filtering, live-status
// filtering and pagination occur server-side. No private admin research notes
// or unpublished records are exposed in the public response.
const allowedProfile=['name','registration','description','category','province','coverage',
 'services','beneficiaries','projects','goals','fundingPriorities','npcNumber','pboNumber'];
const cleanProfile=input=>Object.fromEntries(allowedProfile.map(k=>[k,typeof input?.[k]==='string'?input[k].slice(0,4000):'']));
const asString=v=>typeof v==='string'?v:'';
const notFound=()=>Object.assign(new Error('Funding opportunity not found.'),{status:404});
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 try{
  if(!['GET','POST'].includes(req.method)){
   res.setHeader('Allow','GET, POST');
   return res.status(405).json({error:'Method not allowed.'});
  }
  await verifyUser(req);
  if(!serviceConfigured())throw Object.assign(new Error('Funding directory is unavailable.'),{status:503});
  const token=await googleAccessToken();
  const kind=asString(req.query?.kind);
  if(kind==='opportunity'){
   if(req.method!=='GET')return res.status(405).json({error:'Use GET to open an opportunity.'});
   const id=asString(req.query?.id);
   if(!/^[a-zA-Z0-9_-]{12,80}$/.test(id))throw notFound();
   const op=await firestore.get(token,'opportunities/'+id);
   if(!op||op.status!=='published')throw notFound();
   return res.status(200).json({item:publicOpportunity(op)});
  }
  if(kind==='funder-calls'){
   if(req.method!=='GET')return res.status(405).json({error:'Use GET to view funder calls.'});
   const name=asString(req.query?.name).slice(0,180);
   if(!name.trim())return res.status(400).json({error:'Funder name is required.'});
   const all=await directoryCollection(token,'opportunities');
   const items=all.filter(op=>normalName(op.funder)===normalName(name)&&openCall(op))
    .sort((a,b)=>String(a.deadline||'9999').localeCompare(String(b.deadline||'9999')))
    .slice(0,100).map(publicOpportunity);
   return res.status(200).json({items,total:items.length});
  }
  if(kind!=='opportunities'&&kind!=='featured')return res.status(400).json({error:'Unknown directory request.'});
  if(req.method!=='POST')return res.status(405).json({error:'Use POST for ranked opportunities.'});
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
  const profile=cleanProfile(body.profile);
  const sector=asString(body.sector).slice(0,100);
  const search=queryText(body.search);
  const records=await directoryCollection(token,'opportunities');
  const sorted=opportunityRows(records,{sector,search,profile});
  const page=kind==='featured'?1:requestPage(body.page,'opportunities');
  const limit=kind==='featured'?3:requestLimit(body.limit,'opportunities');
  const slice=pageItems(sorted,page,limit);
  return res.status(200).json({...slice,items:slice.items.map(publicOpportunity)});
 }catch(error){return errorResponse(res,error);}
}
