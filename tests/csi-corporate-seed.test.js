import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CSI_COMPANIES,CSI_FOOTNOTES} from '../api/_lib/csi-corporate-2025.js';
import {corporateFunderId,csiFunderFields,csiResearchSummary,spendValue,CSI_IMPORT_VERSION} from '../api/_lib/csi-funder-transform.js';
import {publicFunder} from '../api/funders.js';

test('120 distinct companies, 112 disclosed values, five undisclosed, three unavailable, and 26 footnotes',()=>{
 assert.equal(CSI_COMPANIES.length,120);
 assert.equal(new Set(CSI_COMPANIES.map(x=>corporateFunderId(x.name))).size,120);
 assert.deepEqual(csiResearchSummary(),{companies:120,publishedSpend:112,notDisclosed:5,notAvailable:3,notes:26});
 for(const record of CSI_COMPANIES){
  assert.ok(record.name && record.focus && record.sourceReport);
  assert.ok([79,80,81,82,83].includes(record.handbookPage));
  if(record.note)assert.ok(CSI_FOOTNOTES[record.note]);
 }
});

test('historic spend is explicitly NOT a current grant amount',()=>{
 const absa=CSI_COMPANIES.find(r=>r.name==='Absa Group Limited');
 const funder=csiFunderFields(absa,null,'2026-11-17T00:00:00Z');
 assert.equal(funder.csiResearch.reported2024_25Rm,319);
 assert.equal(funder.csiResearch.reported2023_24Rm,286);
 assert.equal(funder.csiResearch.confirmedCurrentApplications,false);
 assert.equal(funder.published,false);
 assert.ok(!('opportunities' in funder));
 assert.equal(spendValue('Not disclosed'),null);
 assert.equal(spendValue('2,547.7'),2547.7);
 assert.equal(funder.csiResearch.importVersion,CSI_IMPORT_VERSION);
});

test('qualifications are preserved for values involving in-kind donations or global spend',()=>{
 const woolworths=csiFunderFields(CSI_COMPANIES.find(x=>x.name==='Woolworths'));
 assert.match(woolworths.csiResearch.qualification,/surplus-food donations/i);
 const glencore=csiFunderFields(CSI_COMPANIES.find(x=>x.name==='Glencore'));
 assert.match(glencore.csiResearch.qualification,/global spend/i);
});

test('existing funder contact details and editorial descriptions are not overwritten',()=>{
 const old={name:'Absa Group Limited',description:'Custom verified programme description',website:'https://example.com',
  contactEmail:'csi@example.com',contactPhone:'011 000 0000',sectors:['Youth development'],fundingTypes:['Grant'],notes:'Private notes'};
 const updated=csiFunderFields(CSI_COMPANIES.find(x=>x.name==='Absa Group Limited'),old);
 for(const field of ['description','website','contactEmail','contactPhone','notes'])
  assert.equal(updated[field],old[field]);
 assert.deepEqual(updated.sectors,old.sectors);
 assert.deepEqual(updated.fundingTypes,old.fundingTypes);
 assert.equal(updated.csiResearch.sourceEdition,2025);
});

test('public funder view contains historical citations but excludes private notes',()=>{
 const record=csiFunderFields(CSI_COMPANIES.find(x=>x.name==='Woolworths'),null);
 record.notes='Do not share';record.updatedBy='admin';
 const projected=publicFunder(record);
 assert.match(projected.historicalCsi.report,/Woolworths Good Business Journey/);
 assert.match(projected.historicalCsi.researchStatus,/Historical CSI/);
 assert.equal('notes' in projected,false);
 assert.equal('updatedBy' in projected,false);
});

test('one-time import only runs in Vercel production after successful build',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const build=pkg.scripts.build;
 assert.ok(build.indexOf('vite build')<build.indexOf('scripts/import-2025-csi-once.mjs'));
 const script=readFileSync(new URL('../scripts/import-2025-csi-once.mjs',import.meta.url),'utf8');
 assert.match(script,/process\.env\.VERCEL_ENV!=='production'/);
 assert.match(script,/existing\?\.csiResearch\?\.importVersion/);
 assert.doesNotMatch(script,/opportunities\//);
});
