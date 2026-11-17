import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAJOR_FUNDERS} from '../api/_lib/major-funders-2026.js';
import {ADDITIONAL_VERIFIED_CALLS,FUNDING_EXPANSION_AUDITED_AT} from '../api/_lib/funding-expansion-2026.js';
import {normalizeOpportunity,publicUrl,isExpired} from '../api/_lib/opportunities.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('major funder registry covers all 21 SETAs, verified institution identities and safe contact formats',()=>{
 assert.ok(MAJOR_FUNDERS.length>=60);
 const names=new Set();
 for(const f of MAJOR_FUNDERS){
  const key=f.name.trim().toLowerCase();
  assert.ok(!names.has(key),'duplicate funder '+f.name);
  names.add(key);
  assert.ok(publicUrl(f.website),'Invalid public site: '+f.name);
  assert.ok(publicUrl(f.sourceUrl),'Missing source: '+f.name);
  if(f.contactEmail)assert.match(f.contactEmail,/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
 }
 const setas=['AgriSETA','BANKSETA','CATHSSETA','Construction Education and Training Authority (CETA)',
  'Chemical Industries Education and Training Authority (CHIETA)','ETDP SETA','EWSETA','FASSET',
  'FP&M SETA','FoodBev SETA','Health and Welfare SETA (HWSETA)','INSETA','LGSETA','merSETA',
  'MICT SETA','Mining Qualifications Authority (MQA)','PSETA','SASSETA','Services SETA',
  'Transport Education Training Authority (TETA)','W&RSETA'];
 for(const name of setas)assert.ok(names.has(name.toLowerCase()),'Missing SETA '+name);
 assert.equal(MAJOR_FUNDERS.find(f=>f.name==='National Lotteries Commission').contactEmail,'nldtf@nlcsa.org.za');
 assert.equal(MAJOR_FUNDERS.find(f=>f.name==='DG Murray Trust').contactEmail,'info@dgmt.co.za');
 assert.equal(MAJOR_FUNDERS.some(f=>f.name==='SAB Foundation'),false,
  'SAB Foundation expressly excludes ordinary nonprofit funding and must not be promoted as an NPO grant funder');
});

test('additional opportunities are source-backed, unique, dated and explicit about restricted eligibility',()=>{
 assert.equal(FUNDING_EXPANSION_AUDITED_AT,'2026-11-17');
 assert.equal(ADDITIONAL_VERIFIED_CALLS.length,13);
 const seen=new Set();
 for(const row of ADDITIONAL_VERIFIED_CALLS){
  const key=(row.funder+'|'+row.title).toLowerCase();
  assert.ok(!seen.has(key),'duplicate '+key);seen.add(key);
  assert.ok(publicUrl(row.sourceUrl),'invalid original source '+row.title);
  assert.ok(row.eligibility.length>35,'missing eligibility '+row.title);
  assert.ok(row.applicationInstructions.length>35,'missing submission guidance '+row.title);
  if(row.status!=='published')continue;
  const op=normalizeOpportunity(row);
  assert.equal(op.verificationStatus,'verified');
  assert.equal(isExpired(op,Date.parse('2026-11-17T12:00:00+02:00')),false);
 }
 const draft=ADDITIONAL_VERIFIED_CALLS.find(x=>x.funder.includes('CHIETA'));
 assert.equal(draft.status,'draft');assert.equal(draft.verificationStatus,'reviewed');
 const west=ADDITIONAL_VERIFIED_CALLS.find(x=>x.funder==='Western Cape Department of Health and Wellness');
 assert.match(west.researchCaveat,/only NPOs who attended/i);
 const rise=ADDITIONAL_VERIFIED_CALLS.find(x=>x.funder==='Rise Up Together');
 assert.match(rise.researchCaveat,/NOT immediate grant/i);
 assert.ok(ADDITIONAL_VERIFIED_CALLS.filter(x=>x.status==='published').length>=10);
});

test('pagination is reusable, filter-safe and ranked strictly by actually open calls',()=>{
 const shared=src('src/workspace/DirectoryPagination.tsx');
 const funders=src('src/workspace/Funders.tsx');
 const opportunities=src('src/workspace/FundingOpportunities.tsx');
 assert.match(shared,/clampPage/);
 assert.match(shared,/Showing \{start\}–\{end\}/);
 assert.match(shared,/Previous/);
 assert.match(funders,/fundingState\(op\)!=='open'/);
 assert.match(funders,/linked\.get\(b\.name/);
 assert.match(funders,/pageItems\.map\(f=>/);
 assert.match(opportunities,/pageItems\.map\(\(\{op\}\)=>/);
 assert.match(opportunities,/useEffect\(\(\)=>setPage\(1\),\[search,sector\]\)/);
});

test('production importer is project-guarded, non-destructive and checks readbacks',()=>{
 const script=src('scripts/import-funder-expansion-once.mjs');
 assert.match(script,/VERCEL_ENV!=='production'/);
 assert.match(script,/builda-51678/);
 assert.match(script,/if\(old\)/);
 assert.match(script,/firestore\.update/);
 assert.match(script,/firestore\.create/);
 assert.match(script,/readOpportunities/);
 assert.match(script,/verifiedCurrentlyOpen/);
 assert.match(script,/existingOpportunities/);
 assert.match(script,/status==='published'/);
});
