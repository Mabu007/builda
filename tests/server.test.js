import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../api/tenders.js';
import { signedR2 } from '../api/_lib/r2.js';

const release = {
  ocid: 'ocds-9t57fa-123456', id: 'release-789', date: '2026-11-10T09:00:00Z',
  buyer: { name: 'Example Municipality' },
  tender: {
    id: 'BID-123', title: 'Construction of a municipal access road',
    description: 'A public tender for civil works in Gauteng',
    status: 'active', category: 'works', province: 'Gauteng',
    tenderPeriod: { endDate: '2026-12-15T12:00:00+02:00' },
    documents: [{ title: 'Tender pack', url: 'https://www.etenders.gov.za/home/Download?id=123' }]
  }
};

test('normalization preserves real procurement details and official source link', () => {
  const row = normalize(release);
  assert.equal(row.id, release.ocid);
  assert.equal(row.title, release.tender.title);
  assert.equal(row.buyer, release.buyer.name);
  assert.equal(row.closesAt, release.tender.tenderPeriod.endDate);
  assert.equal(row.documents.length, 1);
  assert.match(row.sourceUrl, /^https:\/\/ocds-api\.etenders\.gov\.za\/api\/OCDSReleases\/release\//);
});

test('normalization ignores invalid and empty procurement notices', () => {
  assert.equal(normalize({ tender: { title: 'No OCID' } }), null);
  assert.equal(normalize({ ocid: 'some-id', tender: { title: '', description: '' } }), null);
});

test('unsafe tender document schemes are not returned', () => {
  const row = normalize({ ...release, tender: { ...release.tender, documents: [
    { title: 'Safe', url: 'https://www.etenders.gov.za/file.pdf' },
    { title: 'Unsafe', url: 'javascript:alert(1)' }
  ] } });
  assert.equal(row.documents.length, 1);
  assert.equal(row.documents[0].title, 'Safe');
});

test('private R2 signatures are time-limited and scoped to the bucket path', () => {
  const previous = {};
  for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) previous[key] = process.env[key];
  try {
    Object.assign(process.env, {
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_BUCKET_NAME: 'builda-private',
      R2_ACCESS_KEY_ID: 'test-access-key',
      R2_SECRET_ACCESS_KEY: 'test-secret-key'
    });
    const key = 'contractors/abc/12345678-1234-1234-1234-123456789abc/registration.pdf';
    const put = new URL(signedR2('PUT', key, 'application/pdf'));
    const get = new URL(signedR2('GET', key));
    assert.equal(put.hostname, 'a'.repeat(32) + '.r2.cloudflarestorage.com');
    assert.equal(put.pathname, '/builda-private/' + key);
    assert.equal(put.searchParams.get('X-Amz-Expires'), '300');
    assert.equal(put.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host');
    assert.equal(get.searchParams.get('X-Amz-SignedHeaders'), 'host');
    assert.notEqual(put.searchParams.get('X-Amz-Signature'), get.searchParams.get('X-Amz-Signature'));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
