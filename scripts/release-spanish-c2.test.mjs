import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildSpanishCourseBase } from './build-spanish-course-base.mjs';
import { applyC2ReleaseAmendments, assembleSpanishC2, appendSpanishC2Release, validateC2ReleaseReviews } from './release-spanish-c2.mjs';
import { sha256Payload } from './spanish-catalog-utils.mjs';

const read = name => JSON.parse(readFileSync(new URL('../assets/catalog/spanish/' + name, import.meta.url), 'utf8'));
const preview = read('c2-cervantes-expanded-preview.json');
const amendments = read('c2-release-amendments.json');
const entries = applyC2ReleaseAmendments(preview, amendments);
const spanish = read('reviews/c2-release-spanish-review.json');
const slovak = read('reviews/c2-release-slovak-review.json');
const base = buildSpanishCourseBase();

test('releases exactly 801 reviewed entries and preserves every earlier concept and owner verdict', () => {
  const release = appendSpanishC2Release(base);
  assert.deepEqual(release, read('course.json'));
  assert.deepEqual(release.concepts.filter(entry => entry.level !== 'C2'), base.concepts);
  assert.deepEqual(release.excludedConcepts, base.excludedConcepts);
  assert.equal(release.counts.ownerPendingConcepts, base.counts.ownerPendingConcepts);
  assert.equal(release.c2Release.entryCount, 801);
  assert.equal(release.c2Release.notHumanApproval, true);
  assert.equal(release.c2Release.curriculumCoverage, 'partial');
  assert.equal(release.c2Release.entriesSha256, sha256Payload(entries));
  assert.equal(release.levels.C2, 'available');
  assert.equal(release.counts.concepts, 6689);
  assert.equal(release.counts.terms, 6887);
  const held = new Set(['c2-cervantes-held.json', 'c2-source-held.json', 'c2-consolidated-deferred.json']
    .flatMap(name => read(name).entries.map(entry => entry.id)));
  assert(release.concepts.every(concept => concept.members.every(member => !held.has(member.entryId))));
});

test('keeps original drafts immutable and applies only the five reviewed learner corrections', () => {
  const original = sha256Payload(preview);
  const amended = applyC2ReleaseAmendments(preview, amendments);
  assert.equal(sha256Payload(preview), original);
  assert.equal(amended.filter((entry, index) => sha256Payload(entry) !== sha256Payload(preview.entries[index])).length, 5);
  assert.equal(amended.find(entry => entry.term === 'mirilla').translation, 'priezor na dverách');
  assert.equal(amended.find(entry => entry.term === 'sumiller').gender, 'common');
  for (const change of amendments.changes) assert.deepEqual(amended.find(entry => entry.id === change.entryId)[change.field], change.after);
  const stale = structuredClone(amendments);
  stale.changes[0].before = 'changed';
  assert.throws(() => applyC2ReleaseAmendments(preview, stale), /Stale release amendment/);
  stale.changes[0].field = 'catalogSenseId';
  assert.throws(() => applyC2ReleaseAmendments(preview, stale), /identity or source/);
});

test('blocks incomplete, stale, duplicated, unresolved or non-independent reviews', () => {
  for (const change of [
    report => { report.entries.pop(); },
    report => { report.entries[0].entrySha256 = 'stale'; },
    report => { report.entries[1] = report.entries[0]; },
    report => { report.entries[0].decision = 'changes-requested'; },
    report => { report.entries[0].findings.push({ message: 'Unresolved' }); },
    report => { report.independentReview = false; },
    report => { report.notHumanApproval = false; },
    report => { report.reviewerId = slovak.reviewerId; },
  ]) {
    const altered = structuredClone(spanish);
    change(altered);
    assert.throws(() => validateC2ReleaseReviews(entries, altered, slovak));
  }
  const changed = structuredClone(entries);
  changed[0].translation = 'stale';
  assert.throws(() => validateC2ReleaseReviews(changed, spanish, slovak), /Stale final/);
  assert.throws(() => validateC2ReleaseReviews(entries, read('reviews/c2-release-spanish-review-r1.json'), slovak));
});

test('retains stable identities and accurate C2 source presentation', () => {
  const release = assembleSpanishC2(base, entries, spanish, slovak);
  const c2 = release.concepts.filter(concept => concept.level === 'C2');
  assert.deepEqual(c2.map(concept => concept.id), entries.map(entry => entry.catalogSenseId));
  c2.forEach((concept, index) => {
    assert.equal(concept.members[0].entryId, entries[index].id);
    assert.equal(concept.members[0].slovakHint, entries[index].translation);
    assert(!concept.sourceVersion.includes('elelex'));
    assert(!concept.levelEvidence.includes('ELELex'));
    assert.equal(concept.review.slovakOwnerVerdict, null);
  });
});
