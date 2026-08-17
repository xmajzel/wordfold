import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const defaultRunDirectory = resolve('.artifacts/cefr-learner-translations-sk/all');
const outputKeys = [
  'confidence',
  'entryId',
  'needsReview',
  'normalizedTerm',
  'reviewNote',
  'translation',
];
const sampleInterval = 10;

function parseArgs(argv) {
  const options = {
    manifestPath: resolve(defaultRunDirectory, 'manifest.json'),
    compiledPath: resolve(defaultRunDirectory, 'compiled.pre-review.json'),
    outputDirectory: resolve(defaultRunDirectory, 'review'),
    chunkSize: 200,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest') options.manifestPath = resolve(argv[++index]);
    else if (argument === '--compiled') options.compiledPath = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else if (argument === '--chunk-size') options.chunkSize = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.chunkSize) || options.chunkSize < 1) {
    throw new Error('--chunk-size must be a positive integer.');
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function words(value) {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function hasUsageMarker(value) {
  return /[()[\]]/u.test(value)
    || /(?:^|\s)(?:arch|archaic|expr|form|hanl|hovor|hovorovo|iron|kniž|neform|odbor|pejor|pren|slang|vulg|zastar|zried)\.?\b/iu.test(value);
}

function exactOutputShape(record) {
  return record
    && typeof record === 'object'
    && !Array.isArray(record)
    && JSON.stringify(Object.keys(record).sort()) === JSON.stringify(outputKeys);
}

function addReason(reasonsById, entryId, reason) {
  const reasons = reasonsById.get(entryId) ?? new Set();
  reasons.add(reason);
  reasonsById.set(entryId, reasons);
}

function warningEntryId(warning, knownIds) {
  if (typeof warning !== 'string') return null;
  const marker = warning.indexOf(': ');
  if (marker < 0) return null;
  const candidate = warning.slice(0, marker);
  return knownIds.has(candidate) ? candidate : null;
}

const options = parseArgs(process.argv.slice(2));
const preparationText = readFileSync(options.manifestPath, 'utf8');
const preparation = JSON.parse(preparationText);
const compiledText = readFileSync(options.compiledPath, 'utf8');
const compiled = JSON.parse(compiledText);
const adjudications = JSON.parse(readFileSync(
  resolve('assets/catalog/cefr-learner-definition-adjudications.json'),
  'utf8',
));
const legacyOverrides = JSON.parse(readFileSync(
  resolve('assets/catalog/cefr-translations-en-sk-overrides.json'),
  'utf8',
)).translations;

if (preparation.mode !== 'all' || preparation.selectedEntries !== preparation.catalogEntries) {
  throw new Error('Translation review requires a complete all-catalog preparation manifest.');
}
if (compiled.qa?.entries !== preparation.selectedEntries || compiled.qa?.needsReview !== 0) {
  throw new Error('compiled.pre-review.json must contain every prepared entry with zero unresolved records.');
}
if (Object.keys(adjudications.entries ?? {}).length !== 56) {
  throw new Error('Expected exactly 56 reviewed English adjudications.');
}
if (Object.keys(legacyOverrides ?? {}).length !== 24) {
  throw new Error('Expected exactly 24 legacy translation overrides.');
}

const inputsById = new Map();
const outputsById = new Map();
const sourceOutputTexts = [];
for (const chunk of preparation.chunks) {
  const inputs = JSON.parse(readFileSync(chunk.inputPath, 'utf8'));
  const outputText = readFileSync(chunk.outputPath, 'utf8');
  const outputs = JSON.parse(outputText);
  sourceOutputTexts.push(outputText);
  if (!Array.isArray(inputs) || inputs.length !== chunk.entries) {
    throw new Error(`${basename(chunk.inputPath)} does not match its manifest count.`);
  }
  if (!Array.isArray(outputs) || outputs.length !== chunk.entries) {
    throw new Error(`${basename(chunk.outputPath)} does not match its manifest count.`);
  }
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const output = outputs[index];
    if (input.entryId !== chunk.entryIds[index]) {
      throw new Error(`${basename(chunk.inputPath)} is not in manifest order.`);
    }
    if (!exactOutputShape(output)) {
      throw new Error(`${input.entryId}: source output fields do not match the six-field schema.`);
    }
    if (output.entryId !== input.entryId || output.normalizedTerm !== input.normalizedTerm) {
      throw new Error(`${input.entryId}: source input and output identities differ.`);
    }
    if (inputsById.has(input.entryId) || outputsById.has(input.entryId)) {
      throw new Error(`${input.entryId}: duplicate source entry.`);
    }
    const compiledRecord = compiled.entries?.[input.entryId];
    if (!compiledRecord || outputKeys.some((key) => compiledRecord[key] !== output[key])) {
      throw new Error(`${input.entryId}: source output differs from compiled.pre-review.json.`);
    }
    inputsById.set(input.entryId, input);
    outputsById.set(input.entryId, output);
  }
}
if (inputsById.size !== preparation.selectedEntries || outputsById.size !== preparation.selectedEntries) {
  throw new Error(`Read ${inputsById.size} source entries; expected ${preparation.selectedEntries}.`);
}

const knownIds = new Set(inputsById.keys());
const reasonsById = new Map();
for (const input of inputsById.values()) {
  const output = outputsById.get(input.entryId);
  if (input.translationReviewRequired) addReason(reasonsById, input.entryId, 'changed-english-meaning');
  if (Object.hasOwn(adjudications.entries, input.entryId)) addReason(reasonsById, input.entryId, 'english-adjudication');
  if (Object.hasOwn(legacyOverrides, input.entryId)) addReason(reasonsById, input.entryId, 'legacy-translation-override');
  if (words(input.term).length > 1) addReason(reasonsById, input.entryId, 'multiword-english-term');
  if (input.finalEnglish.confidence !== 'high') addReason(reasonsById, input.entryId, 'english-confidence-not-high');
  if (output.confidence !== 'high') addReason(reasonsById, input.entryId, 'slovak-confidence-not-high');
  if (words(output.translation).length > 5 || hasUsageMarker(output.translation)) {
    addReason(reasonsById, input.entryId, 'long-or-marked-translation');
  }
}
for (const warning of compiled.qa?.warnings ?? []) {
  const entryId = warningEntryId(warning, knownIds);
  if (!entryId) throw new Error(`Could not identify validator warning entry: ${warning}`);
  addReason(reasonsById, entryId, 'validator-warning');
}

const unflaggedByStratum = new Map();
for (const input of inputsById.values()) {
  if (reasonsById.has(input.entryId)) continue;
  const stratum = `${input.level}|${input.finalEnglish.partOfSpeech}`;
  const entries = unflaggedByStratum.get(stratum) ?? [];
  entries.push(input);
  unflaggedByStratum.set(stratum, entries);
}
for (const entries of unflaggedByStratum.values()) {
  entries.sort((left, right) => left.entryId.localeCompare(right.entryId, 'en'));
  for (let index = 0; index < entries.length; index += sampleInterval) {
    addReason(reasonsById, entries[index].entryId, 'stratified-ten-percent-sample');
  }
}

const selected = [...reasonsById.keys()]
  .sort((left, right) => left.localeCompare(right, 'en'))
  .map((entryId) => {
    const input = inputsById.get(entryId);
    return {
      entryId,
      term: input.term,
      normalizedTerm: input.normalizedTerm,
      level: input.level,
      finalEnglish: input.finalEnglish,
      currentLegacyTranslation: input.currentTranslation,
      proposed: outputsById.get(entryId),
      reasons: [...reasonsById.get(entryId)].sort((left, right) => left.localeCompare(right, 'en')),
    };
  });
const reasonCounts = {};
for (const entry of selected) {
  for (const reason of entry.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
}

mkdirSync(options.outputDirectory, { recursive: true });
const promptPath = resolve(options.outputDirectory, 'PROMPT.md');
writeFileSync(promptPath, `# Independent CEFR Slovak translation review

Independently review every proposed Slovak learner hint against the supplied final English meaning, example, part of speech, and CEFR level. The legacy translation is evidence only and may refer to an obsolete meaning. Accept the proposal when it is the most natural concise Slovak equivalent; otherwise revise it.

Return one JSON array in the corresponding \`.output.json\` file, in exactly the same order as the input. Each item must contain exactly these six fields:

- \`entryId\`
- \`normalizedTerm\`
- \`translation\` (normally 1-5 words, at most 12)
- \`confidence\` (\`high\` or \`medium\`)
- \`needsReview\` (always \`false\`)
- \`reviewNote\` (always an empty string)

Use contemporary standard Slovak. Use noun nominative, verb infinitive with necessary \`sa\` or \`si\`, masculine singular adjective, and the natural adverb form. Translate multiword expressions as a whole. Preserve an essential register marker only when necessary. Return zero unresolved records, no alternatives, markdown, commentary, or translated examples.
`);

const chunks = [];
for (let offset = 0; offset < selected.length; offset += options.chunkSize) {
  const entries = selected.slice(offset, offset + options.chunkSize);
  const chunk = chunks.length + 1;
  const baseName = `review-${String(chunk).padStart(3, '0')}`;
  const inputPath = resolve(options.outputDirectory, `${baseName}.input.json`);
  const outputPath = resolve(options.outputDirectory, `${baseName}.output.json`);
  const inputText = `${JSON.stringify(entries, null, 2)}\n`;
  writeFileSync(inputPath, inputText);
  chunks.push({
    chunk,
    inputPath,
    outputPath,
    entries: entries.length,
    entryIds: entries.map((entry) => entry.entryId),
    inputSha256: sha256(inputText),
  });
}

const reviewManifest = {
  schemaVersion: 1,
  fullManifestPath: options.manifestPath,
  compiledPreReviewPath: options.compiledPath,
  fullManifestSha256: sha256(preparationText),
  compiledPreReviewSha256: sha256(compiledText),
  sourceOutputsSha256: sha256(sourceOutputTexts.join('\n')),
  sourceEntries: inputsById.size,
  selectedEntries: selected.length,
  sample: {
    method: 'Every tenth stable-ID-sorted entry within each CEFR-level and final-part-of-speech stratum.',
    interval: sampleInterval,
  },
  reasonCounts,
  selectedEntryIds: selected.map((entry) => entry.entryId),
  chunkSize: options.chunkSize,
  promptPath,
  chunks,
};
const manifestPath = resolve(options.outputDirectory, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(reviewManifest, null, 2)}\n`);
console.log(`Prepared independent review for ${selected.length.toLocaleString()} of ${inputsById.size.toLocaleString()} translations in ${chunks.length} chunk(s).`);
console.log(`Manifest: ${manifestPath}`);
