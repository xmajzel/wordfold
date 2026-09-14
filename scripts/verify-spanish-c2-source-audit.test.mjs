import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareInputs, validateSourceAudit } from './verify-spanish-c2-source-audit.mjs';
import { sha256Payload } from './spanish-catalog-utils.mjs';

const audit = JSON.parse(readFileSync(new URL('../assets/catalog/spanish/reviews/c2-source-verification-audit.json', import.meta.url), 'utf8'));
const inputs = prepareInputs();

test('pinned archives reproduce all 160 lookup inputs and the saved adjudication validates', () => {
  assert.equal(inputs.entries.length, 160);
  assert.equal(inputs.entries.filter(entry => entry.senses.length).length, 97);
  assert.deepEqual(validateSourceAudit(audit, inputs), { total: 160, supported: 101, unresolved: 59, pinnedLibrary: 68, primaryPage: 33 });
});

test('headword matches do not automatically resolve the selected meaning', () => {
  const row = audit.entries.find(entry => entry.term === 'incertidumbre');
  assert(row.cachedCandidateCount > 0);
  assert.equal(row.decision, 'unresolved');
  const wrongSense = audit.entries.find(entry => entry.term === 'prevaricación');
  assert.equal(wrongSense.decision, 'supported');
  assert(wrongSense.evidence.every(evidence => evidence.kind === 'primary-page-read'));
});

test('stale source inputs, entry text and candidate senses are rejected', () => {
  for (const mutate of [
    value => { value.inputSha256 = 'stale'; },
    value => { value.entries[0].inputEntrySha256 = 'stale'; },
    value => { value.entries[0].candidateSensesSha256 = 'stale'; },
  ]) {
    const copy = structuredClone(audit); mutate(copy);
    assert.throws(() => validateSourceAudit(copy, inputs), /Stale|changed/u);
  }
});

test('missing and duplicate decisions cannot satisfy coverage', () => {
  const missing = structuredClone(audit); missing.entries.pop();
  assert.throws(() => validateSourceAudit(missing, inputs), /Incomplete/u);
  const duplicate = structuredClone(audit); duplicate.entries[1] = duplicate.entries[0];
  assert.throws(() => validateSourceAudit(duplicate, inputs), /Duplicate/u);
});

test('unsupported approvals and fabricated source senses are rejected', () => {
  const missingEvidence = structuredClone(audit);
  missingEvidence.entries.find(entry => entry.decision === 'supported').evidence = [];
  assert.throws(() => validateSourceAudit(missingEvidence, inputs), /needs evidence/u);
  const fabricated = structuredClone(audit);
  const sense = fabricated.entries.flatMap(entry => entry.evidence).find(evidence => evidence.kind === 'pinned-library-sense');
  sense.sense.english.definition = 'An invented sense.';
  assert.throws(() => validateSourceAudit(fabricated, inputs), /altered source sense/u);
  const incompletePage = structuredClone(audit);
  delete incompletePage.entries[0].evidence[0].senseLocator;
  assert.throws(() => validateSourceAudit(incompletePage, inputs), /Incomplete page/u);
});

test('validation is read-only and source evidence cannot assert publication or certified placement', () => {
  const before = sha256Payload({ audit, inputs });
  validateSourceAudit(audit, inputs);
  assert.equal(sha256Payload({ audit, inputs }), before);
  for (const field of ['publicationStatus', 'placementStatus', 'notHumanApproval']) {
    const copy = structuredClone(audit); copy[field] = 'approved';
    assert.throws(() => validateSourceAudit(copy, inputs));
  }
});
