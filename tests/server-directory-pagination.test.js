import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callCounts,categoryFor,funderRows,openCall,opportunityRows,pageItems,
 matchScore,personalised,publicOpportunity,requestLimit,requestPage} from '../api/_lib/directory-pages.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const NOW=Date.parse('2026-11-17T13:00:00+02:00');
const record=(id,funder,title,deadline,other={})=>({
 id,funder,title,deadline,status:'published',verificationStatus:'verified',
 round:'2026',sector:'Education & Research',description:'Education for Gauteng children',
 eligibility:'Nonprofit registered in South Africa',coverage:'Gauteng',...other
});

test('server pagination returns only a bounded page, preserving exact totals',()=>{
 const rows=Array.from({length:103},(_,i)=>({id:i}));
 assert.equal(requestPage('3'),3);
 assert.equal(requestPage('-4'),1);
 assert.equal(requestPage('999999999999'),1);
 assert.equal(requestLimit('100000','funders'),40);
 assert.equal(requestLimit(null,'funders'),20);
 assert.deepEqual(pageItems(rows,2,20).items.map(x=>x.id),Array.from({length:20},(_,i)=>i+20));
 const last=pageItems(rows,6,20);
 assert.equal(last.total,103);assert.equal(last.page,6);assert.equal(last.hasMore,false);
 assert.equal(last.items.length,3);
});

test('confirmed open calls outrank non-applicable and expired funders',()=>{
 const calls=[
  record('x','Alpha Foundation','Alpha call','2026-11-20'),
  record('y','Alpha Foundation','Second call','', {round:'Rolling applications – NPO grants'}),
  record('z','Beta Foundation','Old call','2026-11-01'),
  record('a','Gamma Foundation','Unverified call','2026-12-01',{verificationStatus:'unverified'}),
  record('b','Gamma Foundation','Draft','2026-12-01',{status:'draft'})
 ];
 assert.equal(openCall(calls[0],NOW),true);
 assert.equal(openCall(calls[1],NOW),true);
 assert.equal(openCall(calls[2],NOW),false);
 assert.equal(openCall(calls[3],NOW),false);
 assert.deepEqual([...callCounts(calls,NOW).entries()],[['alpha foundation',2]]);
 const funders=['Beta Foundation','Gamma Foundation','Alpha Foundation'].map((name,id)=>({id:String(id),name,focus:[],description:'',geography:''}));
 const ordered=funderRows(funders,calls,'',NOW);
 assert.deepEqual(ordered.map(f=>f.name),['Alpha Foundation','Beta Foundation','Gamma Foundation']);
 assert.deepEqual(ordered.map(f=>f.openCallCount),[2,0,0]);
 assert.deepEqual(funderRows(funders,calls,'alpha',NOW).map(f=>f.name),['Alpha Foundation']);
});

test('opportunity query sorts exact currently open calls first and preserves cross-page search',()=>{
 const calls=[
  record('c','C','Health contract','2026-11-09',{sector:'Health & Wellness'}),
  record('a','A','Education grants','2026-11-25'),
  record('b','B','Education programmes','2026-11-30',{verificationStatus:'reviewed'}),
  record('d','D','Health specialist','',{sector:'Health & Wellness',round:'Rolling applications – health'}),
  record('e','E','Unpublished education','2026-11-25',{status:'draft'})
 ];
 assert.deepEqual(opportunityRows(calls,{},NOW).map(x=>x.id),['a','d','b','c']);
 assert.deepEqual(opportunityRows(calls,{sector:'Health & Wellness'},NOW).map(x=>x.id),['d','c']);
 assert.deepEqual(opportunityRows(calls,{search:'Education'},NOW).map(x=>x.id),['a','b']);
 assert.equal(categoryFor(calls[0]),'Health & Wellness');
});

test('personalisation is server-side, follows 30% profile threshold, and does not exclude unmatched calls',()=>{
 const profile={name:'Example NPO',category:'Education and literacy',province:'Gauteng'};
 const records=[
  record('a','Other','Marine conservation','2026-11-25',{sector:'Environment & Conservation',description:'Marine projects'}),
  record('b','Match','School literacy programme','2026-12-01',{description:'Education and literacy support for Gauteng schools'})
 ];
 assert.equal(personalised(profile),true);
 assert.equal(personalised({name:'Example NPO',category:'Education'}),false);
 assert.ok(matchScore(records[1],profile,NOW)>matchScore(records[0],profile,NOW));
 assert.deepEqual(opportunityRows(records,{profile},NOW).map(x=>x.id),['b','a']);
 assert.equal(opportunityRows(records,{profile},NOW).length,2);
});

test('API projection never emits unpublished admin fields or internal research notes',()=>{
 const r={...record('abc','A','Test','2026-12-01'),notes:'Private admin note',
  internalCandidate:'secret',updatedBy:'admin',researchCaveat:'Important restrictions'};
 const publicRecord=publicOpportunity(r);
 assert.equal(publicRecord.title,'Test');
 assert.equal(publicRecord.researchCaveat,'Important restrictions');
 for(const key of ['notes','internalCandidate','updatedBy'])assert.equal(key in publicRecord,false);
});

test('frontend routes are lazy and all public directory reads are paged and cancellable',()=>{
 const main=source('src/main.tsx'),workspace=source('src/workspace/Workspace.tsx');
 const funders=source('src/workspace/Funders.tsx'),opps=source('src/workspace/FundingOpportunities.tsx');
 const briefing=source('src/workspace/FundingBriefing.tsx');
 const api=source('api/directory.js'),base=source('api/funders.js');
 const store=source('api/_lib/directory-store.js');
 assert.match(main,/React\.lazy\(\(\) => import\('\.\/admin\/AdminDashboard'\)\)/);
 assert.match(main,/React\.lazy\(\(\) => import\('\.\/workspace\/Workspace'\)\)/);
 assert.match(workspace,/React\.Suspense/);
 assert.match(workspace,/React\.lazy\(\(\) => import\('\.\/FundingOpportunities'\)\)/);
 assert.match(workspace,/React\.lazy\(\(\) => import\('\.\/Funders'\)\)/);
 assert.match(funders,/directoryRequest<DirectoryPage<PublicFunder>>/);
 assert.match(opps,/directoryRequest<DirectoryPage<FundingOpportunity>>/);
 assert.match(briefing,/kind=featured/);
 assert.match(opps,/kind=opportunity&id=/);
 assert.match(api,/await verifyUser\(req\)/);
 assert.match(base,/await verifyUser\(req\)/);
 assert.match(store,/TTL_MS=45000/);
 assert.match(store,/inflight/);
 for(const path of [funders,opps,briefing])assert.doesNotMatch(path,/onSnapshot\(query\(collection\(db,'opportunities'/);
});
