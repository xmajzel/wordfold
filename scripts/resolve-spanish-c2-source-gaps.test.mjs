import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compileResolution } from './resolve-spanish-c2-source-gaps.mjs';
import { sha256Payload } from './spanish-catalog-utils.mjs';

const read = path => JSON.parse(readFileSync(new URL('../assets/catalog/spanish/' + path, import.meta.url), 'utf8'));
const draft = read('c2-consolidated-preview.json');
const prior = read('reviews/c2-source-verification-audit.json');
const review = read('reviews/c2-source-resolution-review.json');
const compile = input => compileResolution(draft, prior, input);

test('saved drafts reproduce all 59 decisions and preserve unchanged content', () => {
  const before = sha256Payload(draft);
  const { preview, held } = compile(review);
  assert.deepEqual(preview, read('c2-consolidated-source-preview.json'));
  assert.deepEqual(held, read('c2-source-held.json'));
  assert.equal(preview.entries.length, 271);
  assert.equal(held.entries.length, 6);
  assert.equal(new Set([...preview.entries, ...held.entries].map(entry => entry.id)).size, 277);
  for (const entry of preview.entries) {
    const original = draft.entries.find(item => item.id === entry.id);
    const changed = new Set(entry.contentAmendments?.map(change => change.field));
    for (const [field, value] of Object.entries(original)) {
      if (field !== 'lexicalEvidenceStatus' && !changed.has(field)) assert.deepEqual(entry[field], value);
    }
  }
  assert.equal(sha256Payload(draft), before);
});

test('amended text carries only local review; held entries never enter the preview', () => {
  const { preview, held } = compile(review);
  const amended = preview.entries.filter(entry => entry.contentAmendments);
  assert.equal(amended.length, 3);
  assert.equal(amended.filter(entry => entry.contentAmendments.some(change => change.field === 'definition')).length, 2);
  for (const entry of amended) assert.equal(entry.amendmentReview.independentlyRereviewed, false);
  for (const entry of held.entries) assert(!preview.entries.some(item => item.id === entry.id));
  assert.equal(preview.publicationStatus, 'draft');
  assert.equal(preview.placementStatus, 'provisional');
});

test('rejects stale baseline and prior audit', () => {
  assert.throws(() => compileResolution({ ...draft, batchId: 'changed' }, prior, review), /Stale baseline/u);
  assert.throws(() => compileResolution(draft, { ...prior, counts: {} }, review), /Stale prior/u);
});

test('rejects missing and duplicate decisions', () => {
  const missing = structuredClone(review);
  missing.entries.pop();
  assert.throws(() => compile(missing), /Incomplete resolution/u);
  const duplicate = structuredClone(review);
  duplicate.entries[1] = duplicate.entries[0];
  assert.throws(() => compile(duplicate), /Duplicate/u);
});

test('rejects unsupported changes, stale values and false independent-review claims', () => {
  for (const mutate of [
    row => { row.changes[0].field = 'translation'; },
    row => { row.changes[0].before = 'stale'; },
    row => { row.amendmentReview.independentlyRereviewed = true; },
  ]) {
    const changed = structuredClone(review);
    mutate(changed.entries.find(row => row.decision === 'amended'));
    assert.throws(() => compile(changed));
  }
});

test('rejects supported entries without evidence and false aggregate counts', () => {
  const missing = structuredClone(review);
  missing.entries[0].evidence = [];
  assert.throws(() => compile(missing), /Missing evidence/u);
  const counts = structuredClone(review);
  counts.counts.supported++;
  assert.throws(() => compile(counts), /Incorrect resolution counts/u);
});
