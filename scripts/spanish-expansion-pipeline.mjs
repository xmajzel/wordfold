import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeSpanishTerm, sha256Payload } from './spanish-a1-pipeline.mjs';

export const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const partsOfSpeech = new Set(['ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', 'DET', 'INTJ', 'NOUN', 'NUM', 'PART', 'PRON', 'PROPN', 'SCONJ', 'VERB', 'X']);
const genders = new Set(['common', 'feminine', 'invariant', 'masculine', 'not-applicable']);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
function text(value, field) {
  assert(nonempty(value) && !/(?:https?:\/\/|<[^>]*>|[\u0000-\u001f\u007f])/u.test(value), `Invalid ${field}.`);
}

// This is a draft lane for original content, not the A1 licensed-sense or human
// approval lane. It cannot produce a production catalog or native attestations.
export function validateExpansionDataset(dataset, existingEntries = []) {
  assert(dataset?.schemaVersion === 1 && dataset.courseId === 'es-sk', 'Invalid expansion identity.');
  assert(dataset.publicationStatus === 'draft', 'Expansion must remain draft.');
  assert(nonempty(dataset.batchId) && nonempty(dataset.sourceVersion), 'Missing batch provenance.');
  assert(Array.isArray(dataset.entries) && dataset.entries.length > 0, 'Empty expansion batch.');
  const ids = new Set(existingEntries.map(entry => entry.id));
  const senses = new Set(existingEntries.map(entry => entry.catalogSenseId));
  const counts = Object.fromEntries(levels.map(level => [level, 0]));
  for (const entry of dataset.entries) {
    assert(levels.includes(entry.level) && entry.id?.startsWith(`es-sk:${entry.level.toLowerCase()}:exp-`)
      && entry.catalogSenseId?.startsWith(`${entry.id}:`), `Invalid entry identity: ${entry.id}.`);
    assert(!ids.has(entry.id) && !senses.has(entry.catalogSenseId), `Duplicate entry: ${entry.id}.`);
    ids.add(entry.id); senses.add(entry.catalogSenseId); counts[entry.level]++;
    for (const field of ['term', 'normalizedTerm', 'displayPartOfSpeech', 'definition', 'example', 'exampleSurfaceForm', 'translation', 'levelRationale', 'register', 'originalContentDeclaration']) text(entry[field], `${entry.id}.${field}`);
    assert(entry.normalizedTerm === normalizeSpanishTerm(entry.term), `Invalid normalized term: ${entry.id}.`);
    assert(partsOfSpeech.has(entry.partOfSpeech) && genders.has(entry.gender), `Invalid POS/gender: ${entry.id}.`);
    assert(!['ADJ', 'NOUN', 'PROPN'].includes(entry.partOfSpeech) || entry.gender !== 'not-applicable', `Missing grammatical gender: ${entry.id}.`);
    assert(Array.isArray(entry.alternativeForms), `Missing forms: ${entry.id}.`);
    for (const form of entry.alternativeForms) {
      text(form.form, 'alternative form'); text(form.type, 'form type');
      if (form.note !== undefined) text(form.note, 'form note');
    }
    const escapedSurface = normalizeSpanishTerm(entry.exampleSurfaceForm).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    assert(new RegExp(`(?<![\\p{L}\\p{N}])${escapedSurface}(?![\\p{L}\\p{N}])`, 'u').test(normalizeSpanishTerm(entry.example)), `Example surface missing: ${entry.id}.`);
    assert(entry.publicationStatus === 'draft' && entry.sourceVersion === dataset.sourceVersion, `Invalid draft provenance: ${entry.id}.`);
    assert(entry.originalContent === true, `Missing original content declaration: ${entry.id}.`);
    for (const field of ['objectiveIds', 'placementReferenceIds']) {
      assert(Array.isArray(entry[field]) && entry[field].length > 0 && entry[field].every(nonempty)
        && new Set(entry[field]).size === entry[field].length, `Missing placement ${field}: ${entry.id}.`);
    }
    assert(['provisional', 'reviewed'].includes(entry.placementStatus), `Missing placement uncertainty: ${entry.id}.`);
  }
  for (const level of levels) assert(dataset.counts?.[level] === counts[level], `Incorrect ${level} count.`);
  return counts;
}

export function createAIReviewTemplate(dataset, kind, reviewerId) {
  validateExpansionDataset(dataset);
  assert(['spanish', 'slovak'].includes(kind) && nonempty(reviewerId), 'Invalid AI reviewer identity.');
  return {
    schemaVersion: 1, reviewerType: 'ai', kind, reviewerId, reviewedAt: null,
    notHumanApproval: true, batchId: dataset.batchId, datasetSha256: sha256Payload(dataset),
    scope: kind === 'spanish' ? 'Spanish sense, definition, example, morphology, register and provisional placement; no audio review.' : 'Slovak hint accuracy and alignment with the selected Spanish sense; no audio review.',
    entries: dataset.entries.map(entry => ({ entryId: entry.id, catalogSenseId: entry.catalogSenseId,
      level: entry.level, entrySha256: sha256Payload(entry), decision: 'pending', notes: '', findings: [] })),
  };
}

export function validateAIReview(review, dataset, kind, { requireResolved = false } = {}) {
  validateExpansionDataset(dataset);
  assert(review?.schemaVersion === 1 && review.reviewerType === 'ai' && review.notHumanApproval === true, 'Expected an explicitly AI-only review.');
  assert(review.kind === kind && nonempty(review.reviewerId), 'Invalid review identity.');
  assert(review.batchId === dataset.batchId && review.datasetSha256 === sha256Payload(dataset), 'Review is stale for this batch.');
  assert(Array.isArray(review.entries) && review.entries.length === dataset.entries.length, 'Incomplete review coverage.');
  const byId = new Map(dataset.entries.map(entry => [entry.id, entry]));
  const covered = new Set();
  for (const row of review.entries) {
    const entry = byId.get(row.entryId);
    assert(entry && !covered.has(row.entryId), 'Duplicate or unknown review coverage.');
    covered.add(row.entryId);
    assert(row.catalogSenseId === entry.catalogSenseId && row.level === entry.level, `Review identity mismatch: ${row.entryId}.`);
    assert(row.entrySha256 === sha256Payload(entry), `Entry review is stale: ${row.entryId}.`);
    assert(['pending', 'no-issue', 'changes-requested'].includes(row.decision) && Array.isArray(row.findings), 'Invalid review decision.');
    if (requireResolved) {
      assert(row.decision === 'no-issue', `Unresolved ${row.decision}: ${row.entryId}.`);
      assert(nonempty(row.notes) && row.findings.length === 0, `Unresolved findings or missing notes: ${row.entryId}.`);
    }
  }
  if (requireResolved) assert(nonempty(review.reviewedAt) && !Number.isNaN(Date.parse(review.reviewedAt)), 'Missing review date.');
  return true;
}

export function compileDraftPreview(dataset, spanishReview, slovakReview, existingEntries = []) {
  validateExpansionDataset(dataset, existingEntries);
  validateAIReview(spanishReview, dataset, 'spanish', { requireResolved: true });
  validateAIReview(slovakReview, dataset, 'slovak', { requireResolved: true });
  assert(spanishReview.reviewerId !== slovakReview.reviewerId, 'Two independent AI reviewers are required.');
  const fields = ['id', 'catalogSenseId', 'term', 'normalizedTerm', 'level', 'partOfSpeech', 'displayPartOfSpeech',
    'definition', 'example', 'translation', 'levelRationale', 'gender', 'alternativeForms', 'sourceVersion', 'publicationStatus'];
  return {
    schemaVersion: 1, courseId: 'es-sk', publicationStatus: 'draft', batchId: dataset.batchId,
    reviewStatus: 'ai-reviewed-not-human-approved', curriculumCoverage: 'partial',
    datasetSha256: sha256Payload(dataset),
    reviews: { spanish: sha256Payload(spanishReview), slovak: sha256Payload(slovakReview) },
    counts: dataset.counts,
    entries: dataset.entries.map(entry => Object.fromEntries(fields.map(field => [field, entry[field]]))),
  };
}

export function runCli(argv) {
  const [command, ...args] = argv;
  const flags = {};
  for (let index = 0; index < args.length; index += 2) {
    assert(args[index]?.startsWith('--') && args[index + 1], 'Expected --name value arguments.');
    flags[args[index].slice(2)] = args[index + 1];
  }
  const read = path => JSON.parse(readFileSync(resolve(path), 'utf8'));
  const dataset = read(flags.candidates ?? 'assets/catalog/spanish/expansion-candidates.json');
  const base = read('assets/catalog/spanish/a1-candidates.json').entries;
  validateExpansionDataset(dataset, base);
  if (command === 'validate') return { counts: dataset.counts, datasetSha256: sha256Payload(dataset) };
  if (command === 'review-template') {
    const review = createAIReviewTemplate(dataset, flags.kind, flags.reviewer);
    assert(flags.output, 'Missing --output.');
    writeFileSync(resolve(flags.output), `${JSON.stringify(review, null, 2)}\n`, { flag: 'wx' });
    return { output: flags.output, status: 'pending' };
  }
  assert(command === 'compile-preview', 'Use validate, review-template, or compile-preview.');
  const preview = compileDraftPreview(dataset, read(flags.spanish), read(flags.slovak), base);
  assert(flags.output, 'Missing --output.');
  // Exclusive output prevents accidentally replacing an earlier reviewed batch.
  writeFileSync(resolve(flags.output), `${JSON.stringify(preview, null, 2)}\n`, { flag: 'wx' });
  return { output: flags.output, counts: preview.counts, reviewStatus: preview.reviewStatus };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(runCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
