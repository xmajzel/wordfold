import { buildSpanishCourseBase } from './build-spanish-course-base.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compileCervantes } from './compile-spanish-c2-cervantes.mjs';
import { sha256Payload } from './spanish-catalog-utils.mjs';

const read = path => JSON.parse(readFileSync(new URL('../assets/catalog/spanish/' + path, import.meta.url), 'utf8'));
const baseline = read('c2-consolidated-source-preview.json');
const screening = read('reviews/c2-cervantes-source-screening.json');
const dataset = read('c2-cervantes-candidates.json');
const review = read('reviews/c2-cervantes-local-review.json');
const course = buildSpanishCourseBase();
const compile = (data = dataset, check = review) => compileCervantes(baseline, screening, data, check, course);
const rebind = data => {
  const check = structuredClone(review);
  check.datasetSha256 = sha256Payload(data);
  for (const row of check.entries) row.entrySha256 = sha256Payload(data.entries.find(entry => entry.id === row.entryId));
  return check;
};

test('reproduces 801-entry draft while preserving the entire baseline', () => {
  const original = sha256Payload(baseline);
  const result = compile();
  assert.deepEqual(result.preview, read('c2-cervantes-expanded-preview.json'));
  assert.deepEqual(result.held, read('c2-cervantes-held.json'));
  assert.equal(result.preview.entries.length, 801);
  assert.equal(result.held.entries.length, 5);
  assert.deepEqual(result.preview.entries.slice(0, baseline.entries.length), baseline.entries);
  assert.equal(sha256Payload(baseline), original);
  assert.equal(result.preview.counts.C2, 801);
});

test('holds are excluded and local review cannot become independent or human approval', () => {
  const result = compile();
  for (const entry of result.held.entries) assert(!result.preview.entries.some(row => row.id === entry.id));
  for (const entry of result.preview.entries.slice(baseline.entries.length)) {
    assert.equal(entry.languageReview.independentReview, false);
    assert.equal(entry.languageReview.notHumanApproval, true);
  }
  assert.equal(result.preview.publicationStatus, 'draft');
  assert.equal(result.preview.placementStatus, 'provisional');
  const check = structuredClone(review);
  check.independentReview = true;
  assert.throws(() => compile(dataset, check));
});

test('rejects stale learner text and changed production data', () => {
  const data = structuredClone(dataset);
  data.entries[0].translation = 'changed';
  assert.throws(() => compile(data), /Stale language review/u);
  assert.throws(() => compileCervantes(baseline, screening, dataset, review, { ...course, title: 'changed' }), /Production course changed/u);
});

test('rejects missing or duplicate language-review decisions', () => {
  const missing = structuredClone(review);
  missing.entries.pop();
  assert.throws(() => compile(dataset, missing), /Incomplete language-review/u);
  const duplicate = structuredClone(review);
  duplicate.entries[1] = duplicate.entries[0];
  assert.throws(() => compile(dataset, duplicate), /Duplicate language-review/u);
});

test('rejects altered source mappings even when learner-review hashes are renewed', () => {
  const data = structuredClone(dataset);
  data.entries[0].lexicalEvidence.semanticReference.english.definition = 'An unrelated meaning.';
  assert.throws(() => compile(data, rebind(data)), /Altered source meaning/u);
});

test('rejects unapproved terms and incorrect counts', () => {
  const data = structuredClone(dataset);
  data.entries[0].term = 'ser';
  data.entries[0].normalizedTerm = 'ser';
  assert.throws(() => compile(data, rebind(data)), /Unknown or stale candidate/u);
  const check = structuredClone(review);
  check.counts.retained++;
  assert.throws(() => compile(dataset, check), /Incorrect review counts/u);
});

test('validates authored adjective surface forms and refuses examples without them', () => {
  const data = structuredClone(dataset);
  const entry = data.entries.find(row => row.term === 'cutáneo');
  assert.equal(entry.exampleSurfaceForm, 'cutánea');
  assert(entry.alternativeForms.some(form => form.form === 'cutánea'));
  entry.example = 'El informe describe otra reacción.';
  assert.throws(() => compile(data, rebind(data)), /Example surface missing/u);
});
