import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the exact TypeScript matcher included in the application bundle.
const source = readFileSync(new URL('../src/workspace/matching.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { hasMatchingProfile, matchTender } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const future = new Date(Date.now() + 5 * 86400000).toISOString();

test('incomplete company information does not produce false eligibility matches', () => {
  assert.equal(hasMatchingProfile({ category: 'Software' }), false);
  assert.equal(matchTender({ title: 'Software tender' }, { category: 'Software' }).score, 0);
});

test('ICT companies are matched to relevant open IT tenders', () => {
  const profile = { category: 'Software & Digital Services', services: 'IT support and cloud software', province: 'Gauteng' };
  const tender = { title: 'Managed IT software support services', province: 'Gauteng', closesAt: future };
  const result = matchTender(tender, profile);
  assert.ok(result.score >= 52, JSON.stringify(result));
  assert.ok(result.reasons.some(value => value.includes('Service fit')), JSON.stringify(result));
});

test('construction opportunities are not presented as strong security/cleaning matches', () => {
  const profile = { category: 'Cleaning & Hygiene', services: 'Commercial cleaning', province: 'Gauteng' };
  const tender = { title: 'Building renovation and civil engineering works', province: 'Gauteng', closesAt: future };
  assert.ok(matchTender(tender, profile).score < 52);
});

test('national providers are eligible for geography relevance signals', () => {
  const profile = { category: 'Catering & Hospitality', services: 'Meal catering', coverage: 'Nationwide' };
  const tender = { title: 'Catering of meals for hospitals', province: 'Eastern Cape', closesAt: future };
  const result = matchTender(tender, profile);
  assert.ok(result.score >= 52, JSON.stringify(result));
  assert.ok(result.reasons.some(value => value.includes('Nationwide')));
});

test('CIDB grading conflicts are surfaced rather than hidden by strong topic overlap', () => {
  const profile = { category: 'Civil Engineering', services: 'Civil engineering roads', province: 'Gauteng', cidb: '2 CE' };
  const tender = { title: 'Civil engineering roadworks', province: 'Gauteng', eligibility: 'Minimum CIDB 6 CE', closesAt: future };
  const result = matchTender(tender, profile);
  assert.ok(result.score < 52, JSON.stringify(result));
  assert.match(result.warning, /CIDB/i);
});
