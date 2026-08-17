import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const outputKeys = [
  'confidence',
  'entryId',
  'needsReview',
  'normalizedTerm',
  'reviewNote',
  'translation',
];
const confidenceValues = new Set(['high', 'medium']);

function parseArgs(argv) {
  const options = {
    manifestPath: resolve('.artifacts/cefr-learner-translations-sk/all/review/manifest.json'),
    reportPath: null,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest') options.manifestPath = resolve(argv[++index]);
    else if (argument === '--report') options.reportPath = resolve(argv[++index]);
    else if (argument === '--dry-run') options.dryRun = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  options.reportPath ??= resolve(options.manifestPath, '..', 'report.json');
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function words(value) {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function sameRecord(left, right) {
  return outputKeys.every((key) => left[key] === right[key]);
}

function validateAccepted(record, input, label, errors) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    errors.push(`${label}: review output must be an object.`);
    return;
  }
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(outputKeys)) {
    errors.push(`${label}: review output fields do not match the exact six-field schema.`);
  }
  if (record.entryId !== input.entryId) errors.push(`${label}: entryId does not match.`);
  if (record.normalizedTerm !== input.normalizedTerm) errors.push(`${label}: normalizedTerm does not match.`);
  if (
    typeof record.translation !== 'string'
    || record.translation !== record.translation.trim()
    || words(record.translation).length < 1
    || words(record.translation).length > 12
    || record.translation.length > 100
    || /[\u0000-\u001f\u007f]/u.test(record.translation)
  ) {
    errors.push(`${label}: translation must be a trimmed single-line hint of 1-12 words and at most 100 characters.`);
  }
  if (!confidenceValues.has(record.confidence)) errors.push(`${label}: confidence must be high or medium.`);
  if (record.needsReview !== false) errors.push(`${label}: accepted review must set needsReview to false.`);
  if (record.reviewNote !== '') errors.push(`${label}: accepted review must have an empty reviewNote.`);
}

const options = parseArgs(process.argv.slice(2));
const reviewManifestText = readFileSync(options.manifestPath, 'utf8');
const reviewManifest = JSON.parse(reviewManifestText);
const fullManifestText = readFileSync(reviewManifest.fullManifestPath, 'utf8');
const fullManifest = JSON.parse(fullManifestText);
const compiledText = readFileSync(reviewManifest.compiledPreReviewPath, 'utf8');
const errors = [];

if (sha256(fullManifestText) !== reviewManifest.fullManifestSha256) {
  errors.push('The full translation manifest changed after review preparation.');
}
if (sha256(compiledText) !== reviewManifest.compiledPreReviewSha256) {
  errors.push('compiled.pre-review.json changed after review preparation.');
}
if (fullManifest.mode !== 'all' || fullManifest.selectedEntries !== fullManifest.catalogEntries) {
  errors.push('Review can only be applied to a complete all-catalog translation run.');
}

const acceptedById = new Map();
const reasonsById = new Map();
const selectedIds = [];
for (const chunk of reviewManifest.chunks ?? []) {
  const inputText = readFileSync(chunk.inputPath, 'utf8');
  const inputs = JSON.parse(inputText);
  if (sha256(inputText) !== chunk.inputSha256) {
    errors.push(`${basename(chunk.inputPath)}: input changed after review preparation.`);
  }
  let outputs;
  try {
    outputs = JSON.parse(readFileSync(chunk.outputPath, 'utf8'));
  } catch (error) {
    errors.push(`${basename(chunk.outputPath)}: ${error.code === 'ENOENT' ? 'output file is missing.' : 'output is not valid JSON.'}`);
    continue;
  }
  if (!Array.isArray(inputs) || inputs.length !== chunk.entries) {
    errors.push(`${basename(chunk.inputPath)}: input count does not match the review manifest.`);
    continue;
  }
  if (!Array.isArray(outputs) || outputs.length !== chunk.entries) {
    errors.push(`${basename(chunk.outputPath)}: output count does not match the review manifest.`);
    continue;
  }
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const record = outputs[index];
    const expectedId = chunk.entryIds[index];
    if (input.entryId !== expectedId) errors.push(`${basename(chunk.inputPath)}: input order differs from the manifest at index ${index}.`);
    if (record?.entryId !== input.entryId) errors.push(`${basename(chunk.outputPath)}: output order differs from the input at index ${index}.`);
    validateAccepted(record, input, input.entryId, errors);
    if (acceptedById.has(input.entryId)) errors.push(`${input.entryId}: appears in more than one review chunk.`);
    else acceptedById.set(input.entryId, record);
    reasonsById.set(input.entryId, input.reasons);
    selectedIds.push(input.entryId);
  }
}
if (acceptedById.size !== reviewManifest.selectedEntries) {
  errors.push(`Validated ${acceptedById.size} reviewed entries; expected ${reviewManifest.selectedEntries}.`);
}
if (JSON.stringify(selectedIds) !== JSON.stringify(reviewManifest.selectedEntryIds)) {
  errors.push('Reviewed entry identities or order differ from the review manifest.');
}

const calculatedReasonCounts = {};
for (const reasons of reasonsById.values()) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    errors.push('Every review input must contain at least one selection reason.');
    continue;
  }
  for (const reason of reasons) calculatedReasonCounts[reason] = (calculatedReasonCounts[reason] ?? 0) + 1;
}
if (JSON.stringify(calculatedReasonCounts) !== JSON.stringify(reviewManifest.reasonCounts)) {
  errors.push('Review input reason counts differ from the review manifest.');
}

const sourceOutputTexts = [];
const writes = [];
const originalById = new Map();
const chunkByEntryId = new Map();
for (const chunk of fullManifest.chunks ?? []) {
  const outputText = readFileSync(chunk.outputPath, 'utf8');
  const outputs = JSON.parse(outputText);
  sourceOutputTexts.push(outputText);
  if (!Array.isArray(outputs) || outputs.length !== chunk.entries) {
    errors.push(`${basename(chunk.outputPath)}: full output count does not match its manifest.`);
    continue;
  }
  for (let index = 0; index < outputs.length; index += 1) {
    const record = outputs[index];
    if (record?.entryId !== chunk.entryIds[index]) {
      errors.push(`${basename(chunk.outputPath)}: full output order differs from its manifest at index ${index}.`);
      continue;
    }
    if (originalById.has(record.entryId)) errors.push(`${record.entryId}: duplicate full output entry.`);
    originalById.set(record.entryId, record);
    chunkByEntryId.set(record.entryId, chunk.chunk);
  }
  writes.push({ chunk, outputs });
}
if (sha256(sourceOutputTexts.join('\n')) !== reviewManifest.sourceOutputsSha256) {
  errors.push('Full translation outputs changed after review preparation.');
}
for (const entryId of acceptedById.keys()) {
  if (!originalById.has(entryId)) errors.push(`${entryId}: reviewed entry is absent from the full outputs.`);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  const revisedIds = [];
  const revisedReasonCounts = {};
  const changedChunks = new Set();
  for (const [entryId, accepted] of acceptedById) {
    const original = originalById.get(entryId);
    if (!sameRecord(original, accepted)) {
      revisedIds.push(entryId);
      changedChunks.add(chunkByEntryId.get(entryId));
      for (const reason of reasonsById.get(entryId)) {
        revisedReasonCounts[reason] = (revisedReasonCounts[reason] ?? 0) + 1;
      }
    }
  }
  for (const write of writes) {
    for (let index = 0; index < write.outputs.length; index += 1) {
      const accepted = acceptedById.get(write.outputs[index].entryId);
      if (accepted) write.outputs[index] = accepted;
    }
  }
  const report = {
    schemaVersion: 1,
    reviewManifestPath: options.manifestPath,
    reviewManifestSha256: sha256(reviewManifestText),
    selectedEntries: acceptedById.size,
    revisedEntries: revisedIds.length,
    unchangedEntries: acceptedById.size - revisedIds.length,
    changedFullChunks: changedChunks.size,
    reasonCounts: reviewManifest.reasonCounts,
    revisedReasonCounts,
    revisedEntryIds: revisedIds.sort((left, right) => left.localeCompare(right, 'en')),
  };
  if (!options.dryRun) {
    for (const write of writes) {
      if (changedChunks.has(write.chunk.chunk)) {
        writeFileSync(write.chunk.outputPath, `${JSON.stringify(write.outputs, null, 2)}\n`);
      }
    }
    writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`${options.dryRun ? 'Dry run validated' : 'Applied'} ${acceptedById.size.toLocaleString()} reviewed translations; ${revisedIds.length.toLocaleString()} revised.`);
  console.log(`${changedChunks.size.toLocaleString()} full output chunk(s) ${options.dryRun ? 'would change' : 'changed'}.`);
  if (!options.dryRun) console.log(`Review report: ${options.reportPath}`);
}
