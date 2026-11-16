import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';

const workspace = readFileSync(new URL('../src/workspace/Workspace.tsx', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../src/oppo/Landing.tsx', import.meta.url), 'utf8');
const vault = readFileSync(new URL('../src/workspace/DocumentVault.tsx', import.meta.url), 'utf8');

test('fundraising workspace no longer fetches or presents eTenders listings', () => {
  assert.doesNotMatch(workspace, /\/api\/tenders|eTenders|NATIONAL TREASURY/);
  assert.match(workspace, /Funding opportunities/);
  assert.match(workspace, /FundingOpportunities/);
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
  assert.match(landing, /THE FUNDRAISING WORKSPACE FOR NONPROFITS/i);
  assert.match(landing, /TIPTAP|Tiptap/);
  assert.match(landing, /planned|coming/i);
});

test('general conversational assistant was retired, document creator remains available', () => {
  const creator = readFileSync(new URL('../src/workspace/FundingCreator.tsx', import.meta.url), 'utf8');
  assert.equal(existsSync(new URL('../api/assistant.js', import.meta.url)), false);
  assert.match(creator, /funding-draft|fundingDrafts/);
  assert.match(workspace, /FundingCreator/);
  assert.doesNotMatch(workspace, /Ask OPPOTRON|AssistantHub/);

});
