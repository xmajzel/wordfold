import assert from 'node:assert/strict';
import test from 'node:test';
import { compileScreened } from './spanish-c2-source-compile.mjs';
const candidate = id => ({ id, selectedTerm: 'subterfugio', selectedSource: { partOfSpeech: 'noun', exclusionReasons: [],
  senseId: 'sense-' + id, lexicalEntryId: 'lex-' + id, semanticReference: { iliId: id,
    spanish: { definition: null, examples: [] }, english: { definition: 'an evasive excuse', examples: [] } } } });
const authored = id => ({ id, decision: 'author', issue: '', definition: 'Pretexto empleado para evitar una obligación.',
  example: 'Utilizó un subterfugio para eludir aquella pregunta incómoda.', exampleSurfaceForm: 'subterfugio', translation: 'výhovorka',
  gender: 'masculine', alternativeForms: [], register: 'formal', levelRationale: 'Precise formal characterization of an evasive pretext.', objectiveId: 'C2-argument' });
const review = entries => ({ result: { entries }, resultSha256: 'fixture', finishedAt: '2026-09-13T17:00:00Z' });
const pass = id => ({ id, pass: true, issue: '' });
function compile(rows, spanish, slovak, existing = []) {
  return compileScreened({ candidates: rows.map(row => candidate(row.id)) }, [{ result: { entries: rows } }], review(spanish), review(slovak), existing);
}
test('only unchanged entries passing both independent reviews enter the draft', () => {
  const result = compile([authored('i1')], [pass('i1')], [pass('i1')]);
  assert.equal(result.preview.counts.C2, 1);
  assert.equal(result.preview.publicationStatus, 'draft');
  assert.equal(result.reviewed.entries[0].lexicalEvidence.selectedSenseId, 'sense-i1');
  assert.notEqual(result.reviews.spanish.reviewerId, result.reviews.slovak.reviewerId);
});
test('either review failure quarantines the entry and missing review coverage stops compilation', () => {
  for (const kind of ['spanish', 'slovak']) {
    const reports = { spanish: [pass('i1')], slovak: [pass('i1')] };
    reports[kind][0] = { id: 'i1', pass: false, issue: 'Wrong sense.' };
    const result = compile([authored('i1')], reports.spanish, reports.slovak);
    assert.equal(result.preview, null);
    assert.equal(result.quarantine.entries[0].reasons[0].stage, kind);
  }
  assert.throws(() => compile([authored('i1')], [], [pass('i1')]), /Incomplete/u);
});
test('deterministic failures cannot be overridden by AI passes', () => {
  for (const row of [{ ...authored('i1'), exampleSurfaceForm: 'missing' }, { ...authored('i1'), definition: 'short' }]) {
    const result = compile([row], [pass('i1')], [pass('i1')]);
    assert.equal(result.counts.accepted, 0);
    assert.equal(result.quarantine.entries[0].reasons[0].stage, 'deterministic-validation');
  }
  assert.equal(compile([authored('i1')], [pass('i1')], [pass('i1')], [{ term: 'subterfugio' }]).counts.accepted, 0);
});
test('explicit author rejection stays quarantined without requiring fabricated review results', () => {
  const result = compile([{ id: 'i1', decision: 'reject', issue: 'Placement uncertain.' }], [], []);
  assert.equal(result.counts.authorRejected, 1);
  assert.equal(result.preview, null);
});
