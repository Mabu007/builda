import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const fundingModule=ts.transpileModule(source('src/workspace/funding.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {profileProgress,matchOpportunity}=await import('data:text/javascript;base64,'+Buffer.from(fundingModule).toString('base64'));

test('profile relevance becomes available at exactly 30%, not before',()=>{
 const bare={name:'Example NPO',category:'Education and skills'};
 assert.deepEqual(profileProgress({}),{count:0,percent:0,personalised:false});
 assert.deepEqual(profileProgress(bare),{count:2,percent:20,personalised:false});
 assert.deepEqual(profileProgress({...bare,province:'Gauteng'}),{count:3,percent:30,personalised:true});
 const call={id:'sample',title:'Education grant',sector:'Education and skills',funder:'Example Foundation',coverage:'South Africa',requirements:[],status:'published',verificationStatus:'verified'};
 assert.equal(matchOpportunity(call,bare).score,0);
 assert.ok(matchOpportunity(call,{...bare,province:'Gauteng'}).score>0);
});


test('funding profile threshold is 3 of 10 fields (30%)', () => {
  const funding = source('src/workspace/funding.ts');
  const fields = funding.match(/FUNDING_PROFILE_FIELDS=\[([^\]]+)\]/)?.[1] || '';
  assert.equal(fields.split(',').length, 10);
  assert.match(funding, /personalised:count>=3/);
});

test('funding feed lists published opportunities before onboarding and retains unmatched results', () => {
  const ui = source('src/workspace/FundingOpportunities.tsx');
  assert.match(ui, /all\.filter\(op=>op\.status==='published'\)/);
  assert.doesNotMatch(ui, /filter\(row=>row\.match\.eligible\)/);
  assert.match(ui, /onProfile:=>void|onProfile:\(\)=>void/);
  assert.match(ui, /Personalisation begins at 30%/);
});

test('home funding briefing shows published calls even for empty profiles', () => {
  const briefing = source('src/workspace/FundingBriefing.tsx');
  assert.match(briefing, /opportunities\.filter\(x=>x\.status==='published'\)/);
  assert.doesNotMatch(briefing, /filter\(item=>item\.match\.eligible\)/);
});

test('reopening an application does not overwrite existing notes or progress', () => {
  const ui = source('src/workspace/FundingOpportunities.tsx');
  assert.match(ui, /if\(applications\.includes\(op\.id\)\)/);
});

test('conversational assistant is removed without disabling document drafting', () => {
  assert.equal(existsSync(new URL('../api/assistant.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/workspace/AssistantHub.tsx', import.meta.url)), false);
  const workspace = source('src/workspace/Workspace.tsx');
  assert.doesNotMatch(workspace, /Ask OPPOTRON|AssistantHub|changeView\('assistant'\)/);
  assert.match(workspace, /<FundingCreator /);
});

test('dedicated administrator login checks Firebase custom claim', () => {
  const auth = source('src/main.tsx');
  assert.match(auth, /\/admin\/login/);
  assert.match(auth, /claims\.claims\.admin !== true/);
  assert.match(auth, /Administrator login|Admin access/);
});


test('manual opportunities can be published without mandatory source verification',()=>{
 const admin=source('src/admin/AdminDashboard.tsx');
 const backend=source('api/admin.js');
 assert.doesNotMatch(admin,/To publish, choose Verified|Verify the record and provide an official source/);
 assert.doesNotMatch(backend,/Official source URL and verified status are required|Set verification to Verified and supply/);
 assert.match(admin,/contactEmail/);
 assert.match(admin,/contactPhone/);
 assert.match(admin,/applicationInstructions/);
});

test('funding display keeps offline contact paths and source sites separate from application links',()=>{
 const opportunities=source('src/workspace/FundingOpportunities.tsx');
 const presentation=source('src/workspace/opportunity-display.ts');
 const tracking=source('src/workspace/FundingApplications.tsx');
 assert.match(opportunities,/selected\.contactPhone/);
 assert.match(opportunities,/fu-modal-redesign/);
 assert.match(presentation,/applicationInstructions/);
 assert.match(presentation,/View funder website/);
 assert.match(presentation,/mailto:/);
 assert.match(tracking,/selectedOp\.applicationInstructions/);
 assert.match(tracking,/selectedOp\?\.contactEmail/);
 assert.match(tracking,/selectedOp\?\.contactPhone/);
});

test('the funding modal leads with essential facts and removes the confusing technical status panel',()=>{
 const ui=source('src/workspace/FundingOpportunities.tsx');
 assert.match(ui,/Application deadline/);
 assert.match(ui,/Funding or support/);
 assert.match(ui,/Who can apply\?/);
 assert.match(ui,/How to apply/);
 assert.match(ui,/Prepare documents/);
 assert.match(ui,/Track application/);
 assert.doesNotMatch(ui,/Details unverified|Research status|What still needs verification|\/95 profile relevance/);
});

test('NPO workspace links to funders and linked funding records',()=>{
 const ui=source('src/workspace/Workspace.tsx');
 const directory=source('src/workspace/Funders.tsx');
 assert.match(ui,/id: 'funders', label: 'Funders'/);
 assert.match(ui,/<Funders user=/);
 assert.match(directory,/onOpportunity\(op\.id\)/);
 assert.match(directory,/contactEmail/);
});
