import assert from 'node:assert/strict';
import test from 'node:test';
import { compactInputs, selectBenchmark, sourceCandidates, validateAuthor, validateReview, parseUsage } from './spanish-c2-source-benchmark.mjs';

const candidate = (id, term, synset = 'omw-es-00000001-n') => ({
  entry: { id, term, normalizedTerm: term, partOfSpeech: 'NOUN', definition: 'Objeto para un uso concreto.', objectiveIds: ['C2-test'], originalContentDeclaration: 'Original content.' },
  senses: [{ senseId: id + '-sense', spanishSynsetId: synset, spanish: { definition: null, examples: [] },
    english: { definition: 'a thing for a particular use', members: ['thing'], examples: [] } }],
});

test('compact format keeps all sense evidence and reversible per-entry IDs', () => {
  const selected = [candidate('one', 'objeto'), candidate('two', 'cosa')];
  const compact = compactInputs(selected);
  assert.equal(Object.keys(compact.evidence).length, 1);
  assert.deepEqual(compact.evidence.S001.en, selected[0].senses[0].english);
  assert.equal(compact.mappings[0].senses.S001, 'one-sense');
  assert.equal(compact.mappings[1].senses.S001, 'two-sense');
  assert.equal(compact.rows[0].target, selected[0].entry.definition);
});

test('selection is stable, spans available topics, and never credits a missing source', () => {
  const a = candidate('a', 'objeto');
  const b = candidate('b', 'cosa'); b.entry.objectiveIds = ['C2-other'];
  const missing = { ...candidate('c', 'nada'), senses: [] };
  assert.deepEqual(selectBenchmark([b, missing, a], 2), selectBenchmark([a, b, missing], 2));
  assert.throws(() => selectBenchmark([a, missing], 2), /Only 1/u);
});

test('source mapping rejects matching numeric offsets with conflicting interlingual IDs', () => {
  const entry = candidate('a', 'objeto').entry;
  const spanish = { entriesByKey: new Map([['objeto\u0000n', [{ senses: [{ senseId: 'sense', synsetId: 'omw-es-00000001-n' }] }]]]),
    synsets: new Map([['omw-es-00000001-n', { id: 'omw-es-00000001-n', partOfSpeech: 'n', iliId: 'i1' }]]) };
  const english = { synsets: new Map([['omw-en-00000001-n', { id: 'omw-en-00000001-n', partOfSpeech: 'n', iliId: 'i2' }]]) };
  assert.throws(() => sourceCandidates([entry], spanish, english), /ILI mismatch/u);
});

test('author validation blocks cross-entry senses and preserves justified source rejections', () => {
  const selected = [candidate('one', 'objeto'), candidate('two', 'cosa', 'omw-es-00000002-n')];
  const manifest = { selected, compact: compactInputs(selected) };
  const output = { entries: [
    { id: 'E01', senseId: 'S001', definition: 'Elemento que cumple una función concreta.', example: 'Este objeto sirve para abrir la caja.', translation: 'predmet', confidence: 'high', issue: '' },
    { id: 'E02', senseId: '', definition: '', example: '', translation: '', confidence: 'low', issue: 'No source sense supports the target.' },
  ] };
  assert.equal(validateAuthor(manifest, output, true)[0].senseId, 'one-sense');
  const wrong = structuredClone(output); wrong.entries[0].senseId = 'S002';
  assert.throws(() => validateAuthor(manifest, wrong, true), /cross-entry/u);
  const invented = structuredClone(output); invented.entries[1].definition = 'An invented sense.';
  assert.throws(() => validateAuthor(manifest, invented, true), /source rejection/u);
});

test('review coverage is explicit and cannot silently pass omitted or duplicate entries', () => {
  const entries = [{ id: 'a', pass: true, issue: '' }, { id: 'b', pass: false, issue: 'Wrong sense.' }];
  validateReview(['a', 'b'], { entries });
  assert.throws(() => validateReview(['a', 'b'], { entries: entries.slice(0, 1) }), /Incomplete/u);
  assert.throws(() => validateReview(['a', 'b'], { entries: [entries[0], entries[0]] }), /duplicate/u);
  assert.throws(() => validateReview(['a'], { entries: [{ id: 'a', pass: true, issue: 'Wrong meaning.' }] }), /mismatch/u);
});

test('token totals come from provider usage, with cached input counted only once', () => {
  const event = { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20 } };
  assert.deepEqual(parseUsage(JSON.stringify(event)), { inputTokens: 100, cachedInputTokens: 80, outputTokens: 20, totalTokens: 120 });
  assert.throws(() => parseUsage(JSON.stringify({ type: 'turn.completed' })), /usage/u);
});
