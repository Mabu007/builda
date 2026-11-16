import test from 'node:test';
import assert from 'node:assert/strict';
import {insertOpportunity,startDiscovery} from '../api/admin.js';
import {identityKey} from '../api/_lib/opportunities.js';
const base={title:'Youth Education Support 2027',funder:'Community Foundation',round:'2027',sourceUrl:'https://communityfoundation.org/grants',
 sector:'Education',description:'Support for community learning',verificationStatus:'verified',status:'published'};
test('publishing rejects an unverified opportunity or one with no official source',async()=>{
 await assert.rejects(()=>insertOpportunity('mock-token',{...base,verificationStatus:'unverified'}),/Official source URL/);
 await assert.rejects(()=>insertOpportunity('mock-token',{...base,sourceUrl:'',applicationUrl:''}),/Official source URL/);
});
test('funding creation is an atomic Firestore transaction across record and unique keys',async()=>{
 const previous=globalThis.fetch,previousProject=process.env.VITE_FIREBASE_PROJECT_ID;
 process.env.VITE_FIREBASE_PROJECT_ID='oppotron-test';
 const requests=[];
 try{
  globalThis.fetch=async(url,options={})=>{
   const path=String(url),body=options.body?JSON.parse(options.body):null;
   requests.push({path,method:options.method,body});
   if(path.endsWith('/documents:commit'))return {ok:true,status:200,json:async()=>({writeResults:[{updateTime:new Date().toISOString()}]})};
   if(path.includes('/documents/funders/')&&options.method==='GET')return {ok:false,status:404,json:async()=>({error:{code:404}})};
   if(path.includes('/documents/funders/')&&options.method==='PATCH')return {ok:true,status:200,json:async()=>({name:path,fields:body.fields})};
   throw new Error('Unexpected Firestore HTTP request: '+path+' '+options.method);
  };
  const result=await insertOpportunity('mock-token',base,{actor:'admin-test'});
  assert.equal(result.status,'published');assert.equal(result.funder,'Community Foundation');
  const commit=requests.find(x=>x.path.endsWith('/documents:commit'));
  assert.ok(commit);
  assert.equal(commit.body.writes.length,3);
  assert.equal(commit.body.writes[0].currentDocument.exists,false);
  assert.equal(commit.body.writes[0].update.name,'projects/oppotron-test/databases/(default)/documents/opportunities/'+identityKey(base));
  assert.ok(commit.body.writes.some(x=>x.update.name.includes('/opportunityKeys/i_')));
  assert.ok(commit.body.writes.some(x=>x.update.name.includes('/opportunityKeys/u_')));
 }finally{
  globalThis.fetch=previous;
  if(previousProject===undefined)delete process.env.VITE_FIREBASE_PROJECT_ID;else process.env.VITE_FIREBASE_PROJECT_ID=previousProject;
 }
});
test('duplicate key conflicts block a second copy',async()=>{
 const previous=globalThis.fetch,previousProject=process.env.VITE_FIREBASE_PROJECT_ID;
 process.env.VITE_FIREBASE_PROJECT_ID='oppotron-test';
 try{
  globalThis.fetch=async()=>({ok:false,status:409,json:async()=>({error:{message:'document already exists'}})});
  await assert.rejects(()=>insertOpportunity('mock-token',base),error=>error.status===409);
 }finally{
  globalThis.fetch=previous;
  if(previousProject===undefined)delete process.env.VITE_FIREBASE_PROJECT_ID;else process.env.VITE_FIREBASE_PROJECT_ID=previousProject;
 }
});
