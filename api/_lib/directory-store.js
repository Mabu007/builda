import {firestore} from './firestore-rest.js';

// Read-through per-instance cache: all filtering is server-side; client receives
// only its requested rows. Coalesce concurrent reads and keep a short refresh TTL.
// Firestore's REST list uses opaque page tokens, not numeric offsets.
// This also means search and cross-collection sorting don't require a new
// composite index or a risky Firestore migration of existing legacy records.
const TTL_MS=45000,MAX_RECORDS=10000;
const cache=new Map();
export async function directoryCollection(token,name){
 if(name!=='funders'&&name!=='opportunities')throw new Error('Invalid directory collection.');
 const previous=cache.get(name);
 if(previous?.value&&Date.now()<previous.expires)return previous.value;
 if(previous?.inflight)return previous.inflight;
 const inflight=(async()=>{
  const items=[];let cursor='';
  do{
   const page=await firestore.list(token,name,200,cursor);
   items.push(...page.items);
   cursor=page.nextPageToken;
  }while(cursor&&items.length<MAX_RECORDS);
  if(cursor)throw Object.assign(new Error('Directory is larger than current search capacity; use an indexed search service.'),{status:503});
  cache.set(name,{value:items,expires:Date.now()+TTL_MS});
  return items;
 })();
 cache.set(name,{value:previous?.value,expires:0,inflight});
 try{return await inflight;}
 catch(error){cache.delete(name);throw error;}
}
export function dropDirectoryCache(name){cache.delete(name);}
