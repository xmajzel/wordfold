import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const defaultInputPath = resolve(
  '.artifacts/cefr-learner-definitions/adjudication/adjudicated-56.proposed.json',
);
const defaultOutputPath = resolve('assets/catalog/cefr-learner-definition-adjudications.json');
const catalogPath = resolve('assets/catalog/cefr-catalog.json');
const learnerDefinitionsPath = resolve('assets/catalog/cefr-learner-definitions.json');
const wordnetPath = resolve('assets/catalog/wordnet.sqlite');
const confidenceValues = new Set(['high', 'medium']);
const inputKeys = [
  'confidence',
  'definition',
  'entryId',
  'example',
  'meaningReferenceSenseId',
  'meaningSource',
  'normalizedTerm',
  'partOfSpeech',
  'rationale',
];
const wordnetPartOfSpeechLabels = {
  a: 'adjective',
  n: 'noun',
  r: 'adverb',
  s: 'adjective',
  v: 'verb',
};

function parseArgs(argv) {
  const options = { inputPath: defaultInputPath, outputPath: defaultOutputPath };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--input') options.inputPath = resolve(argv[++index]);
    else if (argument === '--output') options.outputPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function words(value) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function normalizedLetters(value) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function containsTerm(value, term) {
  return ` ${normalizedLetters(value)} `.includes(` ${normalizedLetters(term)} `);
}

function containsTermOrCommonInflection(value, term) {
  if (containsTerm(value, term)) return true;
  const normalizedTerm = normalizedLetters(term);
  if (!normalizedTerm || normalizedTerm.includes(' ')) return false;
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const options = parseArgs(process.argv.slice(2));
const catalogText = readFileSync(catalogPath, 'utf8');
const catalog = JSON.parse(catalogText);
const learnerDefinitions = JSON.parse(readFileSync(learnerDefinitionsPath, 'utf8'));
const proposals = JSON.parse(readFileSync(options.inputPath, 'utf8'));
const errors = [];

if (!Array.isArray(proposals)) {
  throw new Error('Adjudication input must be a JSON array.');
}

const baseById = new Map(catalog.entries.map((entry) => [entry.id, entry]));
const unresolved = Object.values(learnerDefinitions.entries).filter((entry) => entry.needsReview === true);
const unresolvedIds = new Set(unresolved.map((entry) => entry.entryId));
const proposalById = new Map(proposals.map((record) => [record?.entryId, record]));

if (unresolved.length !== 56) errors.push(`Expected 56 current needsReview records; found ${unresolved.length}.`);
if (proposalById.size !== proposals.length) errors.push('Adjudication input contains duplicate entry IDs.');
for (const id of unresolvedIds) {
  if (!proposalById.has(id)) errors.push(`${id}: adjudication is missing.`);
}
for (const record of proposals) {
  if (!unresolvedIds.has(record?.entryId)) errors.push(`${record?.entryId ?? 'unknown'}: unexpected adjudication.`);
}

const database = new DatabaseSync(wordnetPath, { readOnly: true });
const findSense = database.prepare(
  'SELECT id, normalized_term, part_of_speech FROM senses WHERE id = ?',
);
const compiled = new Map();

for (const record of proposals) {
  const label = record?.entryId ?? 'unknown';
  const initialErrorCount = errors.length;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    errors.push(`${label}: adjudication must be an object.`);
    continue;
  }
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(inputKeys)) {
    errors.push(`${label}: adjudication fields do not match the required schema.`);
  }
  const base = baseById.get(record.entryId);
  const learner = learnerDefinitions.entries[record.entryId];
  if (!base) errors.push(`${label}: base catalog entry does not exist.`);
  if (!learner || learner.needsReview !== true) errors.push(`${label}: current learner record is not review-gated.`);
  if (base && record.normalizedTerm !== base.normalizedTerm) errors.push(`${label}: normalizedTerm does not match the base catalog.`);
  if (learner && record.normalizedTerm !== learner.normalizedTerm) errors.push(`${label}: normalizedTerm does not match the learner record.`);
  if (!['curated', 'wordnet'].includes(record.meaningSource)) errors.push(`${label}: meaningSource must be curated or wordnet.`);
  if (!confidenceValues.has(record.confidence)) errors.push(`${label}: confidence must be high or medium.`);
  if (typeof record.partOfSpeech !== 'string' || !record.partOfSpeech.trim()) errors.push(`${label}: partOfSpeech must be non-empty.`);
  if (typeof record.definition !== 'string' || words(record.definition).length < 3 || words(record.definition).length > 24) {
    errors.push(`${label}: definition must contain 3-24 words.`);
  }
  if (typeof record.example !== 'string' || words(record.example).length < 4 || words(record.example).length > 24) {
    errors.push(`${label}: example must contain 4-24 words.`);
  } else if (base && !containsTermOrCommonInflection(record.example, base.term)) {
    errors.push(`${label}: example does not contain the term or a common inflection.`);
  }
  if (typeof record.rationale !== 'string' || !record.rationale.trim()) errors.push(`${label}: rationale must be non-empty.`);

  if (record.meaningSource === 'curated') {
    if (record.meaningReferenceSenseId !== null) {
      errors.push(`${label}: curated adjudication must have a null meaningReferenceSenseId.`);
    }
  } else if (typeof record.meaningReferenceSenseId !== 'string' || !record.meaningReferenceSenseId) {
    errors.push(`${label}: wordnet adjudication must reference a sense ID.`);
  } else {
    const sense = findSense.get(record.meaningReferenceSenseId);
    if (!sense) errors.push(`${label}: referenced WordNet sense does not exist.`);
    else {
      if (sense.normalized_term !== record.normalizedTerm) errors.push(`${label}: referenced WordNet sense has a different term.`);
      if (wordnetPartOfSpeechLabels[sense.part_of_speech] !== record.partOfSpeech) {
        errors.push(`${label}: referenced WordNet sense has a different part of speech.`);
      }
    }
  }

  if (errors.length !== initialErrorCount) continue;
  compiled.set(record.entryId, {
    ...record,
    definition: normalizeSentence(record.definition),
    example: normalizeSentence(record.example),
    needsReview: false,
  });
}
database.close();

if (compiled.size !== unresolved.length) {
  errors.push(`Compiled ${compiled.size} adjudications; expected ${unresolved.length}.`);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  const orderedEntries = Object.fromEntries([...compiled].sort(([left], [right]) => left.localeCompare(right, 'en')));
  const payload = {
    schemaVersion: 1,
    catalogSha256: sha256(catalogText),
    provenance: {
      provider: 'codex',
      method: 'Independent adjudication of every review-gated learner definition using catalog context and bundled WordNet evidence.',
      input: '.artifacts/cefr-learner-definitions/adjudication/adjudicated-56.proposed.json',
      sourceLearnerDefinitionsSha256: learnerDefinitions.sha256,
    },
    qa: {
      entries: compiled.size,
      expectedReviewGatedEntries: unresolved.length,
      wordnetReferences: [...compiled.values()].filter((entry) => entry.meaningSource === 'wordnet').length,
      curatedMeanings: [...compiled.values()].filter((entry) => entry.meaningSource === 'curated').length,
      highConfidence: [...compiled.values()].filter((entry) => entry.confidence === 'high').length,
      mediumConfidence: [...compiled.values()].filter((entry) => entry.confidence === 'medium').length,
      unresolved: 0,
      warnings: [],
    },
    entries: orderedEntries,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const output = { ...payload, sha256: sha256(serialized) };
  writeFileSync(options.outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Validated and compiled ${compiled.size} adjudications.`);
  console.log(`Compiled output: ${options.outputPath}`);
}
