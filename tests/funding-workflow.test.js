import test from 'node:test';
import assert from 'node:assert/strict';
import {insertOpportunity,saveOpportunity,startDiscovery} from '../api/admin.js';
import {firestore} from '../api/_lib/firestore-rest.js';
import {identityKey} from '../api/_lib/opportunities.js';
const base={title:'Youth Education Support 2027',funder:'Community Foundation',round:'2027',sourceUrl:'https://communityfoundation.org/grants',
 sector:'Education',description:'Support for community learning',verificationStatus:'verified',status:'published'};
test('admin can publish a manually entered opportunity without a website or verification flag',async()=>{
 const original={atomicCreate:firestore.atomicCreate,get:firestore.get,set:firestore.set};
 let created=[];
 try{
  firestore.atomicCreate=async(_token,records)=>{created=records;return true;};
  firestore.get=async()=>null;
  firestore.set=async()=>true;
  const item=await insertOpportunity('mock-token',{
   title:'Community kitchen funding',status:'published',contactEmail:'grants@example.org',
   applicationInstructions:'Email details of your programme.'},{actor:'admin-test'});
  assert.equal(item.published,true);
  assert.equal(item.verificationStatus,'unverified');
  assert.equal(item.sourceUrl,'');
  assert.equal(item.applicationUrl,'');
  assert.equal(item.contactEmail,'grants@example.org');
  assert.equal(created.length,2); // opportunity + identity key, no invented URL key
  assert.ok(created[0].path.startsWith('opportunities/'));
 }finally{Object.assign(firestore,original);}
});
test('admin can publish an existing draft with only a phone number',async()=>{
 const original={get:firestore.get,set:firestore.set,atomicUpdate:firestore.atomicUpdate};
 const id=identityKey({title:'School feeding support',funder:'Not specified'});
 const existing={id,title:'School feeding support',funder:'Not specified',status:'draft',published:false,
  source:'manual',verificationStatus:'unverified',requirements:[],documents:[],
  identityKey:id,identityAliases:[id],canonicalAliases:[],canonicalKey:'',createdAt:'2026-11-16T00:00:00Z'};
 let saved=null;
 try{
  firestore.get=async(_token,path)=>path.startsWith('opportunities/')?existing:null;
  firestore.set=async()=>true;
  firestore.atomicUpdate=async(_token,_path,fields)=>{saved=fields;return true;};
  const result=await saveOpportunity('mock-token',{id,status:'published',contactPhone:'+27 82 123 4567'},'admin-test');
  assert.equal(result.published,true);
  assert.equal(result.verificationStatus,'unverified');
  assert.equal(result.contactPhone,'+27 82 123 4567');
  assert.equal(result.sourceUrl,'');
  assert.equal(result.applicationUrl,'');
  assert.equal(saved?.published,true);
 }finally{Object.assign(firestore,original);}
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
