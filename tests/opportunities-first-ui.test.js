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
