import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VERIFIED_OPEN_CALLS,VERIFIED_CALLS_CHECKED_AT} from '../api/_lib/verified-open-calls-2026.js';
import {normalizeOpportunity,identityKey,isExpired,publicUrl} from '../api/_lib/opportunities.js';
import {publicFunder} from '../api/funders.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('25 official-source calls: valid HTTPS, current dates, 18 distinct funders and no duplicate IDs',()=>{
 assert.equal(VERIFIED_OPEN_CALLS.length,25);
 assert.equal(VERIFIED_CALLS_CHECKED_AT,'2026-11-17');
 assert.equal(new Set(VERIFIED_OPEN_CALLS.map(o=>o.funder)).size,18);
 const ids=new Set(),pairs=new Set();
 for(const entry of VERIFIED_OPEN_CALLS){
  const x=normalizeOpportunity(entry);
  assert.ok(publicUrl(x.sourceUrl));
  assert.equal(x.status,'published');
  assert.equal(x.verificationStatus,'verified');
  assert.ok(x.eligibility.length>30);
  assert.ok(x.applicationInstructions.length>20);
  assert.equal(isExpired(x,Date.parse('2026-11-17T12:00:00+02:00')),false);
  assert.ok(!ids.has(identityKey(x)),'Duplicate identity '+x.title);
  ids.add(identityKey(x));
  const pair=x.funder+'|'+x.title;
  assert.ok(!pairs.has(pair));
  pairs.add(pair);
 }
});
test('verified rolling funds have no invented deadlines',()=>{
 const rolling=VERIFIED_OPEN_CALLS.filter(x=>!x.deadline);
 assert.equal(rolling.length,9);
 rolling.forEach(x=>assert.match(x.round,/^Rolling applications/i));
 assert.equal(VERIFIED_OPEN_CALLS.filter(x=>x.deadline).length,16);
});
test('source distinctions prevent false application links and preserve recorded qualifiers',()=>{
 const teta=VERIFIED_OPEN_CALLS.find(x=>x.funder.includes('TETA'));
 assert.equal(teta.applicationUrl,'');
 assert.match(teta.applicationInstructions,/Indicium/);
 const mqa=VERIFIED_OPEN_CALLS.find(x=>x.title.startsWith('Mining Qualifications Authority'));
 assert.equal(mqa.applicationUrl,'https://mqaoneview.org.za/');
 const tsh=VERIFIED_OPEN_CALLS.find(x=>x.title.includes('CBO Organisational'));
 assert.match(tsh.notes,/NOT a direct/);
 const rock=VERIFIED_OPEN_CALLS.find(x=>x.title.startsWith('Cities Deliver'));
 assert.match(rock.eligibility,/city government/);
});
test('funders public API and new UI strip internal CSI spending, never invent contact email/phone',()=>{
 const p=publicFunder({name:'Absa Group Limited',description:'Historically reported CSI focus: Education',
  csiResearch:{reported2024_25Rm:319},sectors:['Education','Corporate CSI'],notes:'private'});
 assert.equal(p.description,'');assert.deepEqual(p.focus,['Education']);
 assert.equal('historicalCsi' in p,false);
 assert.equal('csiResearch' in p,false);
 assert.equal('notes' in p,false);
 assert.equal(p.website,'');assert.equal(p.contactEmail,'');assert.equal(p.contactPhone,'');
 const view=src('src/workspace/Funders.tsx');
 assert.match(view,/WHAT THEY SUPPORT/);
 assert.match(view,/OPPORTUNITIES/);
 assert.match(view,/CONTACT/);
 assert.match(view,/role="dialog"/);
 assert.doesNotMatch(view,/Historically reported CSI|2024\/25 comparison|csiResearch|historicalCsi/);
});
test('all 11 user-requested NPO funding categories appear as filters',()=>{
 const c=src('src/workspace/funding-categories.ts');
 const matches=c.match(/^ '.*',?$/gm)||[];
 assert.equal(matches.length,11);
 assert.match(src('src/workspace/FundingOpportunities.tsx'),/NPO_FUNDING_CATEGORIES/);
});
test('production-only importer protects project credentials and skips previews',()=>{
 const script=src('scripts/import-verified-open-calls-once.mjs');
 assert.match(script,/process\.env\.VERCEL_ENV!=='production'/);
 assert.match(script,/builda-51678/);
 assert.match(script,/firestore\.get\(token,'opportunities\/'/);
 assert.match(script,/if\(originals\.has\(key\)\)/);
 assert.match(script,/verificationStatus!=='verified'/);
});
