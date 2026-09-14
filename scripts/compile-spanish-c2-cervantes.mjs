import { buildSpanishCourseBase } from './build-spanish-course-base.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeSpanishTerm, sha256Payload } from './spanish-catalog-utils.mjs';
import { levels, validateExpansionDataset } from './spanish-expansion-pipeline.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = resolve(root, 'assets/catalog/spanish');
const read = name => JSON.parse(readFileSync(resolve(base, name), 'utf8'));

// This deliberately does not enter the pipeline requiring independent reviewers.
// Its output remains an explicitly local-AI-reviewed, unpublished draft.
export function compileCervantes(baseline, screening, dataset, review, course) {
  assert.equal(baseline.publicationStatus, 'draft');
  assert.equal(screening.provenance.draftSha256, sha256Payload(baseline), 'Stale screening baseline.');
  assert.equal(screening.provenance.courseSha256, sha256Payload(course), 'Production course changed.');
  assert.equal(dataset.screeningSha256, sha256Payload(screening), 'Stale screening reference.');
  assert.equal(dataset.baselinePreviewSha256, sha256Payload(baseline), 'Stale dataset baseline.');
  assert.equal(review.baselinePreviewSha256, sha256Payload(baseline), 'Stale review baseline.');
  assert.equal(review.datasetSha256, sha256Payload(dataset), 'Stale language review.');
  assert.equal(review.reviewerType, 'ai-local');
  assert.equal(review.independentReview, false);
  assert.equal(review.notHumanApproval, true);
  assert.equal(review.publicationStatus, 'draft');
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(review.reviewedAt));
  validateExpansionDataset(dataset, baseline.entries);
  const candidates = new Map(screening.entries.filter(row => row.selectedSense).map(row => [row.term, row]));
  const expectedConcepts = new Set([...candidates.values()].map(row => row.selectedSense.iliId));
  const concepts = new Set(), terms = new Set(baseline.entries.map(row => row.normalizedTerm));
  for (const concept of course.concepts) for (const member of concept.members) terms.add(normalizeSpanishTerm(member.term));
  const productionConcepts = new Set(course.concepts.map(row => row.id.split(':').at(-1)));
  const reviewById = new Map();
  for (const row of review.entries) {
    assert(!reviewById.has(row.entryId), 'Duplicate language-review decision.');
    assert(['no-issue', 'held'].includes(row.decision) && row.notes?.trim(), 'Unresolved language review.');
    reviewById.set(row.entryId, row);
  }
  assert.equal(reviewById.size, dataset.entries.length, 'Incomplete language-review coverage.');
  const retained = [], held = [];
  for (const entry of dataset.entries) {
    const candidate = candidates.get(entry.term);
    assert(candidate && entry.sourceCandidateSha256 === sha256Payload(candidate), 'Unknown or stale candidate.');
    assert.deepEqual(entry.lexicalEvidence.semanticReference, candidate.selectedSense, 'Altered source meaning.');
    assert(candidate.selectedSense.sourceSenseAliases.some(alias => alias.senseId === entry.lexicalEvidence.selectedSenseId), 'Unknown source sense ID.');
    assert.equal(entry.partOfSpeech, { n: 'NOUN', v: 'VERB', a: 'ADJ', r: 'ADV' }[candidate.selectedPartOfSpeech], 'Source POS mismatch.');
    assert.equal(entry.placementStatus, 'provisional');
    assert.deepEqual(entry.placementEvidence, candidate.placementEvidence);
    const ili = candidate.selectedSense.iliId;
    assert(!concepts.has(ili) && !productionConcepts.has(ili), 'Duplicate or existing production concept.');
    assert(!terms.has(entry.normalizedTerm), 'Duplicate or existing term.');
    terms.add(entry.normalizedTerm); concepts.add(ili);
    const sourceTexts = [candidate.selectedSense.spanish.definition, candidate.selectedSense.english.definition,
      ...candidate.selectedSense.spanish.examples, ...candidate.selectedSense.english.examples].filter(Boolean).map(normalizeSpanishTerm);
    for (const field of ['definition', 'example']) {
      const words = entry[field].split(/\s+/u).length;
      assert(words >= (field === 'definition' ? 3 : 4) && words <= 24, 'Learner text length out of bounds.');
      assert(!sourceTexts.includes(normalizeSpanishTerm(entry[field])), 'Verbatim source text in learner content.');
    }
    const verdict = reviewById.get(entry.id);
    assert(verdict && verdict.entrySha256 === sha256Payload(entry), 'Stale entry review.');
    if (verdict.decision === 'held') held.push({ ...entry, holdReason: verdict.notes });
    else retained.push({ ...entry, lexicalEvidenceStatus: 'pinned-source-linked-with-local-ai-review-not-independent-or-human',
      languageReview: { reviewSha256: sha256Payload(review), reviewerType: 'ai-local', independentReview: false, notHumanApproval: true } });
  }
  assert.deepEqual(concepts, expectedConcepts, 'Incomplete concept coverage.');
  assert.deepEqual(review.counts, { reviewed: dataset.entries.length, retained: retained.length, held: held.length }, 'Incorrect review counts.');
  const entries = [...baseline.entries, ...retained];
  const counts = Object.fromEntries(levels.map(level => [level, entries.filter(entry => entry.level === level).length]));
  const lexicalEvidenceCounts = {};
  for (const entry of entries) lexicalEvidenceCounts[entry.lexicalEvidenceStatus] = (lexicalEvidenceCounts[entry.lexicalEvidenceStatus] ?? 0) + 1;
  const metadata = { schemaVersion: 1, courseId: 'es-sk', publicationStatus: 'draft', placementStatus: 'provisional',
    notHumanApproval: true, baselinePreviewSha256: sha256Payload(baseline), datasetSha256: sha256Payload(dataset),
    screeningSha256: sha256Payload(screening), localReviewSha256: sha256Payload(review) };
  return {
    preview: { ...metadata, batchId: 'c2-cervantes-expanded-2026-09-14', curriculumCoverage: 'partial',
      reviewStatus: 'mixed-original-reviews-and-local-ai-reviewed-expansion', counts, lexicalEvidenceCounts,
      baselineSourceBatches: baseline.sourceBatches,
      reviewDisclosure: 'New entries received one local AI language review, not independent or human review. Earlier entries retain their original evidence and review limitations. Vocabulary count does not establish complete C2 skill coverage; app integration and release validation are outside this draft.',
      expansionCounts: review.counts, entries },
    held: { ...metadata, batchId: 'c2-cervantes-held-2026-09-14', count: held.length, entries: held },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const screening = read('reviews/c2-cervantes-source-screening.json');
  assert.equal(screening.provenance.sourceManifestSha256, sha256Payload(read('c1-source-manifest.json')), 'Source manifest changed.');
  const result = compileCervantes(read('c2-consolidated-source-preview.json'), screening,
    read('c2-cervantes-candidates.json'), read('reviews/c2-cervantes-local-review.json'), buildSpanishCourseBase());
  for (const [key, name] of [['preview', 'c2-cervantes-expanded-preview.json'], ['held', 'c2-cervantes-held.json']]) {
    if (existsSync(resolve(base, name))) assert.deepEqual(read(name), result[key], 'Existing output differs.');
    else writeFileSync(resolve(base, name), JSON.stringify(result[key], null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify({ total: result.preview.entries.length, ...result.preview.expansionCounts }));
}
