import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const confidenceValues = new Set(['high', 'medium', 'low']);
const partOfSpeechLabels = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };
const outputKeys = [
  'confidence',
  'definition',
  'entryId',
  'example',
  'meaningReferenceSenseId',
  'needsReview',
  'normalizedTerm',
  'reviewNote',
];

function parseArgs(argv) {
  const options = {
    manifestPath: resolve('.artifacts/cefr-learner-definitions/pilot/manifest.json'),
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
  return value.trim().split(/\s+/).filter(Boolean);
}

function normalizedLetters(value) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function containsTerm(value, term) {
  const normalizedValue = ` ${normalizedLetters(value)} `;
  const normalizedTerm = ` ${normalizedLetters(term)} `;
  return normalizedValue.includes(normalizedTerm);
}

function containsTermOrCommonInflection(value, term) {
  if (containsTerm(value, term)) return true;
  const normalizedTerm = normalizedLetters(term);
  if (normalizedTerm.includes(' ')) return false;
  const tokens = new Set(normalizedLetters(value).split(' '));
  const forms = [
    `${normalizedTerm}s`,
    `${normalizedTerm}es`,
    `${normalizedTerm}ed`,
    `${normalizedTerm}d`,
    `${normalizedTerm}ing`,
  ];
  if (normalizedTerm.endsWith('y')) forms.push(`${normalizedTerm.slice(0, -1)}ies`);
  if (normalizedTerm.endsWith('e')) forms.push(`${normalizedTerm.slice(0, -1)}ing`);
  return forms.some((form) => tokens.has(form));
}

function normalizeSentence(value) {
  const trimmed = value.trim();
  const capitalized = `${trimmed.charAt(0).toLocaleUpperCase('en')}${trimmed.slice(1)}`;
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function validateRecord(record, input, errors, warnings) {
  const initialErrorCount = errors.length;
  const label = input.entryId;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    errors.push(`${label}: output must be an object.`);
    return false;
  }
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify(outputKeys)) errors.push(`${label}: output fields do not match the required schema.`);
  if (record.entryId !== input.entryId) errors.push(`${label}: entryId does not match.`);
  if (record.normalizedTerm !== input.normalizedTerm) errors.push(`${label}: normalizedTerm does not match.`);
  if (!input.candidateSenses.some((sense) => sense.id === record.meaningReferenceSenseId)) {
    errors.push(`${label}: meaningReferenceSenseId is not a supplied compatible sense.`);
  }
  if (typeof record.definition !== 'string' || words(record.definition).length < 3 || words(record.definition).length > 24) {
    errors.push(`${label}: definition must contain 3-24 words.`);
  }
  if (typeof record.example !== 'string' || words(record.example).length < 4 || words(record.example).length > 24) {
    errors.push(`${label}: example must contain 4-24 words.`);
  } else if (!containsTermOrCommonInflection(record.example, input.term)) {
    errors.push(`${label}: example does not contain the term or a common inflection.`);
  }
  if (typeof record.definition === 'string' && containsTerm(record.definition, input.term)) {
    errors.push(`${label}: definition may be circular.`);
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
  return errors.length === initialErrorCount;
}

const options = parseArgs(process.argv.slice(2));
if (options.requireComplete && options.allowIncomplete) {
  throw new Error('--require-complete cannot be combined with --allow-incomplete.');
}
const preparation = JSON.parse(readFileSync(options.manifestPath, 'utf8'));
const errors = [];
const warnings = [];
const compiled = new Map();

for (const chunk of preparation.chunks) {
  if (!existsSync(chunk.outputPath)) {
    if (!options.allowIncomplete) errors.push(`${basename(chunk.outputPath)}: output file is missing.`);
    continue;
  }
  const inputs = JSON.parse(readFileSync(chunk.inputPath, 'utf8'));
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
    const selectedSense = input.candidateSenses.find((sense) => sense.id === record.meaningReferenceSenseId);
    compiled.set(input.entryId, {
      ...record,
      definition: normalizeSentence(record.definition),
      example: normalizeSentence(record.example),
      partOfSpeech: selectedSense ? partOfSpeechLabels[selectedSense.partOfSpeech] ?? selectedSense.partOfSpeech : null,
      translationReviewRequired: record.meaningReferenceSenseId !== input.current.catalogSenseId,
    });
  }
  for (const record of outputs) {
    if (!inputs.some((input) => input.entryId === record?.entryId)) errors.push(`${record?.entryId ?? 'unknown'}: unexpected output entry.`);
  }
}

if ((!options.allowIncomplete || options.requireComplete) && compiled.size !== preparation.selectedEntries) {
  errors.push(`Compiled ${compiled.size} entries; expected ${preparation.selectedEntries}.`);
}
if (options.requireComplete && preparation.selectedEntries !== preparation.catalogEntries) {
  errors.push(`Complete output requires all ${preparation.catalogEntries} catalog entries.`);
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
      method: 'Repository-grounded sense selection and learner-friendly rewriting with independent chunk validation.',
      promptVersion: 1,
    },
    qa: {
      mode: preparation.mode,
      entries: compiled.size,
      highConfidence: [...compiled.values()].filter((entry) => entry.confidence === 'high').length,
      mediumConfidence: [...compiled.values()].filter((entry) => entry.confidence === 'medium').length,
      lowConfidence: [...compiled.values()].filter((entry) => entry.confidence === 'low').length,
      needsReview: [...compiled.values()].filter((entry) => entry.needsReview).length,
      translationReviewRequired: [...compiled.values()].filter((entry) => entry.translationReviewRequired).length,
      translationReviewEntryIds: [...compiled.values()]
        .filter((entry) => entry.translationReviewRequired)
        .map((entry) => entry.entryId),
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
