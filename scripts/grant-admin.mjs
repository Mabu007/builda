/**
 * Explicit, owner-run admin provisioning script.
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/FIREBASE_PROJECT_ID.
 * Usage: node scripts/grant-admin.mjs <FIREBASE_AUTH_UID> --grant
 *        node scripts/grant-admin.mjs <FIREBASE_AUTH_UID> --revoke
 * Never invoke automatically at registration.
 */
import {googleAccessToken} from '../api/_lib/service-auth.js';
const uid=process.argv[2],mode=process.argv[3];
if(!uid||!/^[a-zA-Z0-9_-]{5,128}$/.test(uid)||!['--grant','--revoke'].includes(mode)){
 console.error('Usage: node scripts/grant-admin.mjs <FIREBASE_AUTH_UID> --grant|--revoke');
 process.exit(2);
}
const project=process.env.FIREBASE_PROJECT_ID||process.env.VITE_FIREBASE_PROJECT_ID;
if(!project)throw new Error('Set FIREBASE_PROJECT_ID.');
const token=await googleAccessToken();
const url='https://identitytoolkit.googleapis.com/v1/projects/'+encodeURIComponent(project);
async function request(path,payload){
 const response=await fetch(url+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(!response.ok)throw new Error('Firebase Auth administrator API denied the operation: HTTP '+response.status);
 return response.json();
}
const lookup=await request('/accounts:lookup',{localId:[uid]});
const user=lookup.users?.find(x=>x.localId===uid);
if(!user)throw new Error('No Auth account exists with this UID.');
let current={};
try{current=user.customAttributes?JSON.parse(user.customAttributes):{};}catch{throw new Error('Existing custom claims could not be parsed. No changes made.');}
if(mode==='--grant')current.admin=true;else delete current.admin;
await request('/accounts:update',{localId:uid,customAttributes:JSON.stringify(current)});
console.log((mode==='--grant'?'Granted':'Revoked')+' Firebase admin claim for UID '+uid+'. The user must refresh their ID token by signing out and back in.');
