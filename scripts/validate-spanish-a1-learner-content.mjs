import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256, writeFileAtomic } from './prepare-spanish-a1-learner-content.mjs';

const OUTPUT_KEYS = [
  'entryId', 'term', 'normalizedTerm', 'partOfSpeech', 'level',
  'pcicClassification', 'meaningReferenceSenseId', 'definition', 'example',
  'confidence', 'needsReview', 'reviewNote',
].sort();
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const FORBIDDEN = /(?:https?:\/\/|www\.|<[^>]*>|```|[\u0000-\u001f\u007f])/iu;

function parseArgs(argv) {
  const options = {
    manifestPath: resolve('.artifacts/spanish-a1-learner-content/pilot/manifest.json'),
    usagePath: null,
    reviewOutputPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest') options.manifestPath = resolve(argv[++index]);
    else if (argument === '--usage') options.usagePath = resolve(argv[++index]);
    else if (argument === '--review-output') options.reviewOutputPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wordCount(value) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function normalize(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function containsWholeTerm(text, term) {
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{M}])${escapeRegExp(normalize(term)).replace(/ /gu, '\\s+')}(?:$|[^\\p{L}\\p{M}])`, 'iu');
  return pattern.test(normalize(text));
}

function validateSentence(value, label, minimum, maximum) {
  assert(typeof value === 'string', `${label} must be a string.`);
  assert(!FORBIDDEN.test(value), `${label} contains forbidden markup, URL, or control text.`);
  const words = wordCount(value);
  assert(words >= minimum && words <= maximum, `${label} must contain ${minimum}–${maximum} words; received ${words}.`);
  assert(/^[¿¡«“"'([{]*\p{Lu}/u.test(value), `${label} must start with an uppercase letter, allowing opening punctuation.`);
  assert(/[.!?]$/u.test(value), `${label} must end with sentence punctuation.`);
}

export function validateBatch(input, output) {
  assert(Array.isArray(input) && Array.isArray(output), 'Batch input and output must be arrays.');
  assert(output.length === input.length, `Output has ${output.length} records; expected ${input.length}.`);
  const seen = new Set();
  let reviewCount = 0;
  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  for (let index = 0; index < input.length; index += 1) {
    const expected = input[index];
    const actual = output[index];
    const label = `Entry ${index + 1} (${expected.entryId})`;
    assert(actual && typeof actual === 'object' && !Array.isArray(actual), `${label}: output must be an object.`);
    assert(JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(OUTPUT_KEYS), `${label}: output keys do not exactly match the schema.`);
    assert(!seen.has(actual.entryId), `${label}: duplicate output entryId.`);
    seen.add(actual.entryId);
    for (const key of ['entryId', 'term', 'normalizedTerm', 'partOfSpeech', 'level', 'pcicClassification']) {
      assert(actual[key] === expected[key], `${label}: fixed ${key} changed.`);
    }
    assert(expected.candidateSenses.some((sense) => sense.senseId === actual.meaningReferenceSenseId), `${label}: selected sense was not supplied.`);
    validateSentence(actual.definition, `${label} definition`, 3, 24);
    validateSentence(actual.example, `${label} example`, 4, 24);
    assert(!containsWholeTerm(actual.definition, expected.term), `${label}: definition is circular.`);
    assert(containsWholeTerm(actual.example, expected.term), `${label}: example does not contain the exact supplied term.`);
    assert(CONFIDENCE.has(actual.confidence), `${label}: invalid confidence.`);
    confidenceCounts[actual.confidence] += 1;
    assert(typeof actual.needsReview === 'boolean', `${label}: needsReview must be boolean.`);
    assert(typeof actual.reviewNote === 'string', `${label}: reviewNote must be a string.`);
    if (actual.needsReview) {
      reviewCount += 1;
      assert(actual.reviewNote.trim().length > 0, `${label}: reviewNote is required when needsReview is true.`);
    } else assert(actual.reviewNote === '', `${label}: reviewNote must be empty when needsReview is false.`);
  }
  return { entries: output.length, reviewCount, confidenceCounts };
}

function validateUsage(usage, batchNumber) {
  if (usage === null) return { source: 'not-reported', inputTokens: null, outputTokens: null, totalTokens: null };
  const record = usage.batches?.find((candidate) => candidate.batchNumber === batchNumber);
  assert(record, `Usage file has no record for batch ${batchNumber}.`);
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens']) {
    assert(Number.isInteger(record[key]) && record[key] >= 0, `Batch ${batchNumber} usage ${key} must be a non-negative integer.`);
  }
  assert(record.totalTokens === record.inputTokens + record.outputTokens, `Batch ${batchNumber} usage total does not reconcile.`);
  assert(typeof record.source === 'string' && record.source.length > 0, `Batch ${batchNumber} usage source is required.`);
  return record;
}

export function validateRun(manifestPath, usagePath = null, reviewOutputPath = null) {
  const manifestText = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestText);
  assert(manifest.schemaVersion === 1 && manifest.notHumanReview === true && ['pilot', 'full'].includes(manifest.mode), 'Expected a Spanish learner-content manifest.');
  const promptText = readFileSync(manifest.prompt.path);
  const schemaText = readFileSync(manifest.outputSchema.path);
  assert(sha256(promptText) === manifest.prompt.sha256, 'Prompt hash mismatch.');
  assert(sha256(schemaText) === manifest.outputSchema.sha256, 'Output schema hash mismatch.');
  if (manifest.codexOutputSchema) {
    const codexSchemaText = readFileSync(manifest.codexOutputSchema.path);
    assert(sha256(codexSchemaText) === manifest.codexOutputSchema.sha256, 'Codex output schema hash mismatch.');
  }
  const usage = usagePath ? JSON.parse(readFileSync(usagePath, 'utf8')) : null;
  const results = [];
  const runEntryIds = new Set();
  const reviewEntries = [];
  for (const batch of manifest.batches) {
    const inputText = readFileSync(batch.inputPath);
    assert(sha256(inputText) === batch.inputSha256, `Batch ${batch.batchNumber} input hash mismatch.`);
    assert(existsSync(batch.outputPath), `Batch ${batch.batchNumber} output is missing.`);
    const outputText = readFileSync(batch.outputPath);
    let validation;
    let output;
    try {
      output = JSON.parse(outputText);
      validation = validateBatch(JSON.parse(inputText), output);
    } catch (error) {
      const checkpoint = {
        schemaVersion: 1,
        status: 'invalid',
        runIdentitySha256: manifest.runIdentitySha256,
        batchNumber: batch.batchNumber,
        inputSha256: batch.inputSha256,
        outputSha256: sha256(outputText),
        error: error.message,
      };
      writeFileAtomic(batch.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
      throw error;
    }
    const checkpoint = {
      schemaVersion: 1,
      status: 'valid',
      runIdentitySha256: manifest.runIdentitySha256,
      batchNumber: batch.batchNumber,
      boundaries: { startIndex: batch.startIndex, endIndexExclusive: batch.endIndexExclusive },
      entryIds: batch.entryIds,
      inputSha256: batch.inputSha256,
      outputSha256: sha256(outputText),
      promptSha256: manifest.prompt.sha256,
      schemaSha256: manifest.outputSchema.sha256,
      model: batch.reusedFrom && manifest.acceptedPilot ? manifest.acceptedPilot.model : manifest.model,
      usage: validateUsage(usage, batch.batchNumber),
      validation,
    };
    for (const entry of JSON.parse(outputText)) {
      assert(!runEntryIds.has(entry.entryId), `Duplicate entryId across batches: ${entry.entryId}.`);
      runEntryIds.add(entry.entryId);
    }
    reviewEntries.push(...output.filter((entry) => entry.needsReview));
    writeFileAtomic(batch.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    results.push({ batchNumber: batch.batchNumber, ...validation, usage: checkpoint.usage });
  }
  assert(runEntryIds.size === manifest.entryCount, `Run has ${runEntryIds.size} unique records; expected ${manifest.entryCount}.`);
  if (manifest.mode === 'full') assert(runEntryIds.size === manifest.inputCatalog.levelEntries, `Full ${manifest.level} run entry count differs from the frozen level slice.`);
  if (reviewOutputPath) {
    writeFileAtomic(reviewOutputPath, `${JSON.stringify({
      schemaVersion: 1,
      courseId: manifest.courseId,
      level: manifest.level,
      runIdentitySha256: manifest.runIdentitySha256,
      entryCount: reviewEntries.length,
      entries: reviewEntries,
    }, null, 2)}\n`);
  }
  return results;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const results = validateRun(options.manifestPath, options.usagePath, options.reviewOutputPath);
    const entries = results.reduce((sum, result) => sum + result.entries, 0);
    const reviews = results.reduce((sum, result) => sum + result.reviewCount, 0);
    console.log(`Validated ${entries} learner-content records in ${results.length} batches; ${reviews} flagged for review.`);
    for (const result of results) console.log(`Batch ${result.batchNumber}: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
