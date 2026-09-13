import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignLevelFromDocumentCounts,
  buildSpanishCefrCatalog,
  isLexicalLemma,
  mapElelexTag,
  normalizeSpanishLemma,
} from './build-spanish-cefr-catalog.mjs';

function elelexRow(sourceRow, originalWord, sourceTag, level, count = 1) {
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
  return {
    sourceRow,
    originalWord,
    normalizedLemma: normalizeSpanishLemma(originalWord),
    sourceTag,
    level,
    levelFrequency: Object.fromEntries(levels.map((candidate) => [candidate, candidate === level ? count : 0])),
    totalFrequency: count,
    documentCount: Object.fromEntries(levels.map((candidate) => [candidate, candidate === level ? count : 0])),
    totalDocumentCount: count,
  };
}

test('normalizes ELELex multiword separators for OMW matching', () => {
  assert.equal(normalizeSpanishLemma('  A_PROPÓSITO_DE  '), 'a propósito de');
  assert.equal(isLexicalLemma('a'), false);
  assert.equal(isLexicalLemma('sr.'), false);
  assert.equal(isLexicalLemma('a propósito de'), true);
});

test('maps only unambiguous supported FreeLing tags', () => {
  assert.equal(mapElelexTag('AQS').partOfSpeech, 'adjective');
  assert.equal(mapElelexTag('NCM, NP0').partOfSpeech, 'noun');
  assert.equal(mapElelexTag('SP').reason, 'unsupported-freeling-tag');
  assert.equal(mapElelexTag('NCF, AQ0').reason, 'ambiguous-composite-freeling-tag');
});

test('assigns the first threshold level and leaves insufficient evidence unlevelled', () => {
  assert.deepEqual(
    assignLevelFromDocumentCounts({ A1: 1, A2: 3, B1: 4, B2: 0, C1: 0 }, 3),
    {
      level: 'A2',
      method: 'first-level-reaching-document-threshold',
      tiedMaximumLevels: [],
    },
  );
  assert.deepEqual(
    assignLevelFromDocumentCounts({ A1: 1, A2: 2, B1: 2, B2: 0, C1: 0 }, 3),
    {
      level: null,
      method: 'unattested',
      tiedMaximumLevels: [],
    },
  );
  assert.deepEqual(
    assignLevelFromDocumentCounts({ A1: 0, A2: 1, B1: 1, B2: 0, C1: 0 }, 3),
    {
      level: null,
      method: 'unattested',
      tiedMaximumLevels: [],
    },
  );
});

test('joins fixed membership, aggregates duplicate evidence, and records exclusions', () => {
  const rows = [
    elelexRow(2, 'casa', 'NCF', 'A2'),
    elelexRow(3, 'casa', 'NCM', 'A1'),
    elelexRow(4, 'correr', 'VM', 'B1'),
    elelexRow(5, 'y', 'CC', 'A1'),
    elelexRow(6, 'a', 'NCF', 'A1'),
    elelexRow(7, 'casa', 'NCF', 'A1'),
    elelexRow(8, 'parque_natural', 'NCM', 'A1', 2),
    elelexRow(9, 'España', 'NP*', 'A1', 2),
  ];
  const spanishOmw = {
    entriesByKey: new Map([
      ['casa\u0000n', [{ lexicalEntryId: 'omw-es-casa-n', senses: [{ senseId: 'omw-es-casa-1-n' }] }]],
      ['a\u0000n', [{ lexicalEntryId: 'omw-es-a-n', senses: [{ senseId: 'omw-es-a-1-n' }] }]],
      ['parque natural\u0000n', [{ lexicalEntryId: 'omw-es-parque_natural-n', senses: [{ senseId: 'omw-es-parque_natural-1-n' }] }]],
      ['españa\u0000n', [{ lexicalEntryId: 'omw-es-España-n', senses: [{ senseId: 'omw-es-España-1-n' }] }]],
    ]),
  };

  const result = buildSpanishCefrCatalog(rows, spanishOmw);

  assert.equal(result.entries.length, 4);
  const casa = result.entries.find((entry) => entry.normalizedTerm === 'casa');
  const nonlexical = result.entries.find((entry) => entry.normalizedTerm === 'a');
  assert.equal(casa.level, 'A1');
  assert.equal(casa.evidenceTier, 'attested');
  assert.equal(casa.courseEligibility.included, true);
  assert.deepEqual(casa.sourceRows, [2, 3, 7]);
  assert.equal(nonlexical.level, null);
  assert.equal(nonlexical.evidenceTier, 'unattested');
  assert.deepEqual(nonlexical.courseEligibility.exclusionReasons, ['unattested', 'nonlexical-term-shape']);
  assert.equal(result.entries.find((entry) => entry.normalizedTerm === 'parque natural').courseEligibility.included, true);
  assert.deepEqual(
    result.entries.find((entry) => entry.normalizedTerm === 'españa').courseEligibility.exclusionReasons,
    ['proper-name-source-tag'],
  );
  assert.equal(result.collapsedGroups.length, 1);
  assert.equal(result.unmatchedGroups[0].normalizedLemma, 'correr');
  assert.equal(result.unsupportedRows[0].normalizedLemma, 'y');
  assert.equal(result.nonlexicalGroups[0].normalizedLemma, 'a');
});

test('preserves source membership while applying audited proper-name and modern headword rules', () => {
  const rows = [
    elelexRow(2, 'Pablo', 'NCM', 'A1', 2),
    elelexRow(3, 'sólo', 'RG', 'A1', 2),
    elelexRow(4, 'guión', 'NCM', 'B1', 2),
  ];
  const spanishOmw = {
    entriesByKey: new Map([
      ['pablo\u0000n', [{
        lexicalEntryId: 'omw-es-Pablo-n',
        senses: [{ senseId: 'omw-es-Pablo-11225661-n' }],
      }]],
      ['sólo\u0000r', [{
        lexicalEntryId: 'omw-es-sólo-r',
        senses: [{ senseId: 'omw-es-sólo-00004722-r' }],
      }]],
      ['guión\u0000n', [{
        lexicalEntryId: 'omw-es-guión-n',
        senses: [{ senseId: 'omw-es-guión-07012279-n' }],
      }]],
    ]),
  };

  const result = buildSpanishCefrCatalog(rows, spanishOmw);
  assert.equal(result.entries.length, 3);

  const pablo = result.entries.find((entry) => entry.sourceNormalizedTerm === 'pablo');
  assert.equal(pablo.courseEligibility.included, false);
  assert.deepEqual(pablo.courseEligibility.exclusionReasons, ['proper-name-semantic-audit']);
  assert.equal(pablo.filters.properNameMethod, 'omw-wordnet-semantic-audit');

  const solo = result.entries.find((entry) => entry.sourceNormalizedTerm === 'sólo');
  assert.equal(solo.term, 'solo');
  assert.equal(solo.normalizedTerm, 'solo');
  assert.equal(solo.id, 'es-cefr:c882e187b6181abf');
  assert.deepEqual(solo.omw.joinNormalizedTerms, ['sólo']);
  assert.equal(solo.orthographyNormalization.sourceTerm, 'sólo');

  const guion = result.entries.find((entry) => entry.sourceNormalizedTerm === 'guión');
  assert.equal(guion.term, 'guion');
  assert.equal(guion.normalizedTerm, 'guion');
  assert.equal(guion.id, 'es-cefr:937a6e2d20c7a725');
  assert.deepEqual(guion.omw.senseIds, ['omw-es-guión-07012279-n']);
});
