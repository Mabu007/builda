import {createSign} from 'node:crypto';
const issuer='https://oauth2.googleapis.com/token';
let cached={token:'',expiresAt:0};
export function serviceConfigured(){return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_CLIENT_EMAIL&&process.env.FIREBASE_PRIVATE_KEY);}
function account(){
 let config;
 try{config=process.env.FIREBASE_SERVICE_ACCOUNT_JSON?JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON):
   {client_email:process.env.FIREBASE_CLIENT_EMAIL,private_key:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n'),project_id:process.env.FIREBASE_PROJECT_ID||process.env.VITE_FIREBASE_PROJECT_ID};}
 catch{throw Object.assign(new Error('Firebase service account JSON is invalid.'),{status:503});}
 if(!config?.client_email||!config?.private_key||!config?.project_id)throw Object.assign(new Error('Firebase service account is not configured.'),{status:503});
 return config;
}
const base64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
export async function googleAccessToken(){
 if(cached.token&&Date.now()<cached.expiresAt)return cached.token;
 const a=account(),now=Math.floor(Date.now()/1000);
 const input=base64({alg:'RS256',typ:'JWT'})+'.'+base64({
  iss:a.client_email,sub:a.client_email,aud:issuer,iat:now,exp:now+3300,
  scope:'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit'
 });
 const sign=createSign('RSA-SHA256');sign.update(input);sign.end();
 const assertion=input+'.'+sign.sign(a.private_key).toString('base64url');
 const response=await fetch(issuer,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(14000)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.access_token)throw Object.assign(new Error('Firebase service account authentication failed.'),{status:503});
 cached={token:result.access_token,expiresAt:Date.now()+Math.min(result.expires_in||3200,3200)*1000};
 return cached.token;
}
export async function listFirebaseUsers(maxPages=3){
 const token=await googleAccessToken(),project=account().project_id;
 const users=[];let nextPageToken='';
 for(let page=0;page<maxPages;page++){
  const url=new URL('https://identitytoolkit.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/accounts:batchGet');
  url.searchParams.set('maxResults','1000');
  if(nextPageToken)url.searchParams.set('nextPageToken',nextPageToken);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(14000)});
  if(!response.ok)throw Object.assign(new Error('Firebase Authentication user listing is unavailable.'),{status:503});
  const result=await response.json();
  for(const u of result.users||[])users.push({
   uid:u.localId,email:u.email||'',emailVerified:!!u.emailVerified,displayName:u.displayName||'',
   createdAt:u.createdAt?new Date(Number(u.createdAt)).toISOString():'',lastLoginAt:u.lastLoginAt?new Date(Number(u.lastLoginAt)).toISOString():'',
   disabled:!!u.disabled,providerIds:(u.providerUserInfo||[]).map(p=>p.providerId),customClaims:u.customAttributes?JSON.parse(u.customAttributes):{}
  });
  nextPageToken=result.nextPageToken||'';if(!nextPageToken)break;
 }
 return {users,hasMore:!!nextPageToken};
}
