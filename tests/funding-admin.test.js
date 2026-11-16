import test from 'node:test';
import assert from 'node:assert/strict';
import {createSign,generateKeyPairSync} from 'node:crypto';
import {identityKey,canonicalKey,publicUrl,normalizeOpportunity,isExpired,matchFunding} from '../api/_lib/opportunities.js';
import {toFirestore,fromFirestore,requireAdmin} from '../api/_lib/firestore-rest.js';
import {searchFunding,extractFunding} from '../api/_lib/discovery.js';

test('canonical URL removes trackers and blocks private or unsafe targets',()=>{
 assert.equal(publicUrl('https://grants.example.org/open/?utm_source=ads&x=1#apply'),'https://grants.example.org/open?x=1');
 for(const url of ['http://localhost/grants','https://127.0.0.1/file.pdf','https://example.org:444/','file:///etc/passwd','http://example.org/grant'])assert.equal(publicUrl(url),'');
});
test('shared funding database identity is deterministic across source URLs',()=>{
 const one={funder:'Foundation Africa',title:'Youth Education Grant',round:'2027',sourceUrl:'https://example.org/a'};
 const two={...one,sourceUrl:'https://another.org/b',title:' youth education grant '};
 assert.equal(identityKey(one),identityKey(two));
 assert.notEqual(identityKey(one),identityKey({...one,round:'2028'}));
 assert.equal(canonicalKey({...one,sourceUrl:'https://example.org/a?utm_source=mail'}),canonicalKey(one));
});
test('missing and unverified extraction details are not fabricated',()=>{
 assert.throws(()=>normalizeOpportunity({funder:'Helping Foundation'}),/title is required/i);
 const record=normalizeOpportunity({funder:'Helping Foundation',title:'School grant',sourceUrl:'https://example.org/funding'});
 assert.equal(record.amount,'');assert.equal(record.deadline,'');assert.equal(record.verificationStatus,'unverified');
 assert.equal(record.status,'draft');assert.equal(record.published,false);
 assert.throws(()=>normalizeOpportunity({title:'Grant',funder:'F',deadline:'tomorrow'}),/Deadline/);
});
test('manual funding entries may omit funder and URLs and use email or phone instead',()=>{
 const record=normalizeOpportunity({title:'Community outreach funding',status:'published',
  contactEmail:'grants@example.org',contactPhone:'+27 11 222 3333',
  applicationInstructions:'Email your application and phone the organisation if needed.'});
 assert.equal(record.published,true);
 assert.equal(record.status,'published');
 assert.equal(record.verificationStatus,'unverified');
 assert.equal(record.funder,'Not specified');
 assert.equal(record.sourceUrl,'');
 assert.equal(record.applicationUrl,'');
 assert.equal(record.canonicalUrl,'');
 assert.equal(record.contactEmail,'grants@example.org');
 assert.equal(record.contactPhone,'+27 11 222 3333');
 assert.match(record.applicationInstructions,/Email your application/);
});
test('source pages are never silently treated as application pages',()=>{
 const source=normalizeOpportunity({title:'Scholarship',sourceUrl:'https://grant.example.org/news'});
 assert.equal(source.sourceUrl,'https://grant.example.org/news');
 assert.equal(source.applicationUrl,'');
 const application=normalizeOpportunity({title:'Scholarship',applicationUrl:'https://grant.example.org/apply'});
 assert.equal(application.sourceUrl,'');
 assert.equal(application.applicationUrl,'https://grant.example.org/apply');
});
test('malformed emails, invalid calendar dates and unsafe URLs are rejected',()=>{
 assert.throws(()=>normalizeOpportunity({title:'Grant',contactEmail:'someone@@bad'}),/email/i);
 assert.throws(()=>normalizeOpportunity({title:'Grant',deadline:'2026-02-31'}),/Deadline/);
 assert.throws(()=>normalizeOpportunity({title:'Grant',applicationUrl:'javascript:alert(1)'}),/HTTPS/i);
});

test('expired grants are excluded and non-matching sectors do not qualify',()=>{
 const expired=normalizeOpportunity({title:'Grant',funder:'Foundation',deadline:'2023-01-01'});
 assert.equal(isExpired(expired),true);
 const match=matchFunding({sector:'Education',title:'School educational supplies',coverage:'Gauteng',registration:'NPO certificate',
   deadline:'2027-12-31',eligibility:'Registered NPOs'},{
   name:'Community NPO',category:'Education',description:'School education',province:'Gauteng',registration:'NPO 102'
 });
 assert.equal(match.eligible,true);
});
test('Firestore structured maps preserve strings, arrays, null and booleans',()=>{
 const value={title:'Grant',requirements:['Certificate','Finance'],published:true,amount:null,score:42};
 const result=fromFirestore(toFirestore(value));
 assert.deepEqual(result,value);
});
test('Firebase server refuses missing or non-admin claims before any database operation',async()=>{
 const oldFetch=globalThis.fetch,oldProject=process.env.VITE_FIREBASE_PROJECT_ID;
 process.env.VITE_FIREBASE_PROJECT_ID='test-oppotron';
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 globalThis.fetch=async url=>{
  if(String(url).includes('metadata/x509/securetoken'))return{ok:true,headers:{get:()=> 'public, max-age=3600'},json:async()=>({'kid-test':publicKey.export({type:'spki',format:'pem'})})};
  throw new Error('Unexpected URL');
 };
 function token(admin){
  const now=Math.floor(Date.now()/1000);
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'kid-test'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({
   aud:'test-oppotron',iss:'https://securetoken.google.com/test-oppotron',sub:'test-user-id',iat:now-10,
   auth_time:now-200,exp:now+3600,email:'admin@example.org',admin
  })).toString('base64url');
  const input=header+'.'+payload;
  const s=createSign('RSA-SHA256');s.update(input);s.end();
  return input+'.'+s.sign(privateKey).toString('base64url');
 }
 try{
  await assert.rejects(()=>requireAdmin({headers:{}}),e=>e.status===401);
  await assert.rejects(()=>requireAdmin({headers:{authorization:'Bearer '+token(false)}}),e=>e.status===403);
  const actor=await requireAdmin({headers:{authorization:'Bearer '+token(true)}});
  assert.equal(actor.admin,true);assert.equal(actor.uid,'test-user-id');
 }finally{globalThis.fetch=oldFetch;if(oldProject===undefined)delete process.env.VITE_FIREBASE_PROJECT_ID;else process.env.VITE_FIREBASE_PROJECT_ID=oldProject;}
});
test('Firecrawl search is primary and Tavily is the fallback only when needed',async()=>{
 const priorFetch=globalThis.fetch,oldFirecrawl=process.env.FIRECRAWL_API_KEY,oldTavily=process.env.TAVILY_API_KEY;
 process.env.FIRECRAWL_API_KEY='mock-firecrawl';process.env.TAVILY_API_KEY='mock-tavily';
 const calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});
   if(String(url).includes('firecrawl'))return{ok:true,status:200,json:async()=>({success:true,data:{web:[{url:'https://foundation.org/funding',title:'Foundation Grant'}]}})};
   throw Error('Tavily should not be called');};
  let result=await searchFunding('South Africa education CSI nonprofit funding',10);
  assert.equal(result.provider,'firecrawl');assert.equal(calls.length,1);
  globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});
   if(String(url).includes('firecrawl'))return{ok:false,status:500,json:async()=>({error:'Service down'})};
   return{ok:true,status:200,json:async()=>({results:[{url:'https://npo-funder.org/grants',title:'Grant listing'}]})};};
  result=await searchFunding('South Africa open NPO foundation grants',10);
  assert.equal(result.provider,'tavily');assert.equal(result.fallback,true);
 }finally{
  globalThis.fetch=priorFetch;
  if(oldFirecrawl===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=oldFirecrawl;
  if(oldTavily===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=oldTavily;
 }
});
test('Firecrawl scrape extraction remains unverified before human review',async()=>{
 const priorFetch=globalThis.fetch,old=process.env.FIRECRAWL_API_KEY;process.env.FIRECRAWL_API_KEY='mock';
 try{
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({success:true,data:{json:{
   title:'Youth Programme Fund',funder:'Community Foundation',deadline:'2027-06-30',
   amount:'',requirements:['Registered NPO'],documents:[{title:'Application PDF',url:'https://foundation.org/form.pdf'}]
  },metadata:{title:'Website'},markdown:'Original source'}})});
  const result=await extractFunding('https://foundation.org/youth-grant');
  assert.equal(result.data?.verificationStatus,'unverified');
  assert.equal(result.data?.deadline,'2027-06-30');
  assert.equal(result.data?.documents[0].sourceUrl,'https://foundation.org/form.pdf');
 }finally{globalThis.fetch=priorFetch;if(old===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=old;}
});
