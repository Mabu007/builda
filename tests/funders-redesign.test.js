import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicFunder} from '../api/funders.js';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('authenticated public funder projection never exposes admin-only internal notes',()=>{
 const source={id:'f1',name:'Example Foundation',website:'https://example.org',
  notes:'Private internal CSI research',updatedBy:'admin-user',
  sourceUrls:['https://example.org/old'],sectors:['Education'],
  fundingTypes:['Grant'],contactEmail:'grants@example.org',contactPhone:'+27 11 123 1234'};
 const row=publicFunder(source);
 assert.equal(row.name,'Example Foundation');
 assert.equal(row.focus[0],'Education');
 assert.equal(row.contactEmail,'grants@example.org');
 assert.equal(row.website,'https://example.org/');
 assert.equal('notes' in row,false);
 assert.equal('updatedBy' in row,false);
 assert.equal('researchStatuses' in row,false);
});

test('funding call has clear deadline and eligibility, not a noisy research status panel',()=>{
 const component=src('src/workspace/FundingOpportunities.tsx');
 const display=src('src/workspace/opportunity-display.ts');
 assert.match(component,/Application deadline/);
 assert.match(component,/Funding or support/);
 assert.match(component,/Who can apply\?/);
 assert.match(component,/How to apply/);
 assert.match(component,/Important to know/);
 assert.match(component,/View closed call/);
 assert.doesNotMatch(component,/Details unverified|Research status|profile relevance score/i);
 assert.match(display,/fundingState/);
 assert.match(display,/applicationRoute/);
});

test('official Scatec economic opportunity application is linked directly, not to a general landing page',()=>{
 const sources=src('src/workspace/confirmed-funding.ts');
 assert.match(sources,/ScatecSolutionsBroadBasedTrustEconomicOpportunityInnovationChallenge/);
 assert.match(sources,/communityinvestments@scatec\.com/);
 assert.match(sources,/Economic Opportunity Innovation Challenge/);
 assert.match(sources,/checkedOn='2026-11-17'/);
});

test('funder directory links published opportunities but keeps internal drafts private',()=>{
 const source=src('src/workspace/Funders.tsx');
 const api=src('api/funders.js');
 assert.match(source,/kind=funder-calls/);
 assert.doesNotMatch(source,/onSnapshot/);
 assert.match(source,/onOpportunity\(op\.id\)/);
 assert.match(source,/contactPhone/);
 assert.match(api,/await verifyUser\(req\)/);
 assert.match(api,/googleAccessToken/);
 assert.doesNotMatch(api,/notes:.*record\.notes/);
});
