import { buildSpanishCourseBase } from './build-spanish-course-base.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256Payload, normalizeSpanishTerm } from './spanish-catalog-utils.mjs';
import { validateReview } from './spanish-c2-source-benchmark.mjs';
import { validateExpansionDataset, createAIReviewTemplate, compileDraftPreview, levels } from './spanish-expansion-pipeline.mjs';

const sourceVersion = 'wordfold-spanish-c2-source-draft-2026-09-13';
const pos = { noun: 'NOUN', adjective: 'ADJ', verb: 'VERB', adverb: 'ADV' };
const labels = { noun: 'sustantivo', adjective: 'adjetivo', verb: 'verbo', adverb: 'adverbio' };
const dataset = entries => ({ schemaVersion: 1, courseId: 'es-sk', batchId: 'c2-source-2026-09-13', sourceVersion,
  publicationStatus: 'draft', entries, counts: Object.fromEntries(levels.map(level => [level, level === 'C2' ? entries.length : 0])) });

export function learnerEntry(candidate, authored) {
  const selected = candidate.selectedSource;
  assert.equal(candidate.id, authored.id, 'Candidate identity mismatch.');
  assert.equal(selected.semanticReference.iliId, candidate.id, 'Source ILI mismatch.');
  assert.deepEqual(selected.exclusionReasons, [], 'Ineligible source alternative.');
  const partOfSpeech = pos[selected.partOfSpeech];
  const id = `es-sk:c2:exp-source-${candidate.id}`;
  return { id, catalogSenseId: `${id}:${partOfSpeech.toLowerCase()}:1`, term: candidate.selectedTerm,
    normalizedTerm: normalizeSpanishTerm(candidate.selectedTerm), level: 'C2', partOfSpeech,
    displayPartOfSpeech: labels[selected.partOfSpeech], definition: authored.definition, example: authored.example,
    exampleSurfaceForm: authored.exampleSurfaceForm, translation: authored.translation, gender: authored.gender,
    alternativeForms: authored.alternativeForms, register: authored.register, levelRationale: authored.levelRationale,
    objectiveIds: [authored.objectiveId], placementReferenceIds: ['wordfold-source-screening-c2-2026-09-13'],
    placementStatus: 'provisional', sourceVersion, publicationStatus: 'draft', originalContent: true,
    originalContentDeclaration: 'Original AI-authored Wordfold Spanish definition, example and Slovak hint; licensed WordNet evidence fixes the intended sense. C2 placement is provisional and not officially certified.',
    lexicalEvidence: { sourceManifestPath: 'assets/catalog/spanish/c1-source-manifest.json',
      sourceIds: ['omw-es:2.0', 'omw-en:2.0'], selectedSenseId: selected.senseId,
      lexicalEntryId: selected.lexicalEntryId, semanticReference: selected.semanticReference,
      verificationStatus: 'pinned-source-linked-with-independent-ai-review-not-human-verified' },
  };
}

export function compileScreened(manifest, authorRecords, spanishRecord, slovakRecord, existingEntries = []) {
  const authored = authorRecords.flatMap(record => record.result.entries);
  assert.deepEqual(authored.map(row => row.id), manifest.candidates.map(row => row.id), 'Incomplete or reordered author coverage.');
  const reviewIds = authored.filter(row => row.decision === 'author').map(row => row.id);
  validateReview(reviewIds, spanishRecord.result); validateReview(reviewIds, slovakRecord.result);
  const spanish = new Map(spanishRecord.result.entries.map(row => [row.id, row]));
  const slovak = new Map(slovakRecord.result.entries.map(row => [row.id, row]));
  const existingTerms = new Set(existingEntries.map(row => normalizeSpanishTerm(row.term)));
  const seenTerms = new Set(), accepted = [], quarantine = [];
  authored.forEach((row, index) => {
    const candidate = manifest.candidates[index];
    assert(['author', 'reject'].includes(row.decision), 'Unknown author decision.');
    const reasons = [];
    if (row.decision === 'reject') {
      assert(row.issue?.trim(), 'Missing author rejection reason.'); reasons.push({ stage: 'author', issue: row.issue });
    } else {
      if (row.issue) reasons.push({ stage: 'author', issue: row.issue });
      for (const [kind, review] of [['spanish', spanish.get(row.id)], ['slovak', slovak.get(row.id)]]) {
        if (!review.pass) reasons.push({ stage: kind, issue: review.issue });
      }
      try {
        const entry = learnerEntry(candidate, row);
        validateExpansionDataset(dataset([entry]), existingEntries);
        for (const [field, min, max] of [['definition', 3, 24], ['example', 4, 24]]) {
          const count = entry[field].trim().split(/\s+/u).length;
          assert(count >= min && count <= max, `${field} length out of bounds.`);
        }
        assert(!existingTerms.has(entry.normalizedTerm) && !seenTerms.has(entry.normalizedTerm), 'Duplicate term.');
        const source = candidate.selectedSource.semanticReference;
        const originals = [source.spanish.definition, source.english.definition, ...source.spanish.examples, ...source.english.examples].filter(Boolean).map(normalizeSpanishTerm);
        assert(!originals.includes(normalizeSpanishTerm(entry.definition)) && !originals.includes(normalizeSpanishTerm(entry.example)), 'Learner text copied verbatim from source.');
        if (!reasons.length) { accepted.push(entry); seenTerms.add(entry.normalizedTerm); }
      } catch (error) { reasons.push({ stage: 'deterministic-validation', issue: error.message }); }
    }
    if (reasons.length) quarantine.push({ id: row.id, term: candidate.selectedTerm, authored: row, reasons });
  });
  const reviewed = dataset(accepted);
  const reviews = {};
  if (accepted.length) {
    for (const [kind, record] of [['spanish', spanishRecord], ['slovak', slovakRecord]]) {
      const review = createAIReviewTemplate(reviewed, kind, `codex-chatgpt-${kind}-c2-source-2026-09-13`);
      review.reviewedAt = record.finishedAt; review.providerResultSha256 = record.resultSha256;
      review.derivation = 'Exact authored fields retained. Identity and source provenance added deterministically; author placement rationale withheld from reviewers to reduce anchoring.';
      review.entries.forEach(entry => { entry.decision = 'no-issue'; entry.notes = 'Passed the independent AI review of the unchanged authored entry and supplied source sense.'; });
      reviews[kind] = review;
    }
  }
  return { reviewed, reviews, preview: accepted.length ? compileDraftPreview(reviewed, reviews.spanish, reviews.slovak, existingEntries) : null,
    quarantine: { schemaVersion: 1, publicationStatus: 'quarantined', entries: quarantine },
    counts: { submitted: authored.length, authorRejected: authored.filter(row => row.decision === 'reject').length,
      authored: reviewIds.length, accepted: accepted.length, quarantined: quarantine.length } };
}

export function compileDirectory(directory) {
  const read = name => JSON.parse(readFileSync(resolve(directory, `${name}.json`), 'utf8'));
  const manifest = read('manifest');
  const authorRecords = [read('author-1.result'), read('author-2.result')];
  const spanish = read('spanish-review.result'), slovak = read('slovak-review.result');
  for (const record of [...authorRecords, spanish, slovak]) assert.equal(record.resultSha256, sha256Payload(record.result), 'Corrupt provider output.');
  authorRecords.forEach((record, index) => {
    const request = read(`author-${index + 1}`);
    assert.equal(sha256Payload(request), manifest.requests[index].sha256, 'Author request changed.');
    assert.equal(record.identity, sha256Payload({ prompt: request.prompt, schema: request.schema, model: record.model, authentication: 'chatgpt' }), 'Author request identity mismatch.');
  });
  const input = read('review-input');
  assert.equal(input.manifestSha256, sha256Payload(manifest), 'Review manifest changed.');
  assert.deepEqual(input.authorResultHashes, authorRecords.map(record => record.resultSha256));
  const candidates = new Map(manifest.candidates.map(row => [row.id, row]));
  const expectedRows = authorRecords.flatMap(record => record.result.entries).filter(row => row.decision === 'author').map(
    ({ id, definition, example, exampleSurfaceForm, translation, gender, alternativeForms, register, objectiveId }) => {
      const candidate = candidates.get(id);
      return { id, term: candidate.selectedTerm, pos: candidate.selectedSource.partOfSpeech,
        definition, example, exampleSurfaceForm, translation, gender, alternativeForms, register, objectiveId,
        source: { es: candidate.selectedSource.semanticReference.spanish, en: candidate.selectedSource.semanticReference.english } };
    });
  assert.deepEqual(input.rows, expectedRows, 'Review input differs from authored content or source.');
  for (const [kind, record] of [['spanish', spanish], ['slovak', slovak]]) {
    const prompt = `${manifest.reviewContracts[kind]}\n${manifest.reviewContracts.shared}\nINPUT:\n${JSON.stringify(input.rows)}`;
    assert.equal(record.identity, sha256Payload({ prompt, schema: manifest.reviewContracts.schema, model: record.model, authentication: 'chatgpt' }), 'Review request identity mismatch.');
  }
  const baseline = JSON.parse(readFileSync('assets/catalog/spanish/c2-preview.json', 'utf8'));
  assert.equal(sha256Payload(baseline), manifest.baselineDraftSha256, 'Baseline draft changed.');
  const course = buildSpanishCourseBase();
  assert.equal(sha256Payload(course), manifest.courseSha256, 'Production course changed.');
  const result = compileScreened(manifest, authorRecords, spanish, slovak, [...baseline.entries, ...course.concepts.flatMap(concept => concept.members)]);
  const usage = [...authorRecords, spanish, slovak].reduce((total, record) => total + record.usage.totalTokens, 0);
  const artifacts = { 'reviewed-candidates': result.reviewed, 'spanish-review': result.reviews.spanish, 'slovak-review': result.reviews.slovak,
    preview: result.preview, quarantine: result.quarantine, 'completion': { schemaVersion: 1, publicationStatus: 'draft-only', counts: result.counts,
      totalTokens: usage, baselineDraftCount: baseline.entries.length, manifestSha256: sha256Payload(manifest), providerHashes: [...authorRecords, spanish, slovak].map(record => record.resultSha256) } };
  for (const [name, value] of Object.entries(artifacts)) if (value) {
    const path = resolve(directory, `${name}.json`);
    if (existsSync(path)) assert.deepEqual(read(name), value, 'Existing compilation differs.');
    else writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  }
  return artifacts.completion;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(compileDirectory(resolve(process.argv[2] ?? '.artifacts/spanish-c2-source-authoring-v1')), null, 2));
}
