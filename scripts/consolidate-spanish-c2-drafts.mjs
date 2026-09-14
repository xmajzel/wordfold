import { buildSpanishCourseBase } from './build-spanish-course-base.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileDraftPreview, levels } from './spanish-expansion-pipeline.mjs';
import { sha256Payload, normalizeSpanishTerm } from './spanish-catalog-utils.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
export function consolidate(sources, audit) {
  assert.equal(audit.rubricSha256, sha256Payload(audit.rubric), 'Placement rubric changed.');
  assert.equal(audit.notHumanApproval, true, 'Audit must not imply human approval.');
  const decisions = new Map(audit.entries.map(entry => [entry.entryId, entry]));
  assert.equal(decisions.size, audit.entries.length, 'Duplicate audit decision.');
  assert.equal(sources.length, audit.sources.length, 'Source coverage differs.');
  const allIds = new Set(), allTerms = new Set(), selected = [], deferred = [], provenance = [];
  const evidenceCounts = {}, batchCounts = {};
  for (const source of sources) {
    const pin = audit.sources.find(item => item.key === source.key);
    assert(pin && pin.datasetSha256 === sha256Payload(source.dataset), 'Source dataset changed.');
    // Validates complete, hash-bound, resolved Spanish and Slovak reports before
    // selecting any subset. Placement decisions never overwrite those reports.
    const originalPreview = compileDraftPreview(source.dataset, source.spanish, source.slovak);
    const previewById = new Map(originalPreview.entries.map(entry => [entry.id, entry]));
    batchCounts[source.key] = { input: source.dataset.entries.length, retained: 0, deferred: 0 };
    provenance.push({ key: source.key, datasetPath: pin.path, datasetSha256: pin.datasetSha256,
      originalBatchId: source.dataset.batchId, spanishReviewSha256: sha256Payload(source.spanish), slovakReviewSha256: sha256Payload(source.slovak) });
    for (const entry of source.dataset.entries) {
      assert.equal(entry.level, 'C2', 'Consolidation accepts only C2 entries.');
      assert(!allIds.has(entry.id), 'Duplicate entry across source batches.'); allIds.add(entry.id);
      const term = normalizeSpanishTerm(entry.term);
      assert(!allTerms.has(term), 'Duplicate term across source batches.'); allTerms.add(term);
      const decision = decisions.get(entry.id);
      assert(decision && decision.sourceKey === source.key, 'Missing or cross-source audit decision.');
      assert.equal(decision.inputEntrySha256, sha256Payload(entry), 'Stale placement decision.');
      assert.equal(decision.term, entry.term, 'Audit term mismatch.');
      assert(['include', 'defer'].includes(decision.decision) && decision.reason?.trim(), 'Invalid placement decision.');
      const evidenceStatus = entry.lexicalEvidence?.verificationStatus ?? 'unrecorded';
      assert.equal(decision.lexicalEvidenceStatus, evidenceStatus, 'Evidence status changed.');
      if (decision.decision === 'defer') {
        batchCounts[source.key].deferred++;
        deferred.push({ entryId: entry.id, term: entry.term, sourceKey: source.key, inputEntrySha256: sha256Payload(entry), reason: decision.reason });
        continue;
      }
      batchCounts[source.key].retained++;
      evidenceCounts[evidenceStatus] = (evidenceCounts[evidenceStatus] ?? 0) + 1;
      selected.push({ ...previewById.get(entry.id), objectiveIds: entry.objectiveIds, register: entry.register,
        placementStatus: 'provisional', placementRationale: decision.reason, originalBatchId: source.dataset.batchId,
        sourceEntrySha256: sha256Payload(entry), lexicalEvidenceStatus: evidenceStatus });
    }
  }
  assert.equal(allIds.size, decisions.size, 'Unknown or extra audit decisions.');
  assert.equal(audit.counts.total, allIds.size, 'Incorrect audited count.');
  assert.equal(audit.counts.include, selected.length, 'Incorrect retained count.');
  assert.equal(audit.counts.defer, deferred.length, 'Incorrect deferred count.');
  return { preview: { schemaVersion: 1, courseId: 'es-sk', publicationStatus: 'draft', batchId: 'c2-consolidated-2026-09-14',
    reviewStatus: 'ai-language-reviewed-with-local-placement-audit-not-human-approved', curriculumCoverage: 'partial',
    placementStatus: 'provisional', placementAuditSha256: sha256Payload(audit), sourceBatches: provenance,
    evidenceNote: 'Source evidence is heterogeneous. AI-reviewed entries without individual source verification retain that status. Neither this consolidation nor the placement audit is new source verification or an official C2 assignment.',
    counts: Object.fromEntries(levels.map(level => [level, level === 'C2' ? selected.length : 0])),
    batchCounts, lexicalEvidenceCounts: evidenceCounts, entries: selected },
  deferred: { schemaVersion: 1, publicationStatus: 'deferred', placementAuditSha256: sha256Payload(audit), entries: deferred } };
}

export function runConsolidation() {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const audit = read('assets/catalog/spanish/reviews/c2-consolidated-placement-audit.json');
  assert.equal(audit.courseSha256, sha256Payload(buildSpanishCourseBase()), 'Earlier course changed.');
  assert.equal(audit.previousAdjudicationSha256, sha256Payload(read('assets/catalog/spanish/reviews/c2-placement-adjudications.json')), 'Prior adjudication changed.');
  const sources = audit.sources.map(source => ({ key: source.key, dataset: read(source.path),
    spanish: read(`assets/catalog/spanish/reviews/c2-${source.key}-spanish-review.json`),
    slovak: read(`assets/catalog/spanish/reviews/c2-${source.key}-slovak-review.json`) }));
  const result = consolidate(sources, audit);
  for (const [name, value] of Object.entries(result)) {
    const path = resolve(root, `assets/catalog/spanish/c2-consolidated-${name}.json`);
    if (existsSync(path)) assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), value, 'Existing consolidation differs; use a new version.');
    else writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  }
  return { counts: result.preview.counts, batchCounts: result.preview.batchCounts, lexicalEvidenceCounts: result.preview.lexicalEvidenceCounts, deferred: result.deferred.entries.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(runConsolidation(), null, 2));
