import type {User} from 'firebase/auth';

// Abort-safe client for the authenticated, server-ranked directory endpoints.
export async function directoryRequest<T>(user:User,url:string,options:{
 body?:Record<string,unknown>;signal?:AbortSignal
}={}):Promise<T>{
 const token=await user.getIdToken();
 if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const response=await fetch(url,{
  method:options.body?'POST':'GET',
  headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),
  signal:options.signal,
  cache:'no-store'
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(String(data.error||'Directory request failed.'));
 return data as T;
}
export type DirectoryPage<T>={items:T[];total:number;page:number;pageSize:number;hasMore:boolean};
