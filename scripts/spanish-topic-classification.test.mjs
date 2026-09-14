import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { conceptInput, courseForTopicReview, hash, prepare, RUBRIC, runtimeIndex, validateRuntimeIndex, validateArtifact, validateOutput } from './spanish-topic-classification.mjs';

const concept = {
  id: 'es-sk:a2:amigo', level: 'A2', partOfSpeech: 'ADJ',
  members: [{ entryId: 'amigo-military', term: 'amigo', definition: 'Que pertenece a las fuerzas propias o aliadas.', example: 'El ejército amigo llegó a la frontera.' }],
};
const input = conceptInput(concept);
const classified = { conceptId: concept.id, topics: [], rationale: 'Allied military forces are outside the three everyday, business and study interests.' };
const artifact = () => ({
  schemaVersion: 1, courseId: 'es-sk', reviewKind: 'two-pass-ai-not-human', rubricSha256: hash(RUBRIC),
  entries: [{ conceptId: concept.id, contentSha256: hash(input), level: 'A2', topics: [],
    classification: { topics: [], rationale: classified.rationale }, reviewRationale: classified.rationale }],
});

test('accepts an explicit general classification and rejects omitted, duplicate or invalid labels', () => {
  validateOutput([input], [classified]);
  for (const entries of [[], [{ ...classified, conceptId: 'other' }], [{ ...classified, topics: ['spoken', 'spoken'] }], [{ ...classified, topics: ['military'] }]]) {
    assert.throws(() => validateOutput([input], entries));
  }
});
test('ties classifications to exact meanings, not merely the spelling or ID', () => {
  const course = { concepts: [concept] };
  validateArtifact(course, artifact());
  const changed = structuredClone(course);
  changed.concepts[0].members[0].definition = 'Persona con quien se tiene una amistad.';
  assert.throws(() => validateArtifact(changed, artifact()), /stale topic content/);
  const missingReview = artifact();
  missingReview.entries[0].reviewRationale = '';
  assert.throws(() => validateArtifact(course, missingReview), /rationale/);
});
test('preparation is reproducible and refuses to overwrite a changed catalog run', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wordfold-topics-'));
  try {
    const path = join(directory, 'course.json');
    writeFileSync(path, JSON.stringify({ status: 'production', courseId: 'es-sk', concepts: [concept] }));
    assert.deepEqual(prepare(path, join(directory, 'run')), { concepts: 1, batches: 1 });
    const before = readFileSync(join(directory, 'run/manifest.json'), 'utf8');
    prepare(path, join(directory, 'run'));
    assert.equal(readFileSync(join(directory, 'run/manifest.json'), 'utf8'), before);
    writeFileSync(path, JSON.stringify({ status: 'production', courseId: 'es-sk', concepts: [{ ...concept, level: 'B1' }] }));
    assert.throws(() => prepare(path, join(directory, 'run')), /changed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('the runtime index retains meaning IDs and is bound to its full review artifact', () => {
  const review = artifact();
  const index = runtimeIndex(review);
  assert.deepEqual(index.topicsByConcept, { [concept.id]: [] });
  assert.equal(index.reviewSha256, hash(review));
  validateRuntimeIndex(review, index);
  review.entries[0].topics = ['business'];
  assert.notEqual(runtimeIndex(review).reviewSha256, index.reviewSha256);
  assert.throws(() => validateRuntimeIndex(review, index), /does not match/);
});


test('preserves reviewed A1–C1 topics without claiming C2 coverage or accepting earlier-content drift', () => {
  const read = name => JSON.parse(readFileSync(new URL('../assets/catalog/spanish/' + name, import.meta.url), 'utf8'));
  const course = read('course.json');
  const review = read('course-topics.json');
  const scoped = courseForTopicReview(course, review);
  assert.equal(scoped.concepts.length, 5888);
  assert.equal(course.concepts.length - scoped.concepts.length, 801);
  assert.equal(hash(JSON.stringify(scoped, null, 2) + '\n'), review.courseSha256);
  course.concepts[0].members[0].definition = 'Changed meaning';
  assert.throws(() => courseForTopicReview(course, review), /Earlier topic-reviewed course content changed/);
});
