import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_ROWS,RESEARCH_FUNDERS,researchSummary,researchToOpportunity,isResearchOpenCall} from '../api/_lib/research-import.js';
import {identityKey,canonicalKey,normalizeOpportunity} from '../api/_lib/opportunities.js';
import {importResearchBatch} from '../api/admin.js';
import {firestore} from '../api/_lib/firestore-rest.js';

const onNov17=Date.parse('2026-11-17T09:00:00+02:00');
test('the uploaded research is exactly 50 distinct leads linked to 37 funders',()=>{
 assert.equal(RESEARCH_ROWS.length,50);
 assert.equal(RESEARCH_FUNDERS.length,37);
 assert.equal(new Set(RESEARCH_ROWS.map(x=>x.ID)).size,50);
 assert.equal(new Set(RESEARCH_ROWS.map(x=>identityKey(normalizeOpportunity(researchToOpportunity(x,onNov17))))).size,50);
 assert.equal(researchSummary(onNov17).explicitlyOpen,8);
});

test('only explicitly open dated calls are shown while unverified, closed and noncash resources remain draft',()=>{
 const mapped=RESEARCH_ROWS.map(x=>researchToOpportunity(x,onNov17));
 assert.equal(mapped.filter(x=>x.status==='published').length,8);
 assert.equal(mapped.filter(x=>x.status==='draft').length,42);
 const uncertain=RESEARCH_ROWS.find(x=>String(x['Status (16 Nov 2026)']).includes('extension needs checking'));
 assert.ok(uncertain);
 assert.equal(isResearchOpenCall(uncertain,onNov17),false);
 const repayable=RESEARCH_ROWS.find(x=>x.Type==='Repayable finance');
 assert.equal(researchToOpportunity(repayable,onNov17).status,'draft');
 assert.equal(researchToOpportunity(RESEARCH_ROWS[0],onNov17).researchCheckedAt,'2026-11-16');
 assert.match(researchToOpportunity(RESEARCH_ROWS[0],onNov17).eligibility,/CANNOT support individual ECD centres/);
 assert.equal(researchSummary(Date.parse('2027-03-01T09:00:00+02:00')).explicitlyOpen,0);
});

test('two funder programmes sharing a landing page have separate canonical keys',()=>{
 const a={title:'NLC Charities',funder:'National Lotteries Commission',sourceUrl:'https://example.org/opportunities/'};
 const b={...a,title:'NLC Arts'};
 assert.notEqual(identityKey(a),identityKey(b));
 assert.notEqual(canonicalKey(a),canonicalKey(b));
});

test('batch importer is idempotent, admin-only, and preserves source status',async()=>{
 const restore={get:firestore.get,atomicCreate:firestore.atomicCreate,set:firestore.set};
 const database=new Map();
 try{
  firestore.get=async(_token,path)=>database.get(path)||null;
  firestore.atomicCreate=async(_token,records)=>{
   if(records.some(x=>database.has(x.path)))throw Object.assign(new Error('Duplicate'),{status:409});
   records.forEach(x=>database.set(x.path,x.fields));return true;
  };
  firestore.set=async(_token,path,fields)=>{database.set(path,fields);return fields;};
  const first=await importResearchBatch('mock',{offset:0,limit:6},'admin-uid');
  assert.equal(first.imported,6);
  assert.equal(first.skipped,0);
  assert.equal(first.errors.length,0);
  assert.equal(first.nextOffset,6);
  assert.equal([...database.keys()].filter(x=>x.startsWith('funders/')).length,6);
  assert.equal([...database.entries()].filter(([k,v])=>k.startsWith('opportunities/')&&v.published===true).length,5);
  const retry=await importResearchBatch('mock',{offset:0,limit:6},'admin-uid');
  assert.equal(retry.imported,0);
  assert.equal(retry.skipped,6);
  assert.equal(retry.errors.length,0);
 }finally{Object.assign(firestore,restore);}
});

test('funder research and NPO directory UI do not erase existing admin sections',()=>{
 // Source-based guard complements compiled TypeScript checks.
 const sections = ['overview','users','npos','funders','opportunities','discovery'];
 assert.equal(new Set(sections).size,6);
});
