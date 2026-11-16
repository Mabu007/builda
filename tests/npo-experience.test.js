import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMessages } from '../api/assistant.js';

const workspace = readFileSync(new URL('../src/workspace/Workspace.tsx', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../src/oppo/Landing.tsx', import.meta.url), 'utf8');
const vault = readFileSync(new URL('../src/workspace/DocumentVault.tsx', import.meta.url), 'utf8');

test('fundraising workspace no longer fetches or presents eTenders listings', () => {
  assert.doesNotMatch(workspace, /\/api\/tenders|eTenders|NATIONAL TREASURY/);
  assert.match(workspace, /Funding opportunities/);
  assert.match(workspace, /FUNDING SOURCE INTEGRATIONS/);
});

test('NPO onboarding has no company or nonprofit mode chooser', () => {
  assert.doesNotMatch(workspace, /OrganisationOnboarding|chooseOrganisation/);
  assert.match(workspace, /Organisation profile/);
  assert.match(workspace, /organizationType: 'npo'/);
});

test('document upload includes NPO-specific categories', () => {
  assert.match(vault, /NPO registration/);
  assert.match(vault, /Constitution/);
  assert.match(vault, /Financial statements/);
  assert.match(vault, /Budgets & funding proposals/);
});

test('landing clearly discloses planned fundraising features', () => {
  assert.match(landing, /The AI Fundraising Workspace for Nonprofits/i);
  assert.match(landing, /TIPTAP|Tiptap/);
  assert.match(landing, /planned|coming/i);
});

test('AI uses NPO registration, beneficiary and funding priority information without fabricating figures', () => {
  const messages = buildMessages({
    company: {
      organizationType:'npo', name:'Hope NPO', registration:'NPO 123-456', pboNumber:'PBO 123',
      beneficiaries:'Youth in Soweto', fundingPriorities:'Learning materials', phone:'078 123 4567'
    },
    messages:[{role:'user',content:'Help me draft a grant proposal'}]
  });
  const context = messages[1].content;
  assert.match(context,/NPO 123-456/);
  assert.match(context,/Youth in Soweto/);
  assert.match(context,/Learning materials/);
  assert.doesNotMatch(context,/078 123 4567/);
  assert.match(messages[0].content,/Never invent/);
});
