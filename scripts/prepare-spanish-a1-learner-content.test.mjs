import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPilot } from './prepare-spanish-a1-learner-content.mjs';
import { validateBatch } from './validate-spanish-a1-learner-content.mjs';

function entry(id, term, partOfSpeech) {
  return { entryId: id, term, partOfSpeech };
}

test('pilot selection is deterministic, POS-proportional, and retains multiwords', () => {
  const entries = [
    entry('n1', 'casa', 'noun'),
    entry('n2', 'parque natural', 'noun'),
    entry('n3', 'mesa', 'noun'),
    entry('v1', 'comer', 'verb'),
    entry('v2', 'vivir', 'verb'),
    entry('a1', 'alto', 'adjective'),
    entry('r1', 'bien', 'adverb'),
  ];
  const first = selectPilot(entries, 5);
  const second = selectPilot(entries, 5);
  assert.deepEqual(first, second);
  assert(first.some((candidate) => candidate.term === 'parque natural'));
  assert.equal(new Set(first.map((candidate) => candidate.entryId)).size, 5);
});

test('batch validation preserves fixed fields and accepts only a supplied sense', () => {
  const input = [{
    entryId: 'es-cefr:test',
    term: 'casa',
    normalizedTerm: 'casa',
    partOfSpeech: 'noun',
    level: 'A1',
    pcicClassification: null,
    candidateSenses: [{ senseId: 'omw-es-casa-test-n' }],
  }];
  const output = [{
    entryId: 'es-cefr:test',
    term: 'casa',
    normalizedTerm: 'casa',
    partOfSpeech: 'noun',
    level: 'A1',
    pcicClassification: null,
    meaningReferenceSenseId: 'omw-es-casa-test-n',
    definition: 'Edificio donde vive una persona.',
    example: 'Mi casa está cerca del parque.',
    confidence: 'high',
    needsReview: false,
    reviewNote: '',
  }];
  assert.equal(validateBatch(input, output).entries, 1);
  assert.throws(() => validateBatch(input, [{ ...output[0], term: 'hogar' }]), /fixed term changed/u);
  assert.throws(() => validateBatch(input, [{ ...output[0], meaningReferenceSenseId: 'not-supplied' }]), /selected sense was not supplied/u);
  assert.equal(validateBatch(input, [{ ...output[0], example: '¿Mi casa está cerca del parque?' }]).entries, 1);
});

test('pilot IDs can lead a full run without changing the remaining catalog order', () => {
  const entries = [
    entry('n1', 'casa', 'noun'),
    entry('n2', 'mesa', 'noun'),
    entry('v1', 'comer', 'verb'),
    entry('v2', 'vivir', 'verb'),
    entry('a1', 'alto', 'adjective'),
    entry('r1', 'bien', 'adverb'),
  ];
  const pilot = selectPilot(entries, 3);
  const pilotIds = new Set(pilot.map((candidate) => candidate.entryId));
  const fullOrder = [...pilot, ...entries.filter((candidate) => !pilotIds.has(candidate.entryId))];
  assert.deepEqual(fullOrder.slice(0, 3), pilot);
  assert.deepEqual(
    fullOrder.slice(3).map((candidate) => candidate.entryId),
    entries.filter((candidate) => !pilotIds.has(candidate.entryId)).map((candidate) => candidate.entryId),
  );
});
