import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMinorityPosReport } from './classify-spanish-minority-pos.mjs';

test('expands a flagged source pair across normalized duplicate catalog entries', () => {
  const rows = [
    { normalizedLemma: 'solo', sourceTag: 'RG', totalFrequency: 49 },
    { normalizedLemma: 'solo', sourceTag: 'AQ0', totalFrequency: 51 },
    { normalizedLemma: 'sólo', sourceTag: 'RG', totalFrequency: 100 },
  ];
  const base = { isMultiwordExpression: false, level: 'A1', partOfSpeech: 'adverb', normalizedTerm: 'solo' };
  const report = buildMinorityPosReport(rows, { entries: [
    { ...base, id: 'plain', term: 'solo', sourceNormalizedTerm: 'solo', sourceRows: [1] },
    { ...base, id: 'accented', term: 'solo', sourceNormalizedTerm: 'sólo', sourceRows: [2] },
  ] });
  assert.equal(report.thresholds['0.5'].distinctSourceLemmaPosPairs, 1);
  assert.equal(report.thresholds['0.5'].catalogEntries, 2);
  assert.deepEqual(report.entries.map((entry) => entry.entryId), ['plain', 'accented']);
});
