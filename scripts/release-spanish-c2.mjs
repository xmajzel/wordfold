import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileCervantes } from './compile-spanish-c2-cervantes.mjs';
import { normalizeSpanishTerm, sha256Payload } from './spanish-catalog-utils.mjs';

const read = name => JSON.parse(readFileSync(new URL('../assets/catalog/spanish/' + name, import.meta.url), 'utf8'));
const editableFields = new Set(['definition', 'example', 'exampleSurfaceForm', 'translation', 'gender', 'alternativeForms', 'register']);

// Keep historical drafts and their reviews immutable. Only explicit, reviewed learner corrections carry forward.
export function applyC2ReleaseAmendments(preview, amendments) {
  assert.equal(amendments.schemaVersion, 1);
  assert.equal(amendments.notHumanApproval, true);
  assert.equal(amendments.previewSha256, sha256Payload(preview), 'Stale release amendment source.');
  const entries = structuredClone(preview.entries);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  assert.equal(byId.size, entries.length, 'Duplicate C2 entry ID.');
  const changed = new Set();
  for (const change of amendments.changes) {
    const entry = byId.get(change.entryId);
    assert(entry && change.reason?.trim(), 'Unknown or unexplained amendment.');
    assert(editableFields.has(change.field), 'Release amendment cannot alter identity or source evidence.');
    const key = `${change.entryId}:${change.field}`;
    assert(!changed.has(key), 'Duplicate release amendment.');
    changed.add(key);
    assert.deepEqual(entry[change.field], change.before, 'Stale release amendment.');
    entry[change.field] = change.after;
  }
  return entries;
}

export function validateC2ReleaseReviews(entries, spanish, slovak) {
  assert(spanish.reviewerId && slovak.reviewerId && spanish.reviewerId !== slovak.reviewerId, 'C2 requires two distinct reviewers.');
  for (const [kind, report] of [['spanish', spanish], ['slovak', slovak]]) {
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.kind, kind);
    assert.equal(report.finalEntriesSha256, sha256Payload(entries), 'Stale final C2 review dataset.');
    assert.equal(report.reviewerType, 'ai');
    assert.equal(report.independentReview, true, 'C2 requires independent reviews.');
    assert.equal(report.notHumanApproval, true, 'AI review cannot become human approval.');
    assert(Number.isFinite(Date.parse(report.reviewedAt)), 'Review date is missing.');
    const byId = new Map(report.entries.map(row => [row.entryId, row]));
    assert.equal(byId.size, report.entries.length, 'Duplicate review decision.');
    assert.equal(byId.size, entries.length, 'Incomplete C2 review coverage.');
    for (const entry of entries) {
      const verdict = byId.get(entry.id);
      assert(verdict && verdict.entrySha256 === sha256Payload(entry), `${entry.id}: stale ${kind} release review.`);
      assert(verdict.decision === 'no-issue' && verdict.notes?.trim() && Array.isArray(verdict.findings) && verdict.findings.length === 0,
        `${entry.id}: unresolved ${kind} release finding.`);
    }
  }
}

export function assembleSpanishC2(base, entries, spanish, slovak) {
  validateC2ReleaseReviews(entries, spanish, slovak);
  assert.equal(base.status, 'production');
  assert.equal(base.levels.C2, 'unavailable-no-elelex-source-level');
  assert(!base.concepts.some(concept => concept.level === 'C2'), 'C2 already bundled.');
  assert(entries.length > 0, 'C2 release is empty.');
  const ids = new Set(base.concepts.map(concept => concept.id));
  const memberIds = new Set(base.concepts.flatMap(concept => concept.members.map(member => member.entryId)));
  const terms = new Set(base.concepts.flatMap(concept => concept.members.map(member => member.normalizedTerm)));
  const c2 = entries.map((entry, index) => {
    assert.equal(entry.level, 'C2');
    assert.equal(entry.placementStatus, 'provisional');
    assert(entry.id && entry.catalogSenseId && !ids.has(entry.catalogSenseId) && !memberIds.has(entry.id), 'Duplicate C2 identity.');
    assert.equal(entry.normalizedTerm, normalizeSpanishTerm(entry.term));
    assert(!terms.has(entry.normalizedTerm), 'Duplicate C2 or earlier-level term.');
    for (const field of ['partOfSpeech', 'definition', 'example', 'translation']) assert(entry[field]?.trim(), `Missing C2 ${field}.`);
    ids.add(entry.catalogSenseId); memberIds.add(entry.id); terms.add(entry.normalizedTerm);
    return {
      id: entry.catalogSenseId, notHumanReview: true, level: 'C2', partOfSpeech: entry.partOfSpeech,
      courseOrder: index + 1, sharedSlovakHint: entry.translation,
      sourceVersion: 'wordfold-spanish-c2-2026-09-14',
      levelEvidence: entry.placementEvidence
        ? 'PCIC C2 specific-notions reference; Wordfold provisional vocabulary placement, independently AI reviewed'
        : 'Wordfold provisional C2 vocabulary placement using PCIC framework references, independently AI reviewed',
      members: [{ entryId: entry.id, term: entry.term, normalizedTerm: entry.normalizedTerm,
        partOfSpeech: entry.partOfSpeech, definition: entry.definition, example: entry.example,
        selectedSenseId: entry.lexicalEvidence?.selectedSenseId ?? entry.catalogSenseId,
        slovakHint: entry.translation, hintSource: 'original-independent-ai-reviewed', courseOrder: index + 1,
        gender: entry.gender, alternativeForms: entry.alternativeForms }],
      review: { spanish: 'independent-ai-review', slovak: 'independent-ai-review',
        slovakOwnerVerdict: null, slovakOwnerVerdictProvenance: null, slovakOwnerVerdictRequired: false },
    };
  });
  return {
    ...base, title: 'Wordfold Spanish A1–C2 vocabulary catalog',
    counts: { ...base.counts, concepts: base.counts.concepts + c2.length, terms: base.counts.terms + c2.length },
    levels: { ...base.levels, C2: 'available' },
    c2Release: { schemaVersion: 1, entryCount: c2.length, notHumanApproval: true,
      placementStatus: 'provisional', curriculumCoverage: 'partial',
      entriesSha256: sha256Payload(entries), spanishReviewSha256: sha256Payload(spanish), slovakReviewSha256: sha256Payload(slovak) },
    concepts: [...base.concepts, ...c2],
  };
}

export function appendSpanishC2Release(base) {
  const screening = read('reviews/c2-cervantes-source-screening.json');
  assert.equal(screening.provenance.sourceManifestSha256, sha256Payload(read('c1-source-manifest.json')), 'C2 source manifest changed.');
  const { preview } = compileCervantes(read('c2-consolidated-source-preview.json'), screening,
    read('c2-cervantes-candidates.json'), read('reviews/c2-cervantes-local-review.json'), base);
  assert.deepEqual(preview, read('c2-cervantes-expanded-preview.json'), 'C2 preview no longer matches its source pipeline.');
  const amendments = read('c2-release-amendments.json');
  const entries = applyC2ReleaseAmendments(preview, amendments);
  const spanish = read('reviews/c2-release-spanish-review.json');
  const slovak = read('reviews/c2-release-slovak-review.json');
  for (const review of [spanish, slovak]) assert.equal(review.amendmentsSha256, sha256Payload(amendments), 'Stale release amendment review.');
  return assembleSpanishC2(base, entries, spanish, slovak);
}
