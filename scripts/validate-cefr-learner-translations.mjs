import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const confidenceValues = new Set(['high', 'medium', 'low']);
const outputKeys = [
  'confidence',
  'entryId',
  'needsReview',
  'normalizedTerm',
  'reviewNote',
  'translation',
];
let independentlyRevisedEntryIds = new Set();

function parseArgs(argv) {
  const options = {
    manifestPath: resolve('.artifacts/cefr-learner-translations-sk/pilot/manifest.json'),
    outputPath: null,
    requireComplete: false,
    allowIncomplete: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest') options.manifestPath = resolve(argv[++index]);
    else if (argument === '--output') options.outputPath = resolve(argv[++index]);
    else if (argument === '--require-complete') options.requireComplete = true;
    else if (argument === '--allow-incomplete') options.allowIncomplete = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  options.outputPath ??= resolve(options.manifestPath, '..', 'compiled.json');
  return options;
}

function words(value) {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function validateRecord(record, input, errors, warnings) {
  const initialErrorCount = errors.length;
  const label = input.entryId;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    errors.push(`${label}: output must be an object.`);
    return false;
  }
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(outputKeys)) {
    errors.push(`${label}: output fields do not match the required schema.`);
  }
  if (record.entryId !== input.entryId) errors.push(`${label}: entryId does not match.`);
  if (record.normalizedTerm !== input.normalizedTerm) errors.push(`${label}: normalizedTerm does not match.`);
  if (
    typeof record.translation !== 'string'
    || words(record.translation).length < 1
    || words(record.translation).length > 12
    || record.translation.trim().length > 100
    || /[\u0000-\u001f\u007f]/u.test(record.translation)
  ) errors.push(`${label}: translation must be a single-line Slovak hint of 1-12 words and at most 100 characters.`);
  if (typeof record.translation === 'string' && record.translation !== record.translation.trim()) {
    errors.push(`${label}: translation must not have surrounding whitespace.`);
  }
  if (typeof record.translation === 'string' && /(?:```|^#{1,6}\s|\b(?:TODO|TBD|N\/A)\b)/iu.test(record.translation)) {
    errors.push(`${label}: translation contains placeholder or markdown residue.`);
  }
  if (!confidenceValues.has(record.confidence)) errors.push(`${label}: confidence is invalid.`);
  if (typeof record.needsReview !== 'boolean') errors.push(`${label}: needsReview must be boolean.`);
  if (record.confidence === 'low' && record.needsReview === false) errors.push(`${label}: low-confidence output must need review.`);
  if (typeof record.reviewNote !== 'string') errors.push(`${label}: reviewNote must be a string.`);
  if (record.needsReview && (typeof record.reviewNote !== 'string' || !record.reviewNote.trim())) {
    errors.push(`${label}: reviewed entries need a reviewNote.`);
  }
  if (!record.needsReview && typeof record.reviewNote === 'string' && record.reviewNote.trim()) {
    warnings.push(`${label}: reviewNote is present although needsReview is false.`);
  }
  if (input.acceptedPilot && !independentlyRevisedEntryIds.has(input.entryId)) {
    for (const key of outputKeys) {
      if (record[key] !== input.acceptedPilot[key]) errors.push(`${label}: accepted pilot field ${key} changed.`);
    }
  }
  if (typeof record.translation === 'string') {
    if (words(record.translation).length > 8) warnings.push(`${label}: translation is longer than eight words.`);
    if (/[\/;]/u.test(record.translation) || /\balebo\b/iu.test(record.translation)) warnings.push(`${label}: translation may contain alternatives.`);
    if (/[.!?]$/u.test(record.translation)) warnings.push(`${label}: translation has sentence-final punctuation.`);
    if (/[()]/u.test(record.translation)) warnings.push(`${label}: translation contains a usage label or parenthetical.`);
    if (record.translation.toLocaleLowerCase('sk') === input.term.toLocaleLowerCase('en')) {
      warnings.push(`${label}: translation is identical to the English headword; confirm a natural borrowing.`);
    }
    if (input.translationReviewRequired && record.translation === input.currentTranslation) {
      warnings.push(`${label}: changed English meaning retained the legacy translation.`);
    }
  }
  return errors.length === initialErrorCount;
}

const options = parseArgs(process.argv.slice(2));
if (options.requireComplete && options.allowIncomplete) {
  throw new Error('--require-complete cannot be combined with --allow-incomplete.');
}
const preparation = JSON.parse(readFileSync(options.manifestPath, 'utf8'));
const reviewReportPath = resolve(options.manifestPath, '..', 'review', 'report.json');
const reviewManifestPath = resolve(options.manifestPath, '..', 'review', 'manifest.json');
const reviewReportText = existsSync(reviewReportPath) ? readFileSync(reviewReportPath, 'utf8') : null;
const reviewManifestText = existsSync(reviewManifestPath) ? readFileSync(reviewManifestPath, 'utf8') : null;
const reviewReport = reviewReportText
  ? JSON.parse(reviewReportText)
  : null;
const reviewManifest = reviewManifestText
  ? JSON.parse(reviewManifestText)
  : null;
independentlyRevisedEntryIds = new Set(Array.isArray(reviewReport?.revisedEntryIds) ? reviewReport.revisedEntryIds : []);
const errors = [];
const warnings = [];
const compiled = new Map();
const preparedMeanings = [];
const preparedIds = new Set();
const catalogText = readFileSync(resolve('assets/catalog/cefr-catalog.json'), 'utf8');
const catalog = JSON.parse(catalogText);
const catalogById = new Map(catalog.entries.map((entry) => [entry.id, entry]));
const currentCatalogSha256 = createHash('sha256').update(catalogText).digest('hex');
if (preparation.catalogSha256 !== currentCatalogSha256) errors.push('Catalog content changed after translation preparation.');
if (preparation.catalogEntries !== catalog.entries.length) errors.push('Manifest catalog count does not match the current catalog.');

for (const chunk of preparation.chunks) {
  const inputs = JSON.parse(readFileSync(chunk.inputPath, 'utf8'));
  if (!Array.isArray(inputs) || inputs.length !== chunk.entries) {
    errors.push(`${basename(chunk.inputPath)}: input does not match its manifest entry count.`);
    continue;
  }
  const expectedIds = new Set(chunk.entryIds);
  if (expectedIds.size !== chunk.entryIds.length || inputs.some((input) => !expectedIds.has(input.entryId))) {
    errors.push(`${basename(chunk.inputPath)}: input identities do not match the manifest.`);
    continue;
  }
  for (const input of inputs) {
    const catalogEntry = catalogById.get(input.entryId);
    if (!catalogEntry || catalogEntry.normalizedTerm !== input.normalizedTerm) {
      errors.push(`${input.entryId}: input identity does not match the catalog.`);
    }
    if (preparedIds.has(input.entryId)) errors.push(`${input.entryId}: input appears in more than one chunk.`);
    preparedIds.add(input.entryId);
    preparedMeanings.push({
      entryId: input.entryId,
      normalizedTerm: input.normalizedTerm,
      finalEnglish: input.finalEnglish,
    });
  }
  if (!existsSync(chunk.outputPath)) {
    if (!options.allowIncomplete) errors.push(`${basename(chunk.outputPath)}: output file is missing.`);
    continue;
  }
  const outputs = JSON.parse(readFileSync(chunk.outputPath, 'utf8'));
  if (!Array.isArray(outputs)) {
    errors.push(`${basename(chunk.outputPath)}: output must be a JSON array.`);
    continue;
  }
  const outputById = new Map(outputs.map((record) => [record?.entryId, record]));
  if (outputById.size !== outputs.length) errors.push(`${basename(chunk.outputPath)}: output contains duplicate entry IDs.`);
  for (const input of inputs) {
    const record = outputById.get(input.entryId);
    if (!record) {
      errors.push(`${input.entryId}: output is missing.`);
      continue;
    }
    if (!validateRecord(record, input, errors, warnings)) continue;
    if (compiled.has(record.entryId)) {
      errors.push(`${record.entryId}: entry appears in more than one chunk.`);
      continue;
    }
    compiled.set(record.entryId, { ...record, translation: record.translation.trim() });
  }
  for (const record of outputs) {
    if (!expectedIds.has(record?.entryId)) errors.push(`${record?.entryId ?? 'unknown'}: unexpected output entry.`);
  }
}

const preparedMeaningsSha256 = createHash('sha256').update(JSON.stringify(preparedMeanings)).digest('hex');
if (preparation.englishMeaningsSha256 !== preparedMeaningsSha256) {
  errors.push('Prepared English meanings do not match the manifest content hash.');
}
if (preparedMeanings.length !== preparation.selectedEntries) {
  errors.push(`Prepared ${preparedMeanings.length} input entries; expected ${preparation.selectedEntries}.`);
}

if ((!options.allowIncomplete || options.requireComplete) && compiled.size !== preparation.selectedEntries) {
  errors.push(`Compiled ${compiled.size} entries; expected ${preparation.selectedEntries}.`);
}
if (options.requireComplete && preparation.selectedEntries !== preparation.catalogEntries) {
  errors.push(`Complete output requires all ${preparation.catalogEntries} catalog entries.`);
}
if (options.requireComplete) {
  for (const entry of catalog.entries) {
    if (!compiled.has(entry.id)) errors.push(`${entry.id}: complete compiled output is missing the catalog entry.`);
  }
  if ([...compiled.values()].some((entry) => entry.needsReview)) {
    errors.push('Complete output cannot contain unresolved translation records.');
  }
  if (!reviewReport || !reviewManifest) {
    errors.push('Complete output requires the independent translation review manifest and report.');
  } else if (
    !Number.isInteger(reviewReport.selectedEntries)
    || reviewReport.selectedEntries < 1
    || !Number.isInteger(reviewReport.revisedEntries)
    || reviewReport.revisedEntries < 0
    || reviewReport.revisedEntries > reviewReport.selectedEntries
  ) {
    errors.push('Independent translation review report is invalid.');
  } else {
    const selectedIds = Array.isArray(reviewManifest.selectedEntryIds) ? reviewManifest.selectedEntryIds : [];
    const revisedIds = Array.isArray(reviewReport.revisedEntryIds) ? reviewReport.revisedEntryIds : [];
    if (
      reviewReport.reviewManifestPath !== reviewManifestPath
      || reviewReport.reviewManifestSha256 !== createHash('sha256').update(reviewManifestText).digest('hex')
    ) {
      errors.push('Independent translation review report is not bound to the current review manifest.');
    }
    if (
      reviewManifest.fullManifestPath !== options.manifestPath
      || reviewManifest.fullManifestSha256 !== createHash('sha256').update(readFileSync(options.manifestPath, 'utf8')).digest('hex')
    ) {
      errors.push('Independent translation review manifest is not bound to the current full manifest.');
    }
    if (
      !Array.isArray(reviewManifest.selectedEntryIds)
      || selectedIds.length !== reviewManifest.selectedEntries
      || new Set(selectedIds).size !== selectedIds.length
      || reviewReport.selectedEntries !== reviewManifest.selectedEntries
    ) {
      errors.push('Independent translation review selected identities are invalid.');
    }
    if (
      !Array.isArray(reviewReport.revisedEntryIds)
      || revisedIds.length !== reviewReport.revisedEntries
      || new Set(revisedIds).size !== revisedIds.length
      || revisedIds.some((entryId) => !selectedIds.includes(entryId))
    ) {
      errors.push('Independent translation review revised identities are invalid.');
    }

    if (typeof reviewManifest.compiledPreReviewPath !== 'string' || !existsSync(reviewManifest.compiledPreReviewPath)) {
      errors.push('Independent translation review pre-review compilation is missing.');
    } else {
      const preReviewText = readFileSync(reviewManifest.compiledPreReviewPath, 'utf8');
      const preReview = JSON.parse(preReviewText);
      if (createHash('sha256').update(preReviewText).digest('hex') !== reviewManifest.compiledPreReviewSha256) {
        errors.push('Independent translation review pre-review compilation changed.');
      }
      const reviewedIds = [];
      const calculatedRevisedIds = [];
      const reviewChunks = Array.isArray(reviewManifest.chunks) ? reviewManifest.chunks : [];
      if (!Array.isArray(reviewManifest.chunks)) errors.push('Independent translation review chunks are invalid.');
      for (const chunk of reviewChunks) {
        if (!existsSync(chunk.inputPath) || !existsSync(chunk.outputPath)) {
          errors.push(`${basename(chunk.outputPath ?? chunk.inputPath)}: independent review evidence is missing.`);
          continue;
        }
        const inputText = readFileSync(chunk.inputPath, 'utf8');
        const inputs = JSON.parse(inputText);
        const outputs = JSON.parse(readFileSync(chunk.outputPath, 'utf8'));
        if (createHash('sha256').update(inputText).digest('hex') !== chunk.inputSha256) {
          errors.push(`${basename(chunk.inputPath)}: independent review input changed.`);
        }
        if (!Array.isArray(inputs) || !Array.isArray(outputs) || inputs.length !== chunk.entries || outputs.length !== chunk.entries) {
          errors.push(`${basename(chunk.outputPath)}: independent review evidence count is invalid.`);
          continue;
        }
        for (let index = 0; index < inputs.length; index += 1) {
          const entryId = chunk.entryIds?.[index];
          const input = inputs[index];
          const output = outputs[index];
          reviewedIds.push(entryId);
          if (input?.entryId !== entryId || output?.entryId !== entryId || output?.normalizedTerm !== input?.normalizedTerm) {
            errors.push(`${basename(chunk.outputPath)}: independent review identity or order is invalid at index ${index}.`);
            continue;
          }
          const finalRecord = compiled.get(entryId);
          if (!finalRecord || outputKeys.some((key) => finalRecord[key] !== output[key])) {
            errors.push(`${entryId}: compiled translation differs from the accepted independent review.`);
          }
          const preReviewRecord = preReview.entries?.[entryId];
          if (!preReviewRecord) {
            errors.push(`${entryId}: pre-review translation is missing.`);
          } else if (outputKeys.some((key) => preReviewRecord[key] !== output[key])) {
            calculatedRevisedIds.push(entryId);
          }
        }
      }
      if (JSON.stringify(reviewedIds) !== JSON.stringify(selectedIds)) {
        errors.push('Independent review evidence identities differ from the review manifest.');
      }
      if (JSON.stringify(calculatedRevisedIds.sort((left, right) => left.localeCompare(right, 'en')))
        !== JSON.stringify([...revisedIds].sort((left, right) => left.localeCompare(right, 'en')))) {
        errors.push('Independent review report revisions differ from the reviewed outputs.');
      }
      const selectedIdSet = new Set(selectedIds);
      for (const [entryId, finalRecord] of compiled) {
        if (selectedIdSet.has(entryId)) continue;
        const preReviewRecord = preReview.entries?.[entryId];
        if (!preReviewRecord || outputKeys.some((key) => preReviewRecord[key] !== finalRecord[key])) {
          errors.push(`${entryId}: unselected translation changed after independent review preparation.`);
        }
      }
    }
  }
}
const independentlyReviewedEntryIds = new Set(
  Array.isArray(reviewManifest?.selectedEntryIds) ? reviewManifest.selectedEntryIds : [],
);
const unreviewedWarningEntryIds = [...new Set(warnings.map((warning) => warning.split(': ')[0]))]
  .filter((entryId) => !independentlyReviewedEntryIds.has(entryId));
if (options.requireComplete && unreviewedWarningEntryIds.length > 0) {
  errors.push(`${unreviewedWarningEntryIds.length} warning-producing entries were not independently reviewed.`);
}
if (errors.length > 0) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  const orderedEntries = Object.fromEntries([...compiled].sort(([left], [right]) => left.localeCompare(right, 'en')));
  const payload = {
    schemaVersion: 1,
    catalogSha256: preparation.catalogSha256,
    generator: {
      provider: 'codex',
      method: 'Meaning-aligned Slovak learner hints generated from the reviewed English catalog.',
      promptVersion: 1,
    },
    qa: {
      mode: preparation.mode,
      entries: compiled.size,
      highConfidence: [...compiled.values()].filter((entry) => entry.confidence === 'high').length,
      mediumConfidence: [...compiled.values()].filter((entry) => entry.confidence === 'medium').length,
      lowConfidence: [...compiled.values()].filter((entry) => entry.confidence === 'low').length,
      needsReview: [...compiled.values()].filter((entry) => entry.needsReview).length,
      independentlyReviewed: reviewReport?.selectedEntries ?? 0,
      independentlyRevised: reviewReport?.revisedEntries ?? 0,
      independentReviewReasonCounts: reviewReport?.reasonCounts ?? {},
      auditedWarningMessages: warnings.length - unreviewedWarningEntryIds.length,
      unreviewedWarningEntries: unreviewedWarningEntryIds,
      warnings,
    },
    entries: orderedEntries,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  payload.sha256 = createHash('sha256').update(serialized).digest('hex');
  writeFileSync(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Validated ${compiled.size.toLocaleString()} entries with ${warnings.length.toLocaleString()} warning(s).`);
  console.log(`Compiled output: ${options.outputPath}`);
}
