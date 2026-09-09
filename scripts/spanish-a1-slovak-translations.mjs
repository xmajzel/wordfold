import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBatch as validateLearnerBatch } from './validate-spanish-a1-learner-content.mjs';

const DESKTOP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';
const CODEX_BINARY = process.env.WORDFOLD_CODEX_BINARY || (existsSync(DESKTOP_CODEX) ? DESKTOP_CODEX : 'codex');
const EXPECTED_RUN_IDENTITY = '2cbb9d66a85503dcbf7f0dae04ab6fcd95f5ac53c893f3eaca69ea7091d1a483';
const EXPECTED_CONTENT_SHA256 = '5383a7a98cd218c707c850bdf88f20b943522c0782f4389418acc6cb304f3f1a';
const EXPECTED_RELEASE_ENTRIES = 1689;
const EXPECTED_GROUPS = 1600;
const EXPECTED_SHARED_GROUPS = 80;
const EXPECTED_SHARED_ENTRIES = 169;
const PILOT_GROUPS = 100;
const REMAINING_GROUPS = EXPECTED_GROUPS - PILOT_GROUPS;
const REVIEW_GROUPS = 30;
const BATCH_SIZE = 50;
const FULL_PROJECTION_TOKENS = 1_810_000;
const SHARED_DIVERGENCE_RULE_VERSION = 1;
const SHARED_DIVERGENCE_THRESHOLD = 0.40;
const SPANISH_DEFINITION_STOPWORDS = new Set([
  'a', 'al', 'algo', 'con', 'de', 'del', 'el', 'en', 'es', 'la', 'las', 'lo', 'los',
  'o', 'para', 'por', 'que', 'se', 'su', 'sus', 'un', 'una', 'uno', 'y',
]);
const MODEL = Object.freeze({ id: 'gpt-5.6-sol', reasoningEffort: 'medium' });

const PROMPT = `You are writing concise Slovak learning hints for Spanish vocabulary in Wordfold.

Each input is one selected Spanish synset/ILI group. Every member has the same selected meaning but may use a different Spanish headword. Read the Spanish definitions and examples, then write one natural shared Slovak hint for that exact meaning. Use contemporary standard Slovak as spoken in Slovakia: noun nominative, verb infinitive with necessary sa/si, masculine singular adjective, and natural adverb form. A hint is normally 1-5 words and may use a semicolon to preserve a necessary distinction.

Use memberOverrides when a single shared Slovak hint would be materially unnatural or misleading for a particular Spanish member despite the shared synset. Overrides must name only supplied member entry IDs. Every input includes sharedHintRisk. When sharedHintRisk.flagged=true, you must either provide at least one explicit member override or set needsReview=true and explain the unresolved member-specific distinction in reviewNote. A flagged group may never return only one unqualified shared hint. Do not translate examples, change Spanish content, change CEFR levels, browse, or claim human/native review. Set notHumanReview=true. Copy groupId exactly and preserve group order. Return only the requested JSON object.`;

const OVERRIDE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['entryId', 'slovakHint', 'rationale'],
  properties: {
    entryId: { type: 'string' },
    slovakHint: { type: 'string' },
    rationale: { type: 'string' },
  },
});

const OUTPUT_ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['groupId', 'notHumanReview', 'slovakHint', 'memberOverrides', 'confidence', 'needsReview', 'reviewNote'],
  properties: {
    groupId: { type: 'string' },
    notHumanReview: { type: 'boolean', const: true },
    slovakHint: { type: 'string' },
    memberOverrides: { type: 'array', items: OVERRIDE_SCHEMA },
    confidence: { enum: ['high', 'medium', 'low'] },
    needsReview: { type: 'boolean' },
    reviewNote: { type: 'string' },
  },
});

const CODEX_OUTPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Wordfold Spanish A1 grouped Slovak translation pilot',
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: { entries: { type: 'array', items: OUTPUT_ITEM_SCHEMA } },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeFileAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporaryPath, 'wx', 0o600);
  try {
    writeFileSync(descriptor, value);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function writeImmutable(path, value) {
  if (existsSync(path)) {
    if (!readFileSync(path).equals(Buffer.from(value))) throw new Error(`Immutable translation-pilot artifact changed: ${path}`);
    return;
  }
  writeFileAtomic(path, value);
}

function parseArgs(argv) {
  const options = {
    command: argv[0],
    learnerManifestPath: resolve('.artifacts/spanish-a1-learner-content/full/manifest.json'),
    releaseAdjudicationsPath: resolve('assets/catalog/spanish/a1-learner-content-adjudications.json'),
    crossReviewAdjudicationsPath: resolve('assets/catalog/spanish/a1-ai-cross-review-adjudications.json'),
    slovakPacketPath: resolve('.artifacts/spanish-a1-human-review/slovak-review-packet.json'),
    ownerAdjudicationsPath: resolve('assets/catalog/spanish/a1-slovak-owner-adjudications.json'),
    pilotDirectory: resolve('.artifacts/spanish-a1-slovak-translations/pilot'),
    outputDirectory: resolve('.artifacts/spanish-a1-slovak-translations/pilot'),
    riskReportPath: resolve('.artifacts/spanish-a1-slovak-translations/shared-hint-risk-report.json'),
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--learner-manifest') options.learnerManifestPath = resolve(argv[++index]);
    else if (argument === '--release-adjudications') options.releaseAdjudicationsPath = resolve(argv[++index]);
    else if (argument === '--cross-review-adjudications') options.crossReviewAdjudicationsPath = resolve(argv[++index]);
    else if (argument === '--slovak-packet') options.slovakPacketPath = resolve(argv[++index]);
    else if (argument === '--owner-adjudications') options.ownerAdjudicationsPath = resolve(argv[++index]);
    else if (argument === '--pilot-dir') options.pilotDirectory = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else if (argument === '--risk-report') options.riskReportPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  assert(['prepare', 'generate', 'analyze', 'analyze-shared', 'prepare-remaining', 'analyze-remaining'].includes(options.command), 'Usage: spanish-a1-slovak-translations.mjs prepare|generate|analyze|analyze-shared|prepare-remaining|analyze-remaining [options]');
  return options;
}

function proportionalAllocation(populations, sampleSize) {
  const total = Object.values(populations).reduce((sum, count) => sum + count, 0);
  const allocation = Object.fromEntries(Object.entries(populations).map(([key, count]) => {
    const exact = (sampleSize * count) / total;
    return [key, { count: Math.floor(exact), remainder: exact - Math.floor(exact) }];
  }));
  let remaining = sampleSize - Object.values(allocation).reduce((sum, value) => sum + value.count, 0);
  for (const key of Object.keys(allocation).sort((left, right) => allocation[right].remainder - allocation[left].remainder || left.localeCompare(right))) {
    if (remaining === 0) break;
    allocation[key].count += 1;
    remaining -= 1;
  }
  return Object.fromEntries(Object.entries(allocation).map(([key, value]) => [key, value.count]));
}

function groupStratum(group) {
  return `${group.members.length > 1 ? 'shared' : 'singleton'}:${group.partOfSpeech}`;
}

export function selectPilotGroups(groups, seed, size = PILOT_GROUPS, purpose = 'slovak-translation-pilot-v1') {
  assert(groups.length >= size, `Cannot sample ${size} groups from ${groups.length}.`);
  const populations = Object.fromEntries([...new Set(groups.map(groupStratum))].map((stratum) => [stratum, 0]));
  for (const group of groups) populations[groupStratum(group)] = (populations[groupStratum(group)] ?? 0) + 1;
  const typePopulations = {
    singleton: groups.filter((group) => group.members.length === 1).length,
    shared: groups.filter((group) => group.members.length > 1).length,
  };
  const typeAllocation = proportionalAllocation(typePopulations, size);
  const allocation = {};
  for (const type of ['singleton', 'shared']) {
    const typeStrata = Object.fromEntries(Object.entries(populations).filter(([stratum]) => stratum.startsWith(`${type}:`)));
    Object.assign(allocation, proportionalAllocation(typeStrata, typeAllocation[type]));
  }
  const selected = Object.entries(allocation).flatMap(([stratum, count]) => groups
    .filter((groupAdapt) => groupStratum(groupAdapt) === stratum)
    .sort((left, right) => {
      const leftHash = sha256(`${seed}\u0000${purpose}\u0000${stratum}\u0000${left.groupId}`);
      const rightHash = sha256(`${seed}\u0000${purpose}\u0000${stratum}\u0000${right.groupId}`);
      return leftHash.localeCompare(rightHash) || left.groupId.localeCompare(right.groupId);
    })
    .slice(0, count));
  return {
    populations,
    allocation,
    selected: selected.sort((left, right) => left.groupId.localeCompare(right.groupId)),
  };
}

function validateCrossReviewAdjudications(adjudications, generatedById) {
  assert(adjudications.schemaVersion === 1 && adjudications.notHumanReview === true, 'Invalid AI cross-review adjudications.');
  assert(adjudications.sourceRunIdentitySha256 === EXPECTED_RUN_IDENTITY, 'Cross-review adjudications use a different learner run.');
  assert(adjudications.sourceContentSha256 === EXPECTED_CONTENT_SHA256, 'Cross-review adjudications use different learner content.');
  assert(adjudications.entries.length === 14, 'Expected 14 AI cross-review adjudications.');
  for (const record of adjudications.entries) {
    const generated = generatedById.get(record.entryId);
    assert(generated, `${record.entryId}: cross-review adjudication entry is missing.`);
    assert(record.term === generated.term, `${record.entryId}: adjudicated term changed.`);
    assert(record.selectedSenseId === generated.meaningReferenceSenseId, `${record.entryId}: adjudicated selected sense changed.`);
    assert(record.originalDefinition === generated.definition, `${record.entryId}: adjudicated original definition changed.`);
    assert(['keep', 'repair'].includes(record.decision), `${record.entryId}: unsupported cross-review decision.`);
    assert(record.decision === 'repair' ? typeof record.replacementDefinition === 'string' : record.replacementDefinition === null, `${record.entryId}: invalid replacement definition.`);
  }
}

function definitionContentTokens(definition) {
  return new Set((definition
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es')
    .match(/\p{L}+/gu) ?? [])
    .filter((token) => !SPANISH_DEFINITION_STOPWORDS.has(token)));
}

function jaccardSimilarity(leftDefinition, rightDefinition) {
  const left = definitionContentTokens(leftDefinition);
  const right = definitionContentTokens(rightDefinition);
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = left.size + right.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export function analyzeSharedHintRisk(group) {
  if (group.members.length < 2) {
    return {
      ruleVersion: SHARED_DIVERGENCE_RULE_VERSION,
      method: 'minimum-pairwise-content-token-jaccard',
      thresholdInclusive: SHARED_DIVERGENCE_THRESHOLD,
      applies: false,
      flagged: false,
      minimumPairwiseScore: null,
      minimumPairEntryIds: [],
    };
  }
  const pairs = group.members.flatMap((left, leftIndex) => group.members.slice(leftIndex + 1).map((right) => ({
    score: jaccardSimilarity(left.definition, right.definition),
    members: [left.entryId, right.entryId].sort(),
  })));
  pairs.sort((left, right) => left.score - right.score
    || left.members[0].localeCompare(right.members[0])
    || left.members[1].localeCompare(right.members[1]));
  const minimum = pairs[0];
  return {
    ruleVersion: SHARED_DIVERGENCE_RULE_VERSION,
    method: 'minimum-pairwise-content-token-jaccard',
    thresholdInclusive: SHARED_DIVERGENCE_THRESHOLD,
    applies: true,
    flagged: minimum.score <= SHARED_DIVERGENCE_THRESHOLD,
    minimumPairwiseScore: minimum.score,
    minimumPairEntryIds: minimum.members,
  };
}

export function buildTranslationGroups(learnerManifestPath, releaseAdjudicationsPath, crossReviewAdjudicationsPath) {
  const learnerManifest = JSON.parse(readFileSync(learnerManifestPath, 'utf8'));
  assert(learnerManifest.mode === 'full' && learnerManifest.entryCount === 1707, 'Expected the immutable 1,707-entry A1 learner run.');
  assert(learnerManifest.runIdentitySha256 === EXPECTED_RUN_IDENTITY, 'Unexpected learner-run identity.');
  const generated = [];
  const selectedSenseByEntryId = new Map();
  for (const batch of learnerManifest.batches) {
    const inputText = readFileSync(batch.inputPath);
    const outputText = readFileSync(batch.outputPath);
    assert(sha256(inputText) === batch.inputSha256, `Learner batch ${batch.batchNumber}: input hash mismatch.`);
    const input = JSON.parse(inputText);
    const output = JSON.parse(outputText);
    validateLearnerBatch(input, output);
    for (let index = 0; index < input.length; index += 1) {
      const selectedSense = input[index].candidateSenses.find((sense) => sense.senseId === output[index].meaningReferenceSenseId);
      assert(selectedSense?.iliId, `${output[index].entryId}: selected sense has no ILI.`);
      selectedSenseByEntryId.set(output[index].entryId, selectedSense);
      generated.push(output[index]);
    }
  }
  assert(sha256(canonicalJson(generated)) === EXPECTED_CONTENT_SHA256, 'Immutable learner-content hash changed.');
  const generatedById = new Map(generated.map((entry) => [entry.entryId, entry]));
  const releaseAdjudications = JSON.parse(readFileSync(releaseAdjudicationsPath, 'utf8'));
  const crossReviewAdjudications = JSON.parse(readFileSync(crossReviewAdjudicationsPath, 'utf8'));
  validateCrossReviewAdjudications(crossReviewAdjudications, generatedById);
  const releaseDecisions = new Map(releaseAdjudications.entries.map((entry) => [entry.entryId, entry.decision]));
  assert(releaseDecisions.size === 23, 'Expected 23 release adjudications.');
  const repairs = new Map(crossReviewAdjudications.entries
    .filter((entry) => entry.decision === 'repair')
    .map((entry) => [entry.entryId, entry.replacementDefinition]));
  const eligible = generated.filter((entry) => !releaseDecisions.has(entry.entryId) || releaseDecisions.get(entry.entryId) === 'keep');
  assert(eligible.length === EXPECTED_RELEASE_ENTRIES, `Expected ${EXPECTED_RELEASE_ENTRIES} release-eligible entries; received ${eligible.length}.`);

  const byIli = new Map();
  for (const entry of eligible) {
    const sense = selectedSenseByEntryId.get(entry.entryId);
    const members = byIli.get(sense.iliId) ?? [];
    members.push({
      entryId: entry.entryId,
      term: entry.term,
      partOfSpeech: entry.partOfSpeech,
      level: entry.level,
      definition: repairs.get(entry.entryId) ?? entry.definition,
      example: entry.example,
      selectedSenseId: entry.meaningReferenceSenseId,
      definitionSource: repairs.has(entry.entryId) ? 'ai-cross-review-repair' : 'immutable-generation',
    });
    byIli.set(sense.iliId, members);
  }
  const groups = [...byIli].map(([iliId, members]) => {
    members.sort((left, right) => left.entryId.localeCompare(right.entryId));
    const partsOfSpeech = new Set(members.map((member) => member.partOfSpeech));
    assert(partsOfSpeech.size === 1, `${iliId}: shared ILI has multiple parts of speech.`);
    const group = {
      groupId: `es-sk:a1:${iliId}`,
      notHumanReview: true,
      iliId,
      partOfSpeech: members[0].partOfSpeech,
      members,
    };
    return { ...group, sharedHintRisk: analyzeSharedHintRisk(group) };
  }).sort((left, right) => left.groupId.localeCompare(right.groupId));
  const shared = groups.filter((group) => group.members.length > 1);
  assert(groups.length === EXPECTED_GROUPS, `Expected ${EXPECTED_GROUPS} groups; received ${groups.length}.`);
  assert(shared.length === EXPECTED_SHARED_GROUPS, `Expected ${EXPECTED_SHARED_GROUPS} shared groups; received ${shared.length}.`);
  assert(shared.reduce((sum, group) => sum + group.members.length, 0) === EXPECTED_SHARED_ENTRIES, 'Unexpected shared-group entry count.');
  return { learnerManifest, generated, groups, releaseAdjudications, crossReviewAdjudications };
}

function quantile(sortedValues, probability) {
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function roundScore(value) {
  return Number(value.toFixed(6));
}

export function summarizeSharedHintRisk(groups) {
  const shared = groups.filter((group) => group.sharedHintRisk.applies);
  const scores = shared.map((group) => group.sharedHintRisk.minimumPairwiseScore).sort((left, right) => left - right);
  const bins = [
    { label: '[0.00,0.10]', minimumExclusive: -1, maximumInclusive: 0.10 },
    { label: '(0.10,0.20]', minimumExclusive: 0.10, maximumInclusive: 0.20 },
    { label: '(0.20,0.30]', minimumExclusive: 0.20, maximumInclusive: 0.30 },
    { label: '(0.30,0.40]', minimumExclusive: 0.30, maximumInclusive: 0.40 },
    { label: '(0.40,0.50]', minimumExclusive: 0.40, maximumInclusive: 0.50 },
    { label: '(0.50,0.60]', minimumExclusive: 0.50, maximumInclusive: 0.60 },
    { label: '(0.60,0.75]', minimumExclusive: 0.60, maximumInclusive: 0.75 },
    { label: '(0.75,0.90]', minimumExclusive: 0.75, maximumInclusive: 0.90 },
    { label: '(0.90,1.00]', minimumExclusive: 0.90, maximumInclusive: 1.00 },
  ].map((bin) => ({
    range: bin.label,
    count: scores.filter((score) => score > bin.minimumExclusive && score <= bin.maximumInclusive).length,
  }));
  const belowOrEqual = scores.filter((score) => score <= SHARED_DIVERGENCE_THRESHOLD);
  const above = scores.filter((score) => score > SHARED_DIVERGENCE_THRESHOLD);
  const gaps = scores.slice(1).map((score, index) => ({
    lower: scores[index],
    upper: score,
    width: score - scores[index],
  })).sort((left, right) => right.width - left.width || left.lower - right.lower);
  return {
    ruleVersion: SHARED_DIVERGENCE_RULE_VERSION,
    method: 'minimum-pairwise-content-token-jaccard',
    thresholdInclusive: SHARED_DIVERGENCE_THRESHOLD,
    sharedGroups: shared.length,
    flaggedGroups: belowOrEqual.length,
    distribution: {
      minimum: roundScore(scores[0]),
      p10: roundScore(quantile(scores, 0.10)),
      p25: roundScore(quantile(scores, 0.25)),
      median: roundScore(quantile(scores, 0.50)),
      p75: roundScore(quantile(scores, 0.75)),
      p90: roundScore(quantile(scores, 0.90)),
      maximum: roundScore(scores.at(-1)),
      histogram: bins,
      thresholdNeighborhood: {
        greatestScoreAtOrBelow: roundScore(belowOrEqual.at(-1)),
        smallestScoreAbove: roundScore(above[0]),
        gapWidth: roundScore(above[0] - belowOrEqual.at(-1)),
      },
      largestAdjacentGaps: gaps.slice(0, 5).map((gap) => ({
        lower: roundScore(gap.lower),
        upper: roundScore(gap.upper),
        width: roundScore(gap.width),
      })),
    },
  };
}

function analyzeShared(options) {
  const source = buildTranslationGroups(options.learnerManifestPath, options.releaseAdjudicationsPath, options.crossReviewAdjudicationsPath);
  const summary = summarizeSharedHintRisk(source.groups);
  const report = {
    schemaVersion: 1,
    notHumanReview: true,
    sourceRunIdentitySha256: EXPECTED_RUN_IDENTITY,
    sourceContentSha256: EXPECTED_CONTENT_SHA256,
    summary,
    groups: source.groups.filter((group) => group.sharedHintRisk.applies).map((group) => ({
      groupId: group.groupId,
      terms: group.members.map((member) => member.term),
      ...group.sharedHintRisk,
    })),
  };
  writeFileAtomic(options.riskReportPath, canonicalJson(report));
  console.log(canonicalJson({ reportPath: options.riskReportPath, summary }));
}

function prepare(options) {
  const source = buildTranslationGroups(options.learnerManifestPath, options.releaseAdjudicationsPath, options.crossReviewAdjudicationsPath);
  const sourceHashes = {
    learnerManifestSha256: sha256File(options.learnerManifestPath),
    releaseAdjudicationsSha256: sha256File(options.releaseAdjudicationsPath),
    crossReviewAdjudicationsSha256: sha256File(options.crossReviewAdjudicationsPath),
  };
  const seedSha256 = sha256(`${EXPECTED_CONTENT_SHA256}\u0000${sourceHashes.releaseAdjudicationsSha256}\u0000${sourceHashes.crossReviewAdjudicationsSha256}`);
  const sample = selectPilotGroups(source.groups, seedSha256);
  assert(sample.selected.length === PILOT_GROUPS, 'Translation pilot sample size mismatch.');
  mkdirSync(options.outputDirectory, { recursive: true });
  const promptPath = resolve(options.outputDirectory, 'PROMPT.txt');
  const schemaPath = resolve(options.outputDirectory, 'output.schema.json');
  writeImmutable(promptPath, `${PROMPT}\n`);
  writeImmutable(schemaPath, canonicalJson(CODEX_OUTPUT_SCHEMA));
  const batches = [];
  for (let offset = 0; offset < sample.selected.length; offset += BATCH_SIZE) {
    const entries = sample.selected.slice(offset, offset + BATCH_SIZE);
    const batchNumber = batches.length + 1;
    const base = `pilot-${String(batchNumber).padStart(3, '0')}`;
    const inputPath = resolve(options.outputDirectory, `${base}.input.json`);
    const outputPath = resolve(options.outputDirectory, `${base}.output.json`);
    const checkpointPath = resolve(options.outputDirectory, `${base}.checkpoint.json`);
    const inputText = canonicalJson(entries);
    writeImmutable(inputPath, inputText);
    batches.push({
      batchNumber,
      groupCount: entries.length,
      entryCount: entries.reduce((sum, group) => sum + group.members.length, 0),
      groupIds: entries.map((group) => group.groupId),
      inputPath,
      inputSha256: sha256(inputText),
      outputPath,
      checkpointPath,
    });
  }
  const slovakPacketSha256 = sha256File(options.slovakPacketPath);
  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'prepared',
    courseId: 'es-sk',
    level: 'A1',
    sourceLearnerContent: {
      path: options.learnerManifestPath,
      runIdentitySha256: EXPECTED_RUN_IDENTITY,
      contentSha256: EXPECTED_CONTENT_SHA256,
      manifestSha256: sourceHashes.learnerManifestSha256,
      immutable: true,
    },
    adjudications: {
      release: { path: options.releaseAdjudicationsPath, sha256: sourceHashes.releaseAdjudicationsSha256 },
      aiCrossReview: { path: options.crossReviewAdjudicationsPath, sha256: sourceHashes.crossReviewAdjudicationsSha256 },
      overlayOnly: true,
      regeneratedSpanishEntries: 0,
    },
    population: {
      sourceEntries: 1707,
      excludedOrPendingEntries: 18,
      releaseEligibleEntries: EXPECTED_RELEASE_ENTRIES,
      groups: EXPECTED_GROUPS,
      sharedGroups: EXPECTED_SHARED_GROUPS,
      entriesInSharedGroups: EXPECTED_SHARED_ENTRIES,
    },
    grouping: {
      key: 'selected OMW sense ILI',
      behavior: 'One shared Slovak hint per ILI group, with exceptional member overrides when required for natural accuracy.',
    },
    pilot: {
      groupCount: PILOT_GROUPS,
      seedSha256,
      method: 'Proportional by singleton/shared plus part of speech; SHA-256 ranking within each stratum.',
      populations: sample.populations,
      allocation: sample.allocation,
      groupIds: sample.selected.map((group) => group.groupId),
    },
    projection: { fullPopulationTokens: FULL_PROJECTION_TOKENS, fullPopulationGroups: EXPECTED_GROUPS },
    model: MODEL,
    prompt: { path: promptPath, sha256: sha256(`${PROMPT}\n`) },
    outputSchema: { path: schemaPath, sha256: sha256(canonicalJson(CODEX_OUTPUT_SCHEMA)) },
    batchSize: BATCH_SIZE,
    batches,
    preservedSlovakPacket: { path: options.slovakPacketPath, sha256: slovakPacketSha256, modified: false },
  };
  manifest.runIdentitySha256 = sha256(canonicalJson({ ...manifest, status: undefined }));
  writeFileAtomic(resolve(options.outputDirectory, 'manifest.json'), canonicalJson(manifest));
  console.log(canonicalJson({ manifest: resolve(options.outputDirectory, 'manifest.json'), population: manifest.population, pilot: manifest.pilot }));
}

function validateOwnerAdjudications(owner, ownerPath) {
  assert(owner.schemaVersion === 1 && owner.notHumanReview === true && owner.status === 'in-progress', 'Owner-review adjudications must remain in progress until all 1,599 concepts have verdicts.');
  assert(owner.coverage.productionConcepts === 1599 && owner.coverage.verdictsRecorded === 35
    && owner.coverage.verdictsNotSupplied === 1564, 'Unexpected owner-review coverage.');
  assert(owner.coverage.acceptedWithoutChange === 33 && owner.coverage.memberOverrides === 1
    && owner.coverage.sharedHintReplacements === 1, 'Unexpected owner verdict counts.');
  assert(sha256File(resolve(owner.sourceReviewPacket.path)) === owner.sourceReviewPacket.sha256, 'Owner review packet hash changed.');
  const occasion = owner.entries.find((entry) => entry.groupId === 'es-sk:a1:i75105' && entry.term === 'ocasión');
  assert(occasion?.decision === 'memberOverride' && occasion.replacementSlovakHint === 'príležitosť', 'Missing approved ocasión override.');
  const expectedSharedHints = new Map([
    ['es-sk:a1:i20231', 'možno'],
    ['es-sk:a1:i25740', 'odpovedať'],
    ['es-sk:a1:i51496', 'auto'],
    ['es-sk:a1:i43203', 'vták'],
  ]);
  for (const [groupId, slovakHint] of expectedSharedHints) {
    const entry = owner.entries.find((candidate) => candidate.groupId === groupId);
    assert(entry?.decision === 'acceptedSharedHint' && entry.slovakHint === slovakHint, `${groupId}: approved shared hint is missing.`);
  }
  const livingRoom = owner.entries.find((entry) => entry.groupId === 'es-sk:a1:i55760');
  assert(livingRoom?.decision === 'sharedHintReplacement' && livingRoom.replacementSlovakHint === 'obývačka', 'Missing approved salón/sala shared-hint replacement.');
  return { path: ownerPath, sha256: sha256File(ownerPath) };
}

function prepareRemaining(options) {
  const source = buildTranslationGroups(options.learnerManifestPath, options.releaseAdjudicationsPath, options.crossReviewAdjudicationsPath);
  const pilotManifestPath = resolve(options.pilotDirectory, 'manifest.json');
  const pilotManifest = JSON.parse(readFileSync(pilotManifestPath, 'utf8'));
  assert(pilotManifest.pilot.groupIds.length === PILOT_GROUPS, 'Expected the completed 100-group pilot.');
  assert(existsSync(resolve(options.pilotDirectory, 'pilot-summary.json')), 'Pilot summary is missing.');
  const pilotIds = new Set(pilotManifest.pilot.groupIds);
  assert(pilotIds.size === PILOT_GROUPS, 'Pilot group IDs are not unique.');
  const owner = JSON.parse(readFileSync(options.ownerAdjudicationsPath, 'utf8'));
  const ownerSource = validateOwnerAdjudications(owner, options.ownerAdjudicationsPath);
  const remaining = source.groups.filter((group) => !pilotIds.has(group.groupId));
  assert(remaining.length === REMAINING_GROUPS, `Expected ${REMAINING_GROUPS} remaining groups; received ${remaining.length}.`);
  const sharedRisk = summarizeSharedHintRisk(source.groups);
  const remainingFlagged = remaining.filter((group) => group.sharedHintRisk.flagged).length;
  const pilotFlagged = source.groups.filter((group) => pilotIds.has(group.groupId) && group.sharedHintRisk.flagged).length;
  assert(sharedRisk.flaggedGroups === 34 && pilotFlagged === 3 && remainingFlagged === 31, 'Unexpected shared-risk partition.');

  mkdirSync(options.outputDirectory, { recursive: true });
  const promptPath = resolve(options.outputDirectory, 'PROMPT.txt');
  const schemaPath = resolve(options.outputDirectory, 'output.schema.json');
  writeImmutable(promptPath, `${PROMPT}\n`);
  writeImmutable(schemaPath, canonicalJson(CODEX_OUTPUT_SCHEMA));
  const batches = [];
  for (let offset = 0; offset < remaining.length; offset += BATCH_SIZE) {
    const entries = remaining.slice(offset, offset + BATCH_SIZE);
    const batchNumber = batches.length + 1;
    const base = `remaining-${String(batchNumber).padStart(3, '0')}`;
    const inputPath = resolve(options.outputDirectory, `${base}.input.json`);
    const outputPath = resolve(options.outputDirectory, `${base}.output.json`);
    const checkpointPath = resolve(options.outputDirectory, `${base}.checkpoint.json`);
    const inputText = canonicalJson(entries);
    writeImmutable(inputPath, inputText);
    batches.push({
      batchNumber,
      groupCount: entries.length,
      entryCount: entries.reduce((sum, group) => sum + group.members.length, 0),
      flaggedSharedGroups: entries.filter((group) => group.sharedHintRisk.flagged).length,
      groupIds: entries.map((group) => group.groupId),
      inputPath,
      inputSha256: sha256(inputText),
      outputPath,
      checkpointPath,
    });
  }
  assert(batches.length === 30, 'Expected 30 remaining-generation batches.');
  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'prepared',
    scope: 'remaining-after-100-group-pilot',
    courseId: 'es-sk',
    level: 'A1',
    sourceLearnerContent: {
      path: options.learnerManifestPath,
      runIdentitySha256: EXPECTED_RUN_IDENTITY,
      contentSha256: EXPECTED_CONTENT_SHA256,
      manifestSha256: sha256File(options.learnerManifestPath),
      immutable: true,
    },
    adjudications: {
      release: { path: options.releaseAdjudicationsPath, sha256: sha256File(options.releaseAdjudicationsPath) },
      aiCrossReview: { path: options.crossReviewAdjudicationsPath, sha256: sha256File(options.crossReviewAdjudicationsPath) },
      nativeSlovakOwner: ownerSource,
      overlayOnly: true,
    },
    population: {
      fullGroups: EXPECTED_GROUPS,
      pilotGroups: PILOT_GROUPS,
      remainingGroups: REMAINING_GROUPS,
      remainingEntries: remaining.reduce((sum, group) => sum + group.members.length, 0),
    },
    sharedHintGate: {
      ...sharedRisk,
      pilotFlaggedGroups: pilotFlagged,
      remainingFlaggedGroups: remainingFlagged,
      enforcement: 'Every flagged group must contain at least one explicit member override with rationale or needsReview=true with a non-empty review rationale.',
    },
    pilot: {
      manifestPath: pilotManifestPath,
      manifestSha256: sha256File(pilotManifestPath),
      usagePath: resolve(options.pilotDirectory, 'usage.json'),
    },
    projection: { cumulativeFullPopulationTokens: 876_160, fullPopulationGroups: EXPECTED_GROUPS },
    model: MODEL,
    prompt: { path: promptPath, sha256: sha256(`${PROMPT}\n`) },
    outputSchema: { path: schemaPath, sha256: sha256(canonicalJson(CODEX_OUTPUT_SCHEMA)) },
    batchSize: BATCH_SIZE,
    batches,
    preservedSlovakPacket: { path: options.slovakPacketPath, sha256: sha256File(options.slovakPacketPath), modified: false },
  };
  manifest.runIdentitySha256 = sha256(canonicalJson({ ...manifest, status: undefined }));
  writeFileAtomic(resolve(options.outputDirectory, 'manifest.json'), canonicalJson(manifest));
  console.log(canonicalJson({
    manifest: resolve(options.outputDirectory, 'manifest.json'),
    population: manifest.population,
    sharedHintGate: {
      thresholdInclusive: SHARED_DIVERGENCE_THRESHOLD,
      fullFlaggedGroups: sharedRisk.flaggedGroups,
      pilotFlaggedGroups: pilotFlagged,
      remainingFlaggedGroups: remainingFlagged,
    },
    batches: batches.length,
  }));
}

function validateHint(value, label) {
  assert(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 100, `${label}: Slovak hint must be 1-100 characters.`);
  assert(!/[\r\n\t]/u.test(value), `${label}: Slovak hint must be one line.`);
  assert(value.split(/\s+/u).length <= 12, `${label}: Slovak hint must contain at most 12 words.`);
}

export function validateOutput(input, output) {
  assert(Array.isArray(output) && output.length === input.length, 'Translation output length mismatch.');
  const confidence = new Set(['high', 'medium', 'low']);
  for (let index = 0; index < input.length; index += 1) {
    const expected = input[index];
    const actual = output[index];
    assert(actual?.groupId === expected.groupId, `${expected.groupId}: group ID/order mismatch.`);
    assert(actual.notHumanReview === true, `${expected.groupId}: notHumanReview must be true.`);
    validateHint(actual.slovakHint, expected.groupId);
    assert(Array.isArray(actual.memberOverrides), `${expected.groupId}: memberOverrides must be an array.`);
    const memberIds = new Set(expected.members.map((member) => member.entryId));
    const overrideIds = new Set();
    for (const override of actual.memberOverrides) {
      assert(memberIds.has(override.entryId) && !overrideIds.has(override.entryId), `${expected.groupId}: invalid or duplicate member override.`);
      overrideIds.add(override.entryId);
      validateHint(override.slovakHint, `${expected.groupId}/${override.entryId}`);
      assert(typeof override.rationale === 'string' && override.rationale.trim(), `${expected.groupId}/${override.entryId}: override rationale is required.`);
    }
    assert(confidence.has(actual.confidence), `${expected.groupId}: invalid confidence.`);
    assert(typeof actual.needsReview === 'boolean' && typeof actual.reviewNote === 'string', `${expected.groupId}: review fields are invalid.`);
    assert(actual.needsReview ? actual.reviewNote.trim().length > 0 : actual.reviewNote === '', `${expected.groupId}: reviewNote does not match needsReview.`);
    if (expected.sharedHintRisk?.flagged) {
      assert(actual.memberOverrides.length > 0 || actual.needsReview, `${expected.groupId}: divergence-flagged group requires a member override or needsReview rationale.`);
    }
  }
}

function usageFromEvents(stdout, batchNumber) {
  const events = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const completed = [...events].reverse().find((event) => event.type === 'turn.completed');
  assert(completed?.usage, `Batch ${batchNumber}: Codex did not report token usage.`);
  return {
    batchNumber,
    source: 'Codex turn.completed provider usage',
    inputTokens: completed.usage.input_tokens,
    cachedInputTokens: completed.usage.cached_input_tokens ?? 0,
    outputTokens: completed.usage.output_tokens,
    totalTokens: completed.usage.input_tokens + completed.usage.output_tokens,
  };
}

function writeUsage(path, batches) {
  const ordered = [...batches].sort((left, right) => left.batchNumber - right.batchNumber);
  const totals = ordered.reduce((sum, batch) => ({
    inputTokens: sum.inputTokens + batch.inputTokens,
    cachedInputTokens: sum.cachedInputTokens + batch.cachedInputTokens,
    outputTokens: sum.outputTokens + batch.outputTokens,
    totalTokens: sum.totalTokens + batch.totalTokens,
  }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 });
  writeFileAtomic(path, canonicalJson({ schemaVersion: 1, notHumanReview: true, batches: ordered, totals }));
}

function generate(options) {
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert(manifest.notHumanReview === true && manifest.sourceLearnerContent.runIdentitySha256 === EXPECTED_RUN_IDENTITY, 'Invalid translation-pilot manifest.');
  assert(sha256File(manifest.preservedSlovakPacket.path) === manifest.preservedSlovakPacket.sha256, 'Slovak review packet changed.');
  const usagePath = resolve(options.outputDirectory, 'usage.json');
  const usageByBatch = new Map();
  if (existsSync(usagePath)) for (const item of JSON.parse(readFileSync(usagePath, 'utf8')).batches ?? []) usageByBatch.set(item.batchNumber, item);
  const prompt = readFileSync(manifest.prompt.path, 'utf8');
  for (const batch of manifest.batches) {
    if (existsSync(batch.checkpointPath) && existsSync(batch.outputPath)) {
      const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, 'utf8'));
      if (checkpoint.status === 'valid' && checkpoint.inputSha256 === batch.inputSha256 && checkpoint.outputSha256 === sha256File(batch.outputPath)) {
        console.log(`Batch ${batch.batchNumber}: valid checkpoint, skipped.`);
        continue;
      }
    }
    const inputText = readFileSync(batch.inputPath, 'utf8');
    assert(sha256(inputText) === batch.inputSha256, `Batch ${batch.batchNumber}: input hash mismatch.`);
    const temporaryOutput = `${batch.outputPath}.tmp-${process.pid}-${randomUUID()}`;
    const task = `${prompt}\nProcess this complete batch in order.\nBATCH INPUT:\n${inputText}`;
    console.log(`Batch ${batch.batchNumber}: generating ${batch.groupCount} grouped Slovak hints...`);
    const execution = spawnSync(CODEX_BINARY, [
      'exec', '-', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
      '--sandbox', 'read-only', '--model', manifest.model.id,
      '--config', `model_reasoning_effort="${manifest.model.reasoningEffort}"`, '--json',
      '--output-schema', manifest.outputSchema.path, '--output-last-message', temporaryOutput,
      '-C', '/private/tmp',
    ], { input: task, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    try {
      if (execution.status !== 0) throw new Error(`Batch ${batch.batchNumber}: Codex failed (${execution.status}).\n${execution.stderr}\n${execution.stdout}`);
      const providerOutput = JSON.parse(readFileSync(temporaryOutput, 'utf8'));
      const input = JSON.parse(inputText);
      validateOutput(input, providerOutput.entries);
      const outputText = canonicalJson(providerOutput.entries);
      writeFileAtomic(batch.outputPath, outputText);
      const usage = usageFromEvents(execution.stdout, batch.batchNumber);
      usageByBatch.set(batch.batchNumber, usage);
      writeUsage(usagePath, usageByBatch.values());
      writeFileAtomic(batch.checkpointPath, canonicalJson({
        schemaVersion: 1,
        notHumanReview: true,
        status: 'valid',
        runIdentitySha256: manifest.runIdentitySha256,
        batchNumber: batch.batchNumber,
        inputSha256: batch.inputSha256,
        outputSha256: sha256(outputText),
        model: manifest.model,
        usage,
      }));
      console.log(`Batch ${batch.batchNumber}: valid.`);
    } finally {
      if (existsSync(temporaryOutput)) unlinkSync(temporaryOutput);
    }
  }
}

function tsvCell(value) {
  const normalized = String(value).replace(/[\r\n\t]+/gu, ' ').trim();
  return /["\t\n]/u.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

function prepareOwnerReview(manifest, records, outputDirectory) {
  const seed = sha256(`${manifest.runIdentitySha256}\u0000native-slovak-owner-review-v1`);
  const sample = selectPilotGroups(records.map(({ input }) => input), seed, REVIEW_GROUPS, 'native-slovak-owner-review-v1');
  const outputById = new Map(records.map(({ input, output }) => [input.groupId, { input, output }]));
  const rows = [['Spanish term', 'POS', 'Spanish definition', 'Proposed Slovak hint']];
  for (const group of sample.selected) {
    const { input, output } = outputById.get(group.groupId);
    const terms = input.members.map((member) => member.term).join(' / ');
    const definitions = [...new Set(input.members.map((member) => member.definition))].join(' | ');
    const overrides = new Map(output.memberOverrides.map((override) => [override.entryId, override.slovakHint]));
    const hint = overrides.size === 0
      ? output.slovakHint
      : `${output.slovakHint}; ${input.members.filter((member) => overrides.has(member.entryId)).map((member) => `${member.term} → ${overrides.get(member.entryId)}`).join('; ')}`;
    rows.push([terms, input.partOfSpeech, definitions, hint]);
  }
  const tsv = `${rows.map((row) => row.map(tsvCell).join('\t')).join('\n')}\n`;
  const packetPath = resolve(outputDirectory, 'owner-review-30-groups.tsv');
  writeFileAtomic(packetPath, tsv);
  const reviewManifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'awaiting-native-slovak-owner-review',
    reviewerRole: 'native-Slovak-speaking owner',
    sourceRunIdentitySha256: manifest.runIdentitySha256,
    selection: {
      size: REVIEW_GROUPS,
      seedSha256: seed,
      method: 'Proportional by singleton/shared plus part of speech; SHA-256 ranking within each stratum.',
      populations: sample.populations,
      allocation: sample.allocation,
      groupIds: sample.selected.map((group) => group.groupId),
    },
    packet: { path: packetPath, sha256: sha256(tsv), format: 'TSV; one row per group after the header.' },
    completionRule: 'notHumanReview remains true until the owner returns completed judgments; no remaining A1 translation groups may be generated before then.',
  };
  writeFileAtomic(resolve(outputDirectory, 'owner-review-manifest.json'), canonicalJson(reviewManifest));
  return { packetPath, reviewManifest };
}

function analyze(options) {
  const manifest = JSON.parse(readFileSync(resolve(options.outputDirectory, 'manifest.json'), 'utf8'));
  assert(sha256File(manifest.preservedSlovakPacket.path) === manifest.preservedSlovakPacket.sha256, 'Slovak review packet changed.');
  const records = [];
  for (const batch of manifest.batches) {
    assert(existsSync(batch.outputPath), `Missing translation output for batch ${batch.batchNumber}.`);
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    validateOutput(input, output);
    for (let index = 0; index < input.length; index += 1) records.push({ input: input[index], output: output[index] });
  }
  assert(records.length === PILOT_GROUPS, 'Expected 100 complete pilot groups.');
  const usage = JSON.parse(readFileSync(resolve(options.outputDirectory, 'usage.json'), 'utf8')).totals;
  const measuredPerGroup = usage.totalTokens / records.length;
  const summary = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'complete-awaiting-owner-review',
    translationRunIdentitySha256: manifest.runIdentitySha256,
    result: {
      groups: records.length,
      entries: records.reduce((sum, record) => sum + record.input.members.length, 0),
      sharedGroups: records.filter((record) => record.input.members.length > 1).length,
      memberOverrides: records.reduce((sum, record) => sum + record.output.memberOverrides.length, 0),
      needsReview: records.filter((record) => record.output.needsReview).length,
    },
    usage,
    projectionComparison: {
      approvedFullProjectionTokens: FULL_PROJECTION_TOKENS,
      fullPopulationGroups: EXPECTED_GROUPS,
      measuredTokensPerPilotGroup: measuredPerGroup,
      measuredLinearProjectionTokens: Math.round(measuredPerGroup * EXPECTED_GROUPS),
      measuredToApprovedProjectionRatio: (measuredPerGroup * EXPECTED_GROUPS) / FULL_PROJECTION_TOKENS,
    },
    gate: 'Stop after preparing the 30-group owner packet. Do not generate the remaining A1 groups until native-Slovak owner judgments are returned.',
  };
  const summaryPath = resolve(options.outputDirectory, 'pilot-summary.json');
  writeFileAtomic(summaryPath, canonicalJson(summary));
  const ownerReview = prepareOwnerReview(manifest, records, options.outputDirectory);
  manifest.status = 'complete-awaiting-owner-review';
  writeFileAtomic(resolve(options.outputDirectory, 'manifest.json'), canonicalJson(manifest));
  console.log(canonicalJson({ summaryPath, ownerReviewPacketPath: ownerReview.packetPath, summary }));
}

function readCompletedRecords(manifest) {
  const records = [];
  for (const batch of manifest.batches) {
    assert(existsSync(batch.outputPath), `Missing translation output for batch ${batch.batchNumber}.`);
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    validateOutput(input, output);
    for (let index = 0; index < input.length; index += 1) records.push({ input: input[index], output: output[index] });
  }
  return records;
}

function addUsage(left, right) {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function analyzeRemaining(options) {
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert(manifest.scope === 'remaining-after-100-group-pilot' && manifest.batches.length === 30, 'Invalid remaining-generation manifest.');
  assert(sha256File(manifest.preservedSlovakPacket.path) === manifest.preservedSlovakPacket.sha256, 'Slovak review packet changed.');
  const owner = JSON.parse(readFileSync(manifest.adjudications.nativeSlovakOwner.path, 'utf8'));
  validateOwnerAdjudications(owner, manifest.adjudications.nativeSlovakOwner.path);
  const ownerSha256 = sha256File(manifest.adjudications.nativeSlovakOwner.path);
  assert(ownerSha256 === manifest.adjudications.nativeSlovakOwner.sha256
    || owner.supersedesSha256 === manifest.adjudications.nativeSlovakOwner.sha256,
  'Owner adjudications changed non-additively after preparation.');

  const remainingRecords = readCompletedRecords(manifest);
  assert(remainingRecords.length === REMAINING_GROUPS, `Expected ${REMAINING_GROUPS} completed remaining groups.`);
  const remainingUsage = JSON.parse(readFileSync(resolve(options.outputDirectory, 'usage.json'), 'utf8')).totals;
  const pilotManifest = JSON.parse(readFileSync(manifest.pilot.manifestPath, 'utf8'));
  const pilotRecords = readCompletedRecords(pilotManifest);
  assert(pilotRecords.length === PILOT_GROUPS, 'Expected 100 completed pilot groups.');
  const pilotUsage = JSON.parse(readFileSync(manifest.pilot.usagePath, 'utf8')).totals;
  const cumulativeUsage = addUsage(pilotUsage, remainingUsage);

  const source = buildTranslationGroups(options.learnerManifestPath, options.releaseAdjudicationsPath, options.crossReviewAdjudicationsPath);
  const currentGroupById = new Map(source.groups.map((group) => [group.groupId, group]));
  const allRecords = [...pilotRecords, ...remainingRecords];
  assert(new Set(allRecords.map((record) => record.input.groupId)).size === EXPECTED_GROUPS, 'Combined group IDs are incomplete or duplicated.');
  assert(allRecords.reduce((sum, record) => sum + record.input.members.length, 0) === EXPECTED_RELEASE_ENTRIES, 'Combined entry count changed.');
  const ownerDecisionByGroup = new Map(owner.entries.map((entry) => [entry.groupId, entry]));
  const flagged = allRecords.filter((record) => currentGroupById.get(record.input.groupId)?.sharedHintRisk.flagged);
  assert(flagged.length === 34, 'Expected 34 divergence-flagged groups in the full population.');
  const flaggedOutcomes = flagged.map((record) => {
    const ownerDecision = ownerDecisionByGroup.get(record.input.groupId);
    const ownerResolved = Boolean(ownerDecision);
    const hasOverride = record.output.memberOverrides.length > 0
      || ownerDecision?.decision === 'memberOverride'
      || ownerDecision?.decision === 'sharedHintReplacement';
    assert(hasOverride || record.output.needsReview || ownerResolved, `${record.input.groupId}: flagged group lacks an override, owner verdict, or needsReview rationale.`);
    return { ...record, hasOverride, ownerResolved, ownerDecision };
  });
  const needsReview = flaggedOutcomes.filter((record) => record.output.needsReview && !record.ownerResolved);
  const overrideResolution = flaggedOutcomes.filter((record) => !needsReview.includes(record) && record.hasOverride);
  const ownerAcceptedSharedHint = flaggedOutcomes.filter((record) => !record.hasOverride && record.ownerDecision?.decision === 'acceptedSharedHint');
  const pilotGroupIds = new Set(pilotManifest.pilot.groupIds);
  const remainingFlagged = flaggedOutcomes.filter((record) => !pilotGroupIds.has(record.input.groupId));
  const remainingNeedsReview = remainingFlagged.filter((record) => record.output.needsReview && !record.ownerResolved);
  const remainingOverrideResolution = remainingFlagged.filter((record) => !remainingNeedsReview.includes(record) && record.hasOverride);
  const remainingOwnerAcceptedSharedHint = remainingFlagged.filter((record) => !record.hasOverride && record.ownerDecision?.decision === 'acceptedSharedHint');
  const fullProjection = manifest.projection.cumulativeFullPopulationTokens;
  const summary = {
    schemaVersion: 1,
    notHumanReview: true,
    status: needsReview.length > 0 ? 'complete-with-needs-review' : 'complete',
    scope: 'A1 Slovak translation generation only; A2-C1 not started.',
    runIdentitySha256: manifest.runIdentitySha256,
    population: {
      groups: EXPECTED_GROUPS,
      entries: EXPECTED_RELEASE_ENTRIES,
      pilotGroups: PILOT_GROUPS,
      newlyGeneratedGroups: REMAINING_GROUPS,
      batches: manifest.batches.length,
    },
    sharedHintGate: {
      thresholdInclusive: SHARED_DIVERGENCE_THRESHOLD,
      flaggedGroups: flagged.length,
      overrideResolution: overrideResolution.length,
      ownerAcceptedSharedHint: ownerAcceptedSharedHint.length,
      needsReview: needsReview.length,
      groupsWithAnyOverride: flaggedOutcomes.filter((record) => record.hasOverride).length,
      remainingGeneration: {
        flaggedGroups: remainingFlagged.length,
        overrideResolution: remainingOverrideResolution.length,
        ownerAcceptedSharedHint: remainingOwnerAcceptedSharedHint.length,
        needsReview: remainingNeedsReview.length,
      },
    },
    usage: {
      pilot: pilotUsage,
      remaining: remainingUsage,
      cumulative: cumulativeUsage,
      projectionTokens: fullProjection,
      differenceTokens: cumulativeUsage.totalTokens - fullProjection,
      ratioToProjection: cumulativeUsage.totalTokens / fullProjection,
    },
    gate: 'Stop before A2-C1.',
  };
  const summaryPath = resolve(options.outputDirectory, 'cumulative-summary.json');
  writeFileAtomic(summaryPath, canonicalJson(summary));
  manifest.status = summary.status;
  manifest.cumulativeSummary = { path: summaryPath, sha256: sha256(canonicalJson(summary)) };
  writeFileAtomic(manifestPath, canonicalJson(manifest));
  console.log(canonicalJson({ summaryPath, summary }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'prepare') prepare(options);
    else if (options.command === 'generate') generate(options);
    else if (options.command === 'analyze') analyze(options);
    else if (options.command === 'analyze-shared') analyzeShared(options);
    else if (options.command === 'prepare-remaining') prepareRemaining(options);
    else analyzeRemaining(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
