import assert from 'node:assert/strict';
import test from 'node:test';
import { bridgeEnglishEntry, buildSelection, earlierEvidence, compactReviewInputs, expandReviewInputs, selectionRequest, validateSelection } from './spanish-c2-source-selection.mjs';

function fixture() {
  const en = { id: 'omw-en-00000001-n', partOfSpeech: 'n', iliId: 'i1', definition: 'an evasive excuse', memberIds: ['en1'], examples: [] };
  const es = { id: 'omw-es-00000001-n', partOfSpeech: 'n', iliId: 'i1', definition: null, examples: [] };
  const record = term => ({ writtenForm: term, lexicalEntryId: term, senses: [{ synsetId: es.id, senseId: term + '-sense', lexicalEntryId: term }] });
  return {
    entry: { id: 'seed', term: 'subterfuge', partOfSpeech: 'noun', level: 'C2', definition: en.definition, catalogSenseId: 'different-version-offset' },
    english: { synsets: new Map([[en.id, en]]), membersById: new Map([['en1', 'subterfuge']]),
      entriesByKey: new Map([['subterfuge\u0000n', [{ senses: [{ synsetId: en.id }] }]]]) },
    spanish: { synsets: new Map([[es.id, es]]), entriesByKey: new Map(['subterfugio', 'excusa'].map(term => [term + '\u0000n', [record(term)]])) },
  };
}

test('cross-version retrieval requires matching lemma, POS, gloss and unambiguous ILI', () => {
  const { entry, english, spanish } = fixture();
  assert.equal(bridgeEnglishEntry(entry, english, spanish).length, 1);
  for (const change of [{ term: 'other' }, { partOfSpeech: 'verb' }, { definition: 'an unrelated sense' }]) {
    assert.deepEqual(bridgeEnglishEntry({ ...entry, ...change }, english, spanish), []);
  }
  const other = { ...english.synsets.values().next().value, id: 'other', iliId: 'i2' };
  english.synsets.set(other.id, other);
  english.entriesByKey.get('subterfuge\u0000n')[0].senses.push({ synsetId: 'other' });
  assert.deepEqual(bridgeEnglishEntry(entry, english, spanish), []);
});

test('Spanish POS mismatch cannot become a source-supported candidate', () => {
  const { entry, english, spanish } = fixture();
  spanish.synsets.values().next().value.partOfSpeech = 'v';
  assert.deepEqual(bridgeEnglishEntry(entry, english, spanish), []);
});

test('earlier-level exclusion uses the existing two-document threshold and lemma/POS', () => {
  const evidence = earlierEvidence('word\ttag\tnb_doc@a1\tnb_doc@a2\tnb_doc@b1\tnb_doc@b2\tnb_doc@c1\nexcusa\tNC0\t0\t1\t2\t3\t0\nexcusa\tVM\t0\t0\t0\t0\t1\n');
  assert.deepEqual(evidence.get('excusa\u0000noun'), ['B1', 'B2']);
  assert.equal(evidence.has('excusa\u0000verb'), false);
  assert.throws(() => earlierEvidence('word\ttag\n'), /Missing ELELex column/u);
});

test('selection groups synonyms, retains source aliases and never transfers English C2 placement', () => {
  const { entry, english, spanish } = fixture();
  const result = buildSelection([entry], english, spanish, { concepts: [] }, [], new Map([['excusa\u0000noun', ['B1']]]));
  assert.equal(result.counts.concepts, 1);
  assert.equal(result.counts.shortlistedAlternatives, 1);
  assert.equal(result.entries[0].placementStatus, 'unassessed');
  assert.equal(result.entries[0].semanticReference.sourceSenseAliases.length, 2);
  assert.deepEqual(result.entries[0].alternatives[1].exclusionReasons, ['earlier-level-lemma-pos-attestation']);
  assert.equal(result.entries[0].level, undefined);
});

test('existing production concepts and draft terms cannot inflate new coverage', () => {
  const { entry, english, spanish } = fixture();
  const existing = buildSelection([entry], english, spanish, { concepts: [{ id: 'es-sk:b2:i1', members: [] }] }, [], new Map());
  assert.equal(existing.counts.shortlistedConcepts, 0);
  const draft = buildSelection([entry], english, spanish, { concepts: [] }, [{ term: 'subterfugio' }, { term: 'excusa' }], new Map());
  assert.equal(draft.counts.shortlistedConcepts, 0);
});

test('shared review transport round-trips all evidence including unselected senses and rejection reasons', () => {
  const context = { term: 'subterfugio', target: 'pretexto evasivo', senses: [{ id: 'one', definition: 'first' }, { id: 'two', definition: 'second' }] };
  const rows = [{ ...context, id: 'R1', senseId: 'one', definition: 'text', issue: '' },
    { ...context, id: 'R2', senseId: '', definition: '', issue: 'No matching sense.' }];
  const compact = compactReviewInputs(rows);
  assert.equal(Object.keys(compact.contexts).length, 1);
  assert.equal(Object.keys(compact.sources).length, 2);
  assert.deepEqual(expandReviewInputs(compact), rows);
  const missing = structuredClone(compact); delete missing.sources.S2;
  assert.throws(() => expandReviewInputs(missing), /Unknown source/u);
  const invalid = structuredClone(compact); invalid.rows[0].contextRef = 'missing';
  assert.throws(() => expandReviewInputs(invalid), /Unknown review context/u);
});

test('screening requires full explicit coverage and allows only eligible Spanish alternatives', () => {
  const { entry, english, spanish } = fixture();
  const candidates = buildSelection([entry], english, spanish, { concepts: [] }, [], new Map([['excusa\u0000noun', ['B1']]]));
  const request = selectionRequest(candidates.entries);
  assert.deepEqual(request.rows[0].alternatives.map(row => row.term), ['subterfugio']);
  const accepted = { entries: [{ id: 'i1', decision: 'keep', selectedTerm: 'subterfugio', reason: 'Formal evasive pretext.' }] };
  assert.deepEqual(validateSelection(request, accepted), accepted.entries);
  for (const patch of [{ selectedTerm: 'excusa' }, { decision: 'hold' }, { decision: 'unknown' }, { id: 'i2' }, { reason: '' }]) {
    assert.throws(() => validateSelection(request, { entries: [{ ...accepted.entries[0], ...patch }] }));
  }
  assert.throws(() => validateSelection(request, { entries: [] }), /Incomplete/u);
  validateSelection(request, { entries: [{ id: 'i1', decision: 'hold', selectedTerm: '', reason: 'Placement uncertain.' }] });
});
