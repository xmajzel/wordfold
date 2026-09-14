import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { consolidate } from './consolidate-spanish-c2-drafts.mjs';
import { sha256Payload } from './spanish-catalog-utils.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const originalAudit = read('assets/catalog/spanish/reviews/c2-consolidated-placement-audit.json');
const originalSources = originalAudit.sources.map(source => ({ key: source.key, dataset: read(source.path),
  spanish: read(`assets/catalog/spanish/reviews/c2-${source.key}-spanish-review.json`),
  slovak: read(`assets/catalog/spanish/reviews/c2-${source.key}-slovak-review.json`) }));
const fixture = () => structuredClone({ sources: originalSources, audit: originalAudit });

test('consolidated selection preserves learner content and heterogeneous evidence without modifying inputs', () => {
  const { sources, audit } = fixture();
  const before = sha256Payload({ sources, audit });
  const result = consolidate(sources, audit);
  assert.equal(result.preview.entries.length, 277);
  assert.equal(result.deferred.entries.length, 52);
  assert.equal(result.preview.publicationStatus, 'draft');
  assert.equal(result.preview.lexicalEvidenceCounts['ai-reviewed-not-individually-source-verified'], 160);
  const originals = new Map(sources.flatMap(source => source.dataset.entries.map(entry => [entry.id, entry])));
  for (const entry of result.preview.entries) {
    const original = originals.get(entry.id);
    for (const field of ['term', 'definition', 'example', 'translation', 'gender', 'alternativeForms', 'sourceVersion', 'register']) {
      assert.deepEqual(entry[field], original[field]);
    }
    assert.equal(entry.sourceEntrySha256, sha256Payload(original));
    assert.equal(entry.lexicalEvidenceStatus, original.lexicalEvidence.verificationStatus);
  }
  assert.equal(sha256Payload({ sources, audit }), before);
  assert.deepEqual(result.preview, read('assets/catalog/spanish/c2-consolidated-preview.json'));
  assert.deepEqual(result.deferred, read('assets/catalog/spanish/c2-consolidated-deferred.json'));
});

test('changed datasets, stale placement decisions and changed rubric are rejected', () => {
  const mutations = [
    ({ sources }) => { sources[0].dataset.entries[0].definition += ' Changed.'; },
    ({ audit }) => { audit.entries[0].inputEntrySha256 = 'stale'; },
    ({ audit }) => { audit.rubric = { changed: true }; },
  ];
  for (const mutate of mutations) {
    const data = fixture(); mutate(data);
    assert.throws(() => consolidate(data.sources, data.audit), /changed|Stale/u);
  }
});

test('missing, extra and duplicate placement decisions fail coverage checks', () => {
  for (const kind of ['missing', 'extra', 'duplicate']) {
    const { sources, audit } = fixture();
    if (kind === 'missing') audit.entries.shift();
    else audit.entries.push({ ...audit.entries[0], entryId: kind === 'extra' ? 'unknown' : audit.entries[0].entryId });
    assert.throws(() => consolidate(sources, audit), /Missing|extra|Duplicate/u);
  }
});

test('placement inclusion cannot override failed or stale Spanish and Slovak reviews', () => {
  for (const kind of ['spanish', 'slovak']) {
    for (const failure of ['unresolved', 'stale']) {
      const { sources, audit } = fixture();
      if (failure === 'unresolved') sources[0][kind].entries[0].decision = 'changes-requested';
      else sources[0][kind].datasetSha256 = 'stale';
      assert.throws(() => consolidate(sources, audit), /Unresolved|stale/u);
    }
  }
});
