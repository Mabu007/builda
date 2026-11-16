import {verifyUser,respondError,only} from './_lib/auth.js';
import {firestore,idToken} from './_lib/firestore-rest.js';
import {signedR2} from './_lib/r2.js';
export default async function handler(req,res){
 if(!only(req,res,'GET'))return;
 try{
  const user=await verifyUser(req),id=String(req.query.id||''),key=String(req.query.key||'');
  if(!/^[a-f0-9]{40}$/.test(id)||!/^funding\/[a-f0-9]{40}\/[a-f0-9-]{36}\.pdf$/.test(key))
   return res.status(400).json({error:'Invalid funding document.'});
  const op=await firestore.get(idToken(req),'opportunities/'+id);
  if(!op||(!user.admin&&op.published!==true))return res.status(404).json({error:'Document not found.'});
  if(!(op.documents||[]).some(file=>file.storageKey===key&&file.status==='stored'))return res.status(404).json({error:'Document is not attached.'});
  res.setHeader('Cache-Control','private, no-store');
  return res.status(200).json({url:signedR2('GET',key),expiresIn:300});
 }catch(error){return respondError(res,error);}
}
