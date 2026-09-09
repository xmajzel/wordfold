import assert from 'node:assert/strict';
import test from 'node:test';
import { rankDistribution, selectExternalSample, wilson95 } from './spanish-a1-quality-qa.mjs';

test('selects the reproducible 62/238 external QA allocation without duplicates', () => {
  const entries = [
    ...Array.from({ length: 353 }, (_, index) => ({ entryId: `gloss-${index}`, evidenceStratum: 'spanish-gloss' })),
    ...Array.from({ length: 1354 }, (_, index) => ({ entryId: `bridge-${index}`, evidenceStratum: 'english-bridge-only' })),
  ];
  const first = selectExternalSample(entries, 'content-hash');
  const second = selectExternalSample([...entries].reverse(), 'content-hash');
  assert.deepEqual(first, second);
  assert.equal(first.length, 300);
  assert.equal(new Set(first.map((entry) => entry.entryId)).size, 300);
  assert.equal(first.filter((entry) => entry.evidenceStratum === 'spanish-gloss').length, 62);
  assert.equal(first.filter((entry) => entry.evidenceStratum === 'english-bridge-only').length, 238);
});

test('reports strict Wilson validity intervals and rank statistics separately', () => {
  const validity = wilson95(12, 300);
  assert.equal(validity.count, 12);
  assert.equal(validity.rate, 0.04);
  assert(validity.wilson95.lower < validity.rate);
  assert(validity.wilson95.upper > validity.rate);

  assert.deepEqual(rankDistribution([1, 2, 3, 5, 7, 11]), {
    count: 6,
    min: 1,
    median: 3,
    p90: 11,
    p95: 11,
    max: 11,
    buckets: { '1': 1, '2': 1, '3-5': 2, '6-10': 1, '11+': 1 },
  });
});
