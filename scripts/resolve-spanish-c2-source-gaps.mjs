import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256Payload } from './spanish-catalog-utils.mjs';
import { prepareInputs, validateSourceAudit } from './verify-spanish-c2-source-audit.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = 'assets/catalog/spanish/';
const read = path => JSON.parse(readFileSync(resolve(root, base, path), 'utf8'));

// Integrity and provenance checks; lexical decisions remain explicit AI judgments.
export function compileResolution(draft, prior, review) {
  assert.equal(review.baselinePreviewSha256, sha256Payload(draft), 'Stale baseline preview.');
  assert.equal(review.priorAuditSha256, sha256Payload(prior), 'Stale prior audit.');
  assert.equal(prior.draftSha256, sha256Payload(draft), 'Prior audit targets another draft.');
  for (const document of [draft, prior, review]) {
    assert.equal(document.publicationStatus, 'draft');
    assert.equal(document.placementStatus, 'provisional');
  }
  assert.equal(review.notHumanApproval, true);
  assert.equal(review.reviewerType, 'ai-local');
  const byId = new Map(draft.entries.map(entry => [entry.id, entry]));
  assert.equal(byId.size, draft.entries.length, 'Duplicate draft entry.');
  const pending = new Set(prior.entries.filter(row => row.decision === 'unresolved').map(row => row.entryId));
  const rows = new Map();
  const counts = { total: review.entries.length, supported: 0, amended: 0, held: 0 };
  for (const row of review.entries) {
    assert(pending.has(row.entryId) && !rows.has(row.entryId), 'Duplicate or unexpected resolution.');
    const entry = byId.get(row.entryId);
    assert(entry && row.term === entry.term, 'Unknown entry or term.');
    assert.equal(row.baselineEntrySha256, sha256Payload(entry), 'Stale resolution entry.');
    assert(['supported', 'amended', 'hold'].includes(row.decision), 'Invalid resolution decision.');
    assert(row.reason?.trim() && Array.isArray(row.evidence) && row.evidence.length, 'Missing evidence or rationale.');
    for (const source of row.evidence) {
      assert(['primary-page-read', 'primary-search-excerpt-read'].includes(source.kind), 'Invalid evidence access kind.');
      assert.equal(new URL(source.url).protocol, 'https:');
      assert(source.senseLocator?.trim() && source.paraphrase?.trim() && /^\d{4}-\d{2}-\d{2}$/u.test(source.observedAt), 'Incomplete source.');
    }
    assert(Array.isArray(row.changes), 'Missing changes list.');
    assert.equal(row.changes.length > 0, row.decision === 'amended', 'Amendment decision mismatch.');
    const fields = new Set();
    for (const change of row.changes) {
      assert(['definition', 'usageNote'].includes(change.field) && !fields.has(change.field), 'Unsupported or repeated field change.');
      fields.add(change.field);
      assert.equal(change.before, entry[change.field] ?? null, 'Stale amendment.');
      assert(typeof change.after === 'string' && change.after.trim() && change.after !== change.before, 'Empty or ineffective amendment.');
      assert.equal(row.amendmentReview?.independentlyRereviewed, false, 'Amendments need explicit review limitations.');
      assert.equal(row.amendmentReview?.reviewerType, 'ai-local');
      assert(row.amendmentReview.alignment?.trim());
    }
    counts[row.decision === 'hold' ? 'held' : row.decision]++;
    rows.set(row.entryId, row);
  }
  assert.equal(rows.size, pending.size, 'Incomplete resolution coverage.');
  assert.deepEqual(review.counts, counts, 'Incorrect resolution counts.');
  const priorById = new Map(prior.entries.map(row => [row.entryId, row]));
  const entries = [], held = [];
  for (const original of draft.entries) {
    const row = rows.get(original.id);
    const evidence = row ?? priorById.get(original.id);
    if (row?.decision === 'hold') {
      held.push({ ...original, sourceResolution: row });
      continue;
    }
    const entry = structuredClone(original);
    if (evidence) {
      assert(row || evidence.decision === 'supported', 'Unresolved source gap.');
      entry.baselinePreviewEntrySha256 = sha256Payload(original);
      entry.sourceVerification = { reviewSha256: sha256Payload(row ? review : prior), decision: evidence.decision, evidence: evidence.evidence };
      entry.lexicalEvidenceStatus = evidence.evidence.some(source => source.kind === 'pinned-library-sense')
        ? 'pinned-library-sense-checked-by-local-ai'
        : evidence.evidence.some(source => source.kind === 'primary-search-excerpt-read')
          ? 'primary-search-excerpt-read-with-described-scope' : 'primary-page-read-with-described-scope';
      for (const change of row?.changes ?? []) entry[change.field] = change.after;
      if (row?.changes.length) {
        entry.contentAmendments = row.changes;
        entry.amendmentReview = row.amendmentReview;
      }
    }
    entries.push(entry);
  }
  const lexicalEvidenceCounts = {};
  for (const entry of entries) lexicalEvidenceCounts[entry.lexicalEvidenceStatus] = (lexicalEvidenceCounts[entry.lexicalEvidenceStatus] ?? 0) + 1;
  const metadata = {
    schemaVersion: 1, courseId: draft.courseId, publicationStatus: 'draft', placementStatus: 'provisional',
    curriculumCoverage: 'partial', notHumanApproval: true,
    baselinePreviewSha256: sha256Payload(draft), priorAuditSha256: sha256Payload(prior), resolutionReviewSha256: sha256Payload(review),
    sourceBatches: draft.sourceBatches, placementAuditSha256: draft.placementAuditSha256,
    reviewStatus: 'original-ai-language-reviews-with-local-source-checks-and-amendments',
    evidenceNote: 'Evidence remains heterogeneous and scoped per entry. Original independent AI reviews cover original text only; contentAmendments have local AI review and have not been independently rereviewed. sourceEntrySha256 identifies the original batch entry, not amended content. No source certifies C2 placement.',
  };
  const levels = Object.fromEntries(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => [level, entries.filter(entry => entry.level === level).length]));
  return {
    preview: { ...metadata, batchId: 'c2-consolidated-source-2026-09-14', counts: levels, lexicalEvidenceCounts, sourceResolutionCounts: counts, entries },
    held: { ...metadata, batchId: 'c2-source-held-2026-09-14', count: held.length, entries: held },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const prior = read('reviews/c2-source-verification-audit.json');
  validateSourceAudit(prior, prepareInputs());
  const result = compileResolution(read('c2-consolidated-preview.json'), prior, read('reviews/c2-source-resolution-review.json'));
  for (const [key, name] of [['preview', 'c2-consolidated-source-preview.json'], ['held', 'c2-source-held.json']]) {
    const path = resolve(root, base, name);
    if (existsSync(path)) assert.deepEqual(read(name), result[key], 'Existing output differs; do not overwrite.');
    else writeFileSync(path, JSON.stringify(result[key], null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify({ retained: result.preview.entries.length, held: result.held.count, resolution: result.preview.sourceResolutionCounts }));
}
