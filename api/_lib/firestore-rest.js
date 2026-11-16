/* Firestore REST using a Firebase ID token: Rules remain authoritative. No server admin bypass. */
const projectId = () => process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
function root() {
  const id = projectId();
  if (!id || !/^[a-z0-9-]{4,80}$/i.test(id)) throw Object.assign(new Error('Firebase project missing.'), {status:503});
  return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(id) + '/databases/(default)/documents';
}
export function documentName(path) { return 'projects/' + projectId() + '/databases/(default)/documents/' + path; }
function checkPath(path) {
  if (!path || !/^[a-zA-Z0-9._~/-]{1,500}$/.test(path) || path.includes('..') || path.includes('//')) throw Object.assign(new Error('Invalid document path.'),{status:400});
  return path;
}
export function toFirestore(value) {
  if (value === null || value === undefined) return {nullValue:null};
  if (Array.isArray(value)) return {arrayValue:{values:value.slice(0,250).map(toFirestore)}};
  if (typeof value === 'boolean') return {booleanValue:value};
  if (typeof value === 'number') return Number.isInteger(value) ? {integerValue:String(value)} : {doubleValue:value};
  if (typeof value === 'string') return {stringValue:value};
  if (typeof value === 'object') return {mapValue:{fields:Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([key,v])=>[key,toFirestore(v)]))}};
  return {nullValue:null};
}
export function fromFirestore(value) {
  if (!value || 'nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestore);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v])=>[k,fromFirestore(v)]));
  return null;
}
const encode = fields => ({fields:Object.fromEntries(Object.entries(fields).filter(([,v])=>v!==undefined).map(([k,v])=>[k,toFirestore(v)]))});
function decode(data) {
  return {id:data.name?.split('/').at(-1),...Object.fromEntries(Object.entries(data.fields||{}).map(([k,v])=>[k,fromFirestore(v)])),_createdAt:data.createTime||'',_updatedAt:data.updateTime||''};
}
async function call(token, method, path, {query,body,timeout=13000}={}) {
  if (!token || typeof token !== 'string') throw Object.assign(new Error('Authentication required.'),{status:401});
  const url = new URL(root() + (path?'/'+checkPath(path):''));
  for (const [k,v] of Object.entries(query||{})) if(v!==undefined&&v!==null) url.searchParams.append(k,String(v));
  const response = await fetch(url,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
  const value=await response.json().catch(()=>({}));
  if(!response.ok) {
    const status=response.status===403?403:response.status===404?404:response.status===409?409:response.status===400?400:502;
    throw Object.assign(new Error(status===403?'Database permissions denied. Publish the new Firestore rules and verify your admin claim.':status===409?'This record already exists.':status===404?'Record not found.':status===400?'Invalid database request.':'Database request failed.'),{status,details:typeof value.error?.message==='string'?value.error.message.slice(0,200):''});
  }
  return value;
}
export const firestore = {
  async get(token,path) {try { return decode(await call(token,'GET',path));} catch(e){if(e.status===404)return null;throw e;}},
  async list(token,path,pageSize=100,pageToken='') {
    const data=await call(token,'GET',path,{query:{pageSize:Math.min(200,Math.max(1,pageSize)),...(pageToken?{pageToken}:{})}});
    return {items:(data.documents||[]).map(decode),nextPageToken:data.nextPageToken||''};
  },
  async create(token,path,fields) {
    const parts=checkPath(path).split('/');const id=parts.pop();if(!parts.length||!id)throw Object.assign(new Error('Invalid document path.'),{status:400});
    return decode(await call(token,'POST',parts.join('/'),{query:{documentId:id},body:encode(fields)}));
  },
  async set(token,path,fields) {return decode(await call(token,'PATCH',path,{body:encode(fields)}));},
  async update(token,path,patch) {const mask=Object.keys(patch);if(!mask.length)throw new Error('No changes supplied.'); const p=checkPath(path); const url=new URL(root()+'/'+p); for(const key of mask) url.searchParams.append('updateMask.fieldPaths',key);
    const response=await fetch(url,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(encode(patch)),signal:AbortSignal.timeout(13000)});
    if(!response.ok) throw Object.assign(new Error(response.status===403?'Database permissions denied.':'Unable to update the record.'),{status:response.status===403?403:502});
    return decode(await response.json());
  },
  async atomicCreate(token,records) {
    const writes=records.map(({path,fields})=>({update:{name:documentName(checkPath(path)),...encode(fields)},currentDocument:{exists:false}}));
    const url=root()+':commit';
    const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({writes}),signal:AbortSignal.timeout(14000)});
    if(!response.ok){const data=await response.json().catch(()=>({}));const conflict=[400,409,412].includes(response.status)&&/exists|precondition|already/i.test(JSON.stringify(data));
      throw Object.assign(new Error(conflict?'Opportunity already exists in the shared database.':'Database transaction failed.'),{status:conflict?409:response.status===403?403:502});}
    return true;
  },
  async atomicUpdate(token,path,fields,createRecords=[]) {
    const writes=[
      {update:{name:documentName(checkPath(path)),...encode(fields)},currentDocument:{exists:true}},
      ...createRecords.map(record=>({update:{name:documentName(checkPath(record.path)),...encode(record.fields)},currentDocument:{exists:false}}))
    ];
    const response=await fetch(root()+':commit',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({writes}),signal:AbortSignal.timeout(14000)});
    if(!response.ok){const data=await response.json().catch(()=>({}));const conflict=[400,409,412].includes(response.status)&&/exists|precondition|already/i.test(JSON.stringify(data));
      throw Object.assign(new Error(conflict?'Duplicate funder, application round or canonical source detected.':'Unable to update funding record.'),{status:conflict?409:response.status===403?403:502});}
    return true;
  },
  async remove(token,path) {await call(token,'DELETE',path);return true;}
};
export function idToken(req) {return /^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1]||'';}
export async function requireAdmin(req) {
  const {verifyUser}=await import('./auth.js');
  const actor=await verifyUser(req);
  if(!actor.admin) throw Object.assign(new Error('Administrator access required.'),{status:403});
  return {...actor,token:idToken(req)};
}
export function errorResponse(res,error) {
  const status=[400,401,403,404,409,429,503].includes(Number(error?.status))?Number(error.status):502;
  return res.status(status).json({error:status===502?'The service could not complete the request.':String(error?.message||'Request rejected.').slice(0,220)});
}
