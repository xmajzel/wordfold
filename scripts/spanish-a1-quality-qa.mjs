import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBatch as validateLearnerBatch } from './validate-spanish-a1-learner-content.mjs';

const DESKTOP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';
const CODEX_BINARY = process.env.WORDFOLD_CODEX_BINARY || (existsSync(DESKTOP_CODEX) ? DESKTOP_CODEX : 'codex');
const EXPECTED_RUN_IDENTITY = '2cbb9d66a85503dcbf7f0dae04ab6fcd95f5ac53c893f3eaca69ea7091d1a483';
const EXPECTED_CONTENT_SHA256 = '5383a7a98cd218c707c850bdf88f20b943522c0782f4389418acc6cb304f3f1a';
const EXPECTED_POPULATION = Object.freeze({ 'spanish-gloss': 353, 'english-bridge-only': 1354 });
const EXTERNAL_SAMPLE_SIZE = 300;
const EXTERNAL_ALLOCATION = Object.freeze({ 'spanish-gloss': 62, 'english-bridge-only': 238 });
const AI_SAMPLE_SIZE = 200;
const BATCH_SIZE = 50;
const MODEL = Object.freeze({ id: 'gpt-6-astra', reasoningEffort: 'medium' });
const Z_95 = 1.959963984540054;
const LEVEL_CONFIG = Object.freeze({
  A1: Object.freeze({
    entryCount: 1707,
    expectedRunIdentity: EXPECTED_RUN_IDENTITY,
    expectedContentSha256: EXPECTED_CONTENT_SHA256,
    expectedPopulation: EXPECTED_POPULATION,
  }),
  A2: Object.freeze({
    entryCount: 1847,
    expectedRunIdentity: null,
    expectedContentSha256: null,
    expectedPopulation: null,
  }),
  B1: Object.freeze({
    entryCount: 1315,
    expectedRunIdentity: null,
    expectedContentSha256: null,
    expectedPopulation: null,
  }),
  B2: Object.freeze({
    entryCount: 763,
    expectedRunIdentity: null,
    expectedContentSha256: null,
    expectedPopulation: null,
  }),
  C1: Object.freeze({
    entryCount: 555,
    expectedRunIdentity: null,
    expectedContentSha256: null,
    expectedPopulation: null,
  }),
});

const CONTROL_EXPECTATIONS = Object.freeze({
  'es-cefr:82bef650b2aef35e': 'non-correspondence',
  'es-cefr:312b8f975937d90b': 'non-correspondence',
  'es-cefr:f4f75dae96dffdbb': 'non-correspondence',
  'es-cefr:2a31ff67e0562122': 'corresponds',
});

const EXTERNAL_PROMPT = `You are performing automated Spanish lexical QA for Wordfold against a supplied Spanish Wiktionary reference extracted by Wiktextract.

For every item, decide only whether the Wordfold learner definition expresses at least one listed reference sense for the same Spanish term and compatible part of speech. The example may disambiguate the definition, but do not judge whether the sense is frequent, preferred, pedagogically useful, or appropriate for A1. A valid rare or high-ranked sense still corresponds. Wiktionary sense order is editorial, not a frequency ranking.

Use correspondence="corresponds" only when the definition clearly matches a supplied reference sense at comparable semantic specificity. Do not let a broad compositional hypernym validate an unlisted conventional occupation, object, event, or other narrower dictionary sense; for example, a generic sense equivalent to "one who cares" does not by itself list an exam invigilator sense. Use correspondence="non-correspondence" when reference senses are supplied but none express the definition. Use correspondence="uncertain" when the reference is missing, incomplete, or genuinely insufficient. For a correspondence, return every matching sourceSenseIndex and posRank. Otherwise return empty arrays. Write a short original rationale without quoting the reference glosses. Copy entryId exactly and preserve input order. Return only the requested JSON object.`;

function aiPrompt(level) {
  return `You are a blinded AI cross-reviewer of Spanish ${level} learner content for Wordfold.

Review every supplied item independently using your Spanish-language knowledge. You are not a human or native-speaker reviewer. You receive no source glosses, generation confidence, model flags, evidence stratum, or adjudications.

Mark senseVerdict="wrong" only when the definition/example teaches a meaning that the supplied Spanish term and part of speech do not express in contemporary Spanish. Mark definitionVerdict="material-error" only when the definition is false, misleading, circular, or materially unnatural. Mark exampleVerdict="material-error" only when the example is false, meaning-mismatched, or materially unnatural. Mark levelVerdict="wrong" when the selected sense and usage are unsuitable as ${level} learner content, even if another sense is ${level}. Use "uncertain" only when you genuinely cannot decide. Copy entryId exactly and preserve input order. Write a concise original rationale. Return only the requested JSON object.`;
}

const EXTERNAL_ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['entryId', 'correspondence', 'matchedSenseIndexes', 'matchedPosRanks', 'rationale'],
  properties: {
    entryId: { type: 'string' },
    correspondence: { enum: ['corresponds', 'non-correspondence', 'uncertain'] },
    matchedSenseIndexes: { type: 'array', items: { type: 'string' } },
    matchedPosRanks: { type: 'array', items: { type: 'integer', minimum: 1 } },
    rationale: { type: 'string' },
  },
});

const AI_ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'entryId', 'senseVerdict', 'definitionVerdict', 'exampleVerdict',
    'levelVerdict', 'confidence', 'rationale',
  ],
  properties: {
    entryId: { type: 'string' },
    senseVerdict: { enum: ['correct', 'wrong', 'uncertain'] },
    definitionVerdict: { enum: ['correct', 'material-error', 'uncertain'] },
    exampleVerdict: { enum: ['correct', 'material-error', 'uncertain'] },
    levelVerdict: { enum: ['appropriate', 'wrong', 'uncertain'] },
    confidence: { enum: ['high', 'medium', 'low'] },
    rationale: { type: 'string' },
  },
});

function outputSchema(title, itemSchema) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title,
    type: 'object',
    additionalProperties: false,
    required: ['entries'],
    properties: { entries: { type: 'array', items: itemSchema } },
  };
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
    if (!readFileSync(path).equals(Buffer.from(value))) throw new Error(`Immutable QA artifact changed: ${path}`);
    return;
  }
  writeFileAtomic(path, value);
}

function normalizeSpanish(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  const command = argv[0];
  const options = {
    command,
    level: 'A1',
    learnerManifestPath: null,
    sampleManifestPath: null,
    spanishPacketPath: null,
    targetManifestPath: null,
    contentCorrectionsPath: null,
    wiktextractPath: resolve('.artifacts/spanish-a1-quality-qa/reference/es-extract.jsonl.gz'),
    outputDirectory: null,
    referenceUrl: 'https://kaikki.org/dictionary/downloads/es/es-extract.jsonl.gz',
    dumpDate: '2026-09-01',
    extractedAt: '2026-09-05',
    wiktextractRevision: 'ccec6f1',
    wikitextprocessorRevision: '4deed51',
    group: 'all',
    fromBatch: 1,
    toBatch: Number.POSITIVE_INFINITY,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--level') options.level = argv[++index].toUpperCase();
    else if (argument === '--learner-manifest') options.learnerManifestPath = resolve(argv[++index]);
    else if (argument === '--sample-manifest') options.sampleManifestPath = resolve(argv[++index]);
    else if (argument === '--spanish-packet') options.spanishPacketPath = resolve(argv[++index]);
    else if (argument === '--target-manifest') options.targetManifestPath = resolve(argv[++index]);
    else if (argument === '--content-corrections') options.contentCorrectionsPath = resolve(argv[++index]);
    else if (argument === '--wiktextract') options.wiktextractPath = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else if (argument === '--reference-url') options.referenceUrl = argv[++index];
    else if (argument === '--dump-date') options.dumpDate = argv[++index];
    else if (argument === '--extracted-at') options.extractedAt = argv[++index];
    else if (argument === '--wiktextract-revision') options.wiktextractRevision = argv[++index];
    else if (argument === '--wikitextprocessor-revision') options.wikitextprocessorRevision = argv[++index];
    else if (argument === '--group') options.group = argv[++index];
    else if (argument === '--from') options.fromBatch = Number(argv[++index]);
    else if (argument === '--to') options.toBatch = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  assert(['prepare', 'generate', 'analyze'].includes(command), 'Usage: spanish-a1-quality-qa.mjs prepare|generate|analyze [options]');
  assert(LEVEL_CONFIG[options.level], '--level must be A1, A2, B1, B2, or C1.');
  assert(['all', 'external', 'ai'].includes(options.group), '--group must be all, external, or ai.');
  assert(Number.isInteger(options.fromBatch) && options.fromBatch >= 1, '--from must be a positive integer.');
  assert(options.toBatch === Number.POSITIVE_INFINITY || (Number.isInteger(options.toBatch) && options.toBatch >= options.fromBatch), '--to must be >= --from.');
  const levelSlug = options.level.toLowerCase();
  options.learnerManifestPath ??= resolve(`.artifacts/spanish-${levelSlug}-learner-content/full/manifest.json`);
  options.sampleManifestPath ??= resolve(`.artifacts/spanish-${levelSlug}-human-review/sample-manifest.json`);
  options.spanishPacketPath ??= resolve(`.artifacts/spanish-${levelSlug}-human-review/${options.level === 'A1' ? 'spanish-review-packet.json' : 'ai-cross-review-packet.json'}`);
  options.outputDirectory ??= resolve(`.artifacts/spanish-${levelSlug}-quality-qa`);
  return options;
}

function loadFinishedContent(manifestPath, level = 'A1') {
  const config = LEVEL_CONFIG[level];
  assert(config, `Unsupported level: ${level}.`);
  const manifestText = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestText);
  const expectedMode = config.entryCount === null ? 'pilot' : 'full';
  assert(manifest.mode === expectedMode && manifest.level === level
      && (config.entryCount === null || manifest.entryCount === config.entryCount),
    `QA requires a finished immutable ${level} ${expectedMode} run.`);
  if (config.expectedRunIdentity) assert(manifest.runIdentitySha256 === config.expectedRunIdentity, `Unexpected ${level} learner level learner-content run identity.`);
  const entries = [];
  for (const batch of manifest.batches) {
    const inputText = readFileSync(batch.inputPath);
    const outputText = readFileSync(batch.outputPath);
    assert(sha256(inputText) === batch.inputSha256, `Batch ${batch.batchNumber} input hash mismatch.`);
    const input = JSON.parse(inputText);
    const output = JSON.parse(outputText);
    validateLearnerBatch(input, output);
    for (let index = 0; index < input.length; index += 1) {
      const generated = output[index];
      const selectedSense = input[index].candidateSenses.find((sense) => sense.senseId === generated.meaningReferenceSenseId);
      assert(selectedSense, `${generated.entryId}: selected sense is absent from generation input.`);
      const hasSpanishGloss = typeof selectedSense.spanishDefinition === 'string' && selectedSense.spanishDefinition.trim().length > 0;
      entries.push({
        ...generated,
        evidenceStratum: hasSpanishGloss ? 'spanish-gloss' : 'english-bridge-only',
      });
    }
  }
  const expectedEntryCount = config.entryCount ?? manifest.entryCount;
  assert(entries.length === expectedEntryCount && new Set(entries.map((entry) => entry.entryId)).size === expectedEntryCount,
    `Finished ${level} content is incomplete or duplicated.`);
  const contentForHash = entries.map(({ evidenceStratum: _stratum, ...entry }) => entry);
  const contentSha256 = sha256(canonicalJson(contentForHash));
  if (config.expectedContentSha256) assert(contentSha256 === config.expectedContentSha256, `Finished ${level} learner-content hash changed.`);
  const populations = Object.fromEntries(['spanish-gloss', 'english-bridge-only'].map((stratum) => [
    stratum,
    entries.filter((entry) => entry.evidenceStratum === stratum).length,
  ]));
  if (config.expectedPopulation) assert(JSON.stringify(populations) === JSON.stringify(config.expectedPopulation), `Unexpected evidence strata: ${JSON.stringify(populations)}.`);
  return { manifest, entries, contentSha256, populations };
}

export function selectExternalSample(entries, contentSha256) {
  const selected = [];
  for (const [stratum, count] of Object.entries(EXTERNAL_ALLOCATION)) {
    const ranked = entries
      .filter((entry) => entry.evidenceStratum === stratum)
      .sort((left, right) => {
        const leftHash = sha256(`${contentSha256}\u0000wiktextract-qa-v1\u0000${stratum}\u0000${left.entryId}`);
        const rightHash = sha256(`${contentSha256}\u0000wiktextract-qa-v1\u0000${stratum}\u0000${right.entryId}`);
        return leftHash.localeCompare(rightHash) || left.entryId.localeCompare(right.entryId);
      });
    selected.push(...ranked.slice(0, count));
  }
  return selected.sort((left, right) => left.entryId.localeCompare(right.entryId));
}

function mappedPartOfSpeech(entryPos) {
  return ({ noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb' })[entryPos] ?? entryPos;
}

function compatiblePartsOfSpeech(entryPos, sense) {
  const parts = new Set([mappedPartOfSpeech(entryPos)]);
  const tags = new Set(sense.tags ?? []);
  for (const part of ['noun', 'adjective', 'adverb', 'verb']) {
    if (tags.has(part)) parts.add(part);
  }
  return [...parts];
}

function isLemmaSense(sense) {
  const tags = new Set(sense.tags ?? []);
  return !sense.form_of && !sense.alt_of && !tags.has('form-of') && !tags.has('alt-of') && !tags.has('no-gloss');
}

async function extractReference(path, targetTerms) {
  assert(existsSync(path), `Missing Wiktextract archive: ${path}`);
  const byTerm = new Map();
  const stream = createReadStream(path).pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let sourceOrdinal = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.lang_code !== 'es' || typeof entry.word !== 'string') continue;
    const normalizedTerm = normalizeSpanish(entry.word);
    if (!targetTerms.has(normalizedTerm)) continue;
    for (const sense of entry.senses ?? []) {
      if (!isLemmaSense(sense) || !Array.isArray(sense.glosses) || sense.glosses.length === 0) continue;
      sourceOrdinal += 1;
      const sourceSenseIndex = typeof sense.sense_index === 'string' && sense.sense_index.trim()
        ? sense.sense_index.trim()
        : `ordinal-${sourceOrdinal}`;
      const compact = {
        sourceSenseIndex,
        sourcePartOfSpeech: entry.pos ?? 'unknown',
        effectivePartOfSpeech: mappedPartOfSpeech(entry.pos),
        compatiblePartsOfSpeech: compatiblePartsOfSpeech(entry.pos, sense),
        glosses: sense.glosses,
        tags: sense.tags ?? [],
        rawTags: sense.raw_tags ?? [],
        topics: sense.topics ?? [],
        sourceOrdinal,
      };
      const senses = byTerm.get(normalizedTerm) ?? [];
      senses.push(compact);
      byTerm.set(normalizedTerm, senses);
    }
  }
  return byTerm;
}

function referenceForEntry(entry, byTerm) {
  const all = byTerm.get(normalizeSpanish(entry.term)) ?? [];
  let compatible = all.filter((sense) => sense.compatiblePartsOfSpeech.includes(entry.partOfSpeech));
  let posMatchMethod = 'exact-or-sense-tag';
  if (compatible.length === 0) {
    compatible = all.filter((sense) => sense.sourcePartOfSpeech === 'phrase');
    posMatchMethod = compatible.length > 0 ? 'phrase-fallback' : 'none';
  }
  return {
    posMatchMethod,
    referenceSenses: compatible.map((sense, index) => ({
      sourceSenseIndex: sense.sourceSenseIndex,
      posRank: index + 1,
      sourcePartOfSpeech: sense.sourcePartOfSpeech,
      effectivePartOfSpeech: sense.effectivePartOfSpeech,
      compatiblePartsOfSpeech: sense.compatiblePartsOfSpeech,
      glosses: sense.glosses,
      tags: sense.tags,
      rawTags: sense.rawTags,
      topics: sense.topics,
    })),
  };
}

function externalInput(entry, byTerm) {
  return {
    entryId: entry.entryId,
    term: entry.term,
    partOfSpeech: entry.partOfSpeech,
    definition: entry.definition,
    example: entry.example,
    ...referenceForEntry(entry, byTerm),
  };
}

function prepareBatches(directory, prefix, inputs, prompt, schema, model) {
  mkdirSync(directory, { recursive: true });
  const promptPath = resolve(directory, 'PROMPT.txt');
  const schemaPath = resolve(directory, 'output.schema.json');
  writeImmutable(promptPath, `${prompt}\n`);
  writeImmutable(schemaPath, canonicalJson(schema));
  const batches = [];
  for (let offset = 0; offset < inputs.length; offset += BATCH_SIZE) {
    const entries = inputs.slice(offset, offset + BATCH_SIZE);
    const batchNumber = batches.length + 1;
    const base = `${prefix}-${String(batchNumber).padStart(3, '0')}`;
    const inputPath = resolve(directory, `${base}.input.json`);
    const outputPath = resolve(directory, `${base}.output.json`);
    const checkpointPath = resolve(directory, `${base}.checkpoint.json`);
    const inputText = canonicalJson(entries);
    writeImmutable(inputPath, inputText);
    batches.push({
      batchNumber,
      entryCount: entries.length,
      entryIds: entries.map((entry) => entry.entryId),
      inputPath,
      inputSha256: sha256(inputText),
      outputPath,
      checkpointPath,
    });
  }
  return {
    notHumanReview: true,
    model,
    prompt: { path: promptPath, sha256: sha256(`${prompt}\n`) },
    outputSchema: { path: schemaPath, sha256: sha256(canonicalJson(schema)) },
    batchSize: BATCH_SIZE,
    batches,
  };
}

async function prepare(options) {
  const loaded = loadFinishedContent(options.learnerManifestPath, options.level);
  const { manifest: learnerManifest, populations } = loaded;
  let entries = loaded.entries;
  let contentSha256 = loaded.contentSha256;
  let corrections = null;
  if (options.contentCorrectionsPath) {
    corrections = JSON.parse(readFileSync(options.contentCorrectionsPath, 'utf8'));
    assert(corrections.notHumanReview === true && corrections.level === options.level, 'Content corrections must be marked notHumanReview and match the level.');
    const correctionById = new Map(corrections.entries.map((entry) => [entry.entryId, entry]));
    assert(correctionById.size === corrections.entries.length, 'Content corrections contain duplicate entry IDs.');
    let applied = 0;
    entries = entries.map((entry) => {
      const correction = correctionById.get(entry.entryId);
      if (!correction) return entry;
      applied += 1;
      return {
        ...entry,
        definition: correction.replacementDefinition ?? entry.definition,
        example: correction.replacementExample ?? entry.example,
      };
    });
    assert(applied === correctionById.size, 'Content corrections contain entry IDs absent from the learner run.');
    contentSha256 = sha256(canonicalJson(entries.map(({ evidenceStratum: _stratum, ...entry }) => entry)));
  }
  const targetManifest = options.targetManifestPath ? JSON.parse(readFileSync(options.targetManifestPath, 'utf8')) : null;
  const targetById = new Map((targetManifest?.entries ?? []).map((entry) => [entry.entryId, entry]));
  const selected = targetManifest
    ? entries.filter((entry) => targetById.has(entry.entryId))
    : selectExternalSample(entries, contentSha256);
  if (targetManifest) {
    assert(targetManifest.notHumanReview === true && targetManifest.level === options.level,
      'Targeted QA manifest must be marked notHumanReview and match the requested level.');
    assert(selected.length === targetById.size && selected.length > 0, 'Targeted QA manifest contains missing or duplicate entries.');
  } else {
    assert(options.level === 'A1' && selected.length === EXTERNAL_SAMPLE_SIZE, 'A probability external sample is currently frozen only for A1.');
  }
  const selectedCounts = Object.fromEntries(['spanish-gloss', 'english-bridge-only'].map((stratum) => [
    stratum,
    selected.filter((entry) => entry.evidenceStratum === stratum).length,
  ]));
  if (!targetManifest) assert(JSON.stringify(selectedCounts) === JSON.stringify(EXTERNAL_ALLOCATION), 'External sample allocation mismatch.');
  const entryById = new Map(entries.map((entry) => [entry.entryId, entry]));
  const controls = !targetManifest && options.level === 'A1' ? Object.keys(CONTROL_EXPECTATIONS).map((entryId) => {
    const entry = entryById.get(entryId);
    assert(entry, `Missing control entry: ${entryId}`);
    return entry;
  }) : [];
  const targetTerms = new Set([...selected, ...controls].map((entry) => normalizeSpanish(entry.term)));
  const referenceByTerm = await extractReference(options.wiktextractPath, targetTerms);
  const externalDirectory = resolve(options.outputDirectory, 'external-reference');
  const controlDirectory = resolve(options.outputDirectory, 'external-controls');
  const aiDirectory = resolve(options.outputDirectory, 'ai-cross-review');
  const externalSchema = outputSchema(`Wordfold Spanish ${options.level} Wiktextract QA`, EXTERNAL_ITEM_SCHEMA);
  const levelExternalPrompt = options.level === 'A1' ? EXTERNAL_PROMPT : EXTERNAL_PROMPT.replaceAll('A1', options.level);
  const controlRun = prepareBatches(controlDirectory, 'control', controls.map((entry) => externalInput(entry, referenceByTerm)), levelExternalPrompt, externalSchema, MODEL);
  const externalRun = prepareBatches(externalDirectory, 'sample', selected.map((entry) => externalInput(entry, referenceByTerm)), levelExternalPrompt, externalSchema, MODEL);

  const sampleManifest = targetManifest ? null : JSON.parse(readFileSync(options.sampleManifestPath, 'utf8'));
  const spanishPacket = targetManifest ? null : JSON.parse(readFileSync(options.spanishPacketPath, 'utf8'));
  if (!targetManifest) {
    assert(sampleManifest.contentSha256 === contentSha256 && spanishPacket.sampleContentSha256 === contentSha256, 'Blinded 200-item sample is not bound to the immutable content.');
    assert(sampleManifest.sampleSize === AI_SAMPLE_SIZE && spanishPacket.entries?.length === AI_SAMPLE_SIZE, 'Expected the frozen 200-item Spanish sample.');
  }
  const aiSourceEntries = targetManifest ? selected : spanishPacket.entries;
  const aiInputs = aiSourceEntries.map((entry) => ({
    entryId: entry.entryId,
    term: entry.term,
    partOfSpeech: entry.partOfSpeech,
    level: entry.level,
    definition: entry.definition,
    example: entry.example,
  }));
  const aiSchema = outputSchema(`Wordfold Spanish ${options.level} blinded AI cross-review`, AI_ITEM_SCHEMA);
  const aiRun = prepareBatches(aiDirectory, 'sample', aiInputs, aiPrompt(options.level), aiSchema, MODEL);

  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    courseId: 'es-sk',
    level: options.level,
    purpose: 'Separate sampled external-reference correspondence QA from a blinded AI cross-review; neither is human or native-speaker review.',
    sourceLearnerContent: {
      manifestPath: options.learnerManifestPath,
      manifestSha256: sha256File(options.learnerManifestPath),
      runIdentitySha256: learnerManifest.runIdentitySha256,
      entryCount: entries.length,
      contentSha256,
      originalContentSha256: loaded.contentSha256,
      corrections: corrections ? {
        path: options.contentCorrectionsPath,
        sha256: sha256File(options.contentCorrectionsPath),
        entryCount: corrections.entries.length,
        semanticExceptions: corrections.entries.filter((entry) => entry.semanticException).length,
      } : null,
    },
    externalReference: {
      role: 'QA-only; read for internal validation and never bundled with Wordfold.',
      source: 'Spanish-language Wiktionary extraction by Wiktextract, distributed by Kaikki.org',
      url: options.referenceUrl,
      archivePath: options.wiktextractPath,
      archiveSha256: sha256File(options.wiktextractPath),
      dumpDate: options.dumpDate,
      extractedAt: options.extractedAt,
      wiktextractRevision: options.wiktextractRevision,
      wikitextprocessorRevision: options.wikitextprocessorRevision,
      license: 'CC BY-SA 4.0 / GFDL source text; Wiktextract software is MIT.',
      retainedInProduct: false,
      copiedGlossesInReports: false,
      requestedUniqueTerms: targetTerms.size,
      matchedUniqueTerms: [...targetTerms].filter((term) => referenceByTerm.has(term)).length,
    },
    externalSample: {
      selectionKind: targetManifest ? (targetManifest.selectionKind ?? 'deterministic-targeted-cohort') : 'probability-sample',
      excludedFromProbabilityErrorDenominators: Boolean(targetManifest),
      method: targetManifest
        ? targetManifest.method
        : 'Within each evidence stratum, order by SHA-256(contentSha256 + U+0000 + wiktextract-qa-v1 + U+0000 + stratum + U+0000 + entryId), take the fixed proportional allocation, then order by entryId.',
      seedSha256: contentSha256,
      population: { total: entries.length, strata: populations },
      sampleSize: selected.length,
      allocation: selectedCounts,
      targetManifest: targetManifest ? { path: options.targetManifestPath, sha256: sha256File(options.targetManifestPath) } : null,
      entries: selected.map((entry) => ({
        entryId: entry.entryId,
        evidenceStratum: entry.evidenceStratum,
        categories: targetById.get(entry.entryId)?.categories ?? [],
      })),
      run: externalRun,
    },
    controls: {
      excludedFromSampleStatistics: true,
      priorValidation: targetManifest ? 'The identical pinned dump and rubric already passed the frozen A1 control set; targeted runs do not spend provider tokens rerunning controls.' : null,
      expectations: !targetManifest && options.level === 'A1' ? CONTROL_EXPECTATIONS : {},
      run: controlRun,
    },
    aiCrossReview: {
      label: 'AI cross-review disagreement rate; not a measured error rate.',
      blinding: 'No source glosses, evidence stratum, generation confidence, model flags, or adjudications are included in model inputs.',
      selectionKind: targetManifest ? 'deterministic-targeted-risk-cohort' : 'probability-sample',
      excludedFromProbabilityErrorDenominators: Boolean(targetManifest),
      sourceSampleManifestPath: targetManifest ? null : options.sampleManifestPath,
      sourceSampleManifestSha256: targetManifest ? null : sha256File(options.sampleManifestPath),
      sourceSpanishPacketPath: targetManifest ? null : options.spanishPacketPath,
      sourceSpanishPacketSha256: targetManifest ? null : sha256File(options.spanishPacketPath),
      targetManifest: targetManifest ? { path: options.targetManifestPath, sha256: sha256File(options.targetManifestPath) } : null,
      entries: aiSourceEntries.map((entry) => ({
        entryId: entry.entryId,
        evidenceStratum: entry.evidenceStratum,
        categories: targetById.get(entry.entryId)?.categories ?? [],
      })),
      sampleSize: aiInputs.length,
      run: aiRun,
    },
  };
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  const manifestIdentity = sha256(canonicalJson({ ...manifest, generatedAt: undefined }));
  manifest.runIdentitySha256 = manifestIdentity;
  writeFileAtomic(manifestPath, canonicalJson(manifest));
  console.log(`Prepared external sample: ${selected.length} (${JSON.stringify(selectedCounts)}).`);
  console.log(`Prepared blinded AI cross-review: ${aiInputs.length}.`);
  console.log(`Reference coverage in requested terms: ${manifest.externalReference.matchedUniqueTerms}/${targetTerms.size}.`);
  console.log(`Manifest: ${manifestPath}`);
}

function validateExternalOutput(input, output) {
  assert(Array.isArray(output) && output.length === input.length, 'External output length mismatch.');
  const allowed = new Set(['corresponds', 'non-correspondence', 'uncertain']);
  for (let index = 0; index < input.length; index += 1) {
    const expected = input[index];
    const actual = output[index];
    assert(actual?.entryId === expected.entryId, `External output ${index + 1}: entryId/order mismatch.`);
    assert(allowed.has(actual.correspondence), `${actual.entryId}: invalid correspondence.`);
    assert(Array.isArray(actual.matchedSenseIndexes) && Array.isArray(actual.matchedPosRanks), `${actual.entryId}: match arrays required.`);
    assert(typeof actual.rationale === 'string' && actual.rationale.trim(), `${actual.entryId}: rationale required.`);
    const referenceIndexes = new Set(expected.referenceSenses.map((sense) => sense.sourceSenseIndex));
    const referenceRanks = new Set(expected.referenceSenses.map((sense) => sense.posRank));
    assert(actual.matchedSenseIndexes.every((value) => referenceIndexes.has(value)), `${actual.entryId}: unknown matched sense_index.`);
    assert(actual.matchedPosRanks.every((value) => referenceRanks.has(value)), `${actual.entryId}: unknown matched POS rank.`);
    if (actual.correspondence === 'corresponds') {
      assert(actual.matchedSenseIndexes.length > 0 && actual.matchedPosRanks.length > 0, `${actual.entryId}: correspondence requires matched ranks.`);
    } else {
      assert(actual.matchedSenseIndexes.length === 0 && actual.matchedPosRanks.length === 0, `${actual.entryId}: non-match/uncertain must not claim ranks.`);
    }
  }
}

function validateAiOutput(input, output) {
  assert(Array.isArray(output) && output.length === input.length, 'AI output length mismatch.');
  const allowed = {
    senseVerdict: new Set(['correct', 'wrong', 'uncertain']),
    definitionVerdict: new Set(['correct', 'material-error', 'uncertain']),
    exampleVerdict: new Set(['correct', 'material-error', 'uncertain']),
    levelVerdict: new Set(['appropriate', 'wrong', 'uncertain']),
    confidence: new Set(['high', 'medium', 'low']),
  };
  for (let index = 0; index < input.length; index += 1) {
    const expected = input[index];
    const actual = output[index];
    assert(actual?.entryId === expected.entryId, `AI output ${index + 1}: entryId/order mismatch.`);
    for (const [key, values] of Object.entries(allowed)) assert(values.has(actual[key]), `${actual.entryId}: invalid ${key}.`);
    assert(typeof actual.rationale === 'string' && actual.rationale.trim(), `${actual.entryId}: rationale required.`);
  }
}

function usageFromEvents(stdout, batchNumber) {
  const events = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const completed = [...events].reverse().find((event) => event.type === 'turn.completed');
  assert(completed?.usage, `Batch ${batchNumber}: Codex did not report usage.`);
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

function generateRun(manifest, run, groupName, validator, options) {
  const usagePath = resolve(dirname(run.prompt.path), 'usage.json');
  const usageByBatch = new Map();
  if (existsSync(usagePath)) {
    for (const batch of JSON.parse(readFileSync(usagePath, 'utf8')).batches ?? []) usageByBatch.set(batch.batchNumber, batch);
  }
  const prompt = readFileSync(run.prompt.path, 'utf8');
  for (const batch of run.batches.filter((candidate) => candidate.batchNumber >= options.fromBatch && candidate.batchNumber <= options.toBatch)) {
    if (existsSync(batch.checkpointPath) && existsSync(batch.outputPath)) {
      const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, 'utf8'));
      if (checkpoint.status === 'valid' && checkpoint.inputSha256 === batch.inputSha256 && checkpoint.outputSha256 === sha256File(batch.outputPath)) {
        console.log(`${groupName} batch ${batch.batchNumber}: valid checkpoint, skipped.`);
        continue;
      }
    }
    const inputText = readFileSync(batch.inputPath, 'utf8');
    assert(sha256(inputText) === batch.inputSha256, `${groupName} batch ${batch.batchNumber}: input hash mismatch.`);
    const task = `${prompt}\nProcess this complete batch in order.\nBATCH INPUT:\n${inputText}`;
    const temporaryOutput = `${batch.outputPath}.tmp-${process.pid}-${randomUUID()}`;
    console.log(`${groupName} batch ${batch.batchNumber}: generating ${batch.entryCount} judgments...`);
    const execution = spawnSync(CODEX_BINARY, [
      'exec', '-', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
      '--sandbox', 'read-only', '--model', run.model.id,
      '--config', `model_reasoning_effort="${run.model.reasoningEffort}"`, '--json',
      '--output-schema', run.outputSchema.path, '--output-last-message', temporaryOutput,
      '-C', '/private/tmp',
    ], { input: task, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    try {
      if (execution.status !== 0) throw new Error(`${groupName} batch ${batch.batchNumber}: Codex failed (${execution.status}).\n${execution.stderr}\n${execution.stdout}`);
      const providerOutput = JSON.parse(readFileSync(temporaryOutput, 'utf8'));
      validator(JSON.parse(inputText), providerOutput.entries);
      const outputText = canonicalJson(providerOutput.entries);
      writeFileAtomic(batch.outputPath, outputText);
      const usage = usageFromEvents(execution.stdout, batch.batchNumber);
      usageByBatch.set(batch.batchNumber, usage);
      writeUsage(usagePath, usageByBatch.values());
      writeFileAtomic(batch.checkpointPath, canonicalJson({
        schemaVersion: 1,
        notHumanReview: true,
        status: 'valid',
        qaRunIdentitySha256: manifest.runIdentitySha256,
        group: groupName,
        batchNumber: batch.batchNumber,
        inputSha256: batch.inputSha256,
        outputSha256: sha256(outputText),
        model: run.model,
        usage,
      }));
      console.log(`${groupName} batch ${batch.batchNumber}: valid.`);
    } finally {
      if (existsSync(temporaryOutput)) unlinkSync(temporaryOutput);
    }
  }
}

function generate(options) {
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert(manifest.notHumanReview === true && manifest.level === options.level, 'Invalid QA manifest.');
  assert(sha256File(options.learnerManifestPath) === manifest.sourceLearnerContent.manifestSha256, 'Learner-content manifest changed after QA preparation.');
  if (options.group === 'all' || options.group === 'external') {
    generateRun(manifest, manifest.controls.run, 'external-controls', validateExternalOutput, options);
    generateRun(manifest, manifest.externalSample.run, 'external-sample', validateExternalOutput, options);
  }
  if (options.group === 'all' || options.group === 'ai') {
    generateRun(manifest, manifest.aiCrossReview.run, 'ai-cross-review', validateAiOutput, options);
  }
}

function readRunEntries(run, validator) {
  const entries = [];
  for (const batch of run.batches) {
    assert(existsSync(batch.outputPath), `Missing QA output: ${batch.outputPath}`);
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    validator(input, output);
    for (let index = 0; index < input.length; index += 1) entries.push({ input: input[index], output: output[index] });
  }
  return entries;
}

export function wilson95(successes, total) {
  assert(Number.isInteger(successes) && Number.isInteger(total) && total > 0 && successes >= 0 && successes <= total, 'Invalid Wilson inputs.');
  const rate = successes / total;
  const zSquared = Z_95 ** 2;
  const denominator = 1 + zSquared / total;
  const centre = (rate + zSquared / (2 * total)) / denominator;
  const margin = (Z_95 * Math.sqrt((rate * (1 - rate) + zSquared / (4 * total)) / total)) / denominator;
  return { count: successes, total, rate, wilson95: { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) } };
}

function percentile(sorted, proportion) {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(proportion * sorted.length) - 1)];
}

function rankDistribution(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? null,
    buckets: {
      '1': sorted.filter((value) => value === 1).length,
      '2': sorted.filter((value) => value === 2).length,
      '3-5': sorted.filter((value) => value >= 3 && value <= 5).length,
      '6-10': sorted.filter((value) => value >= 6 && value <= 10).length,
      '11+': sorted.filter((value) => value >= 11).length,
    },
  };
}

function numericSenseIndex(value) {
  return /^\d+$/u.test(value) ? Number(value) : null;
}

function externalMetrics(records) {
  const nonCorrespondence = records.filter(({ output }) => output.correspondence === 'non-correspondence');
  const corresponds = records.filter(({ output }) => output.correspondence === 'corresponds');
  const uncertain = records.filter(({ output }) => output.correspondence === 'uncertain');
  const missingReference = records.filter(({ input }) => input.referenceSenses.length === 0);
  const definitive = corresponds.length + nonCorrespondence.length;
  const sourceRanks = corresponds.map(({ output }) => {
    const numeric = output.matchedSenseIndexes.map(numericSenseIndex).filter((value) => value !== null);
    return numeric.length > 0 ? Math.min(...numeric) : null;
  }).filter((value) => value !== null);
  const posRanks = corresponds.map(({ output }) => Math.min(...output.matchedPosRanks));
  return {
    total: records.length,
    coverage: {
      label: 'Entries with at least one compatible external-reference sense; reported separately from validity.',
      count: records.length - missingReference.length,
      total: records.length,
      rate: (records.length - missingReference.length) / records.length,
    },
    validity: {
      label: 'External-reference non-correspondence; a candidate mismatch requiring A/B/R adjudication, not a raw defect or overall quality rate.',
      nonCorrespondence: wilson95(nonCorrespondence.length, records.length),
      correspondenceCount: corresponds.length,
      correspondenceAmongDefinitive: {
        count: corresponds.length,
        total: definitive,
        rate: corresponds.length / definitive,
      },
      uncertainCount: uncertain.length,
      missingReferenceCount: missingReference.length,
    },
    rank: {
      label: 'Sense rank among valid correspondences; high rank is a suspicion, not a defect. Wiktionary ordering is editorial rather than corpus-based.',
      sourceSenseIndex: rankDistribution(sourceRanks),
      withinPartOfSpeech: rankDistribution(posRanks),
    },
  };
}

function aiMetrics(records) {
  const contentDisagrees = records.filter(({ output }) => (
    output.senseVerdict === 'wrong'
    || output.definitionVerdict === 'material-error'
    || output.exampleVerdict === 'material-error'
  ));
  const levelDisagrees = records.filter(({ output }) => output.levelVerdict === 'wrong');
  const disagrees = records.filter(({ output }) => (
    output.senseVerdict === 'wrong'
    || output.definitionVerdict === 'material-error'
    || output.exampleVerdict === 'material-error'
    || output.levelVerdict === 'wrong'
  ));
  const uncertain = records.filter(({ output }) => (
    output.senseVerdict === 'uncertain'
    || output.definitionVerdict === 'uncertain'
    || output.exampleVerdict === 'uncertain'
    || output.levelVerdict === 'uncertain'
  ));
  return {
    total: records.length,
    label: 'AI cross-review disagreement rate; not a measured error rate and not human or native-speaker review.',
    disagreement: wilson95(disagrees.length, records.length),
    contentDisagreement: wilson95(contentDisagrees.length, records.length),
    levelDisagreement: wilson95(levelDisagrees.length, records.length),
    contentAndLevelDisagreementCount: contentDisagrees.filter((record) => record.output.levelVerdict === 'wrong').length,
    uncertainCount: uncertain.length,
    dimensions: {
      wrongSense: records.filter(({ output }) => output.senseVerdict === 'wrong').length,
      materialDefinition: records.filter(({ output }) => output.definitionVerdict === 'material-error').length,
      materialExample: records.filter(({ output }) => output.exampleVerdict === 'material-error').length,
      wrongLevel: records.filter(({ output }) => output.levelVerdict === 'wrong').length,
    },
  };
}

function usageForRun(run) {
  const usagePath = resolve(dirname(run.prompt.path), 'usage.json');
  return existsSync(usagePath) ? JSON.parse(readFileSync(usagePath, 'utf8')).totals : null;
}

function addUsage(...items) {
  const present = items.filter(Boolean);
  if (present.length === 0) return null;
  return present.reduce((total, item) => ({
    inputTokens: total.inputTokens + item.inputTokens,
    cachedInputTokens: total.cachedInputTokens + item.cachedInputTokens,
    outputTokens: total.outputTokens + item.outputTokens,
    totalTokens: total.totalTokens + item.totalTokens,
  }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 });
}

function usageAt(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).totals : null;
}

function analyze(options) {
  const manifest = JSON.parse(readFileSync(resolve(options.outputDirectory, 'manifest.json'), 'utf8'));
  const controls = readRunEntries(manifest.controls.run, validateExternalOutput);
  const controlResults = Object.fromEntries(controls.map(({ input, output }) => [input.entryId, {
    term: input.term,
    partOfSpeech: input.partOfSpeech,
    expected: manifest.controls.expectations[input.entryId],
    actual: output.correspondence,
    passed: output.correspondence === manifest.controls.expectations[input.entryId],
    matchedSenseIndexes: output.matchedSenseIndexes,
    matchedPosRanks: output.matchedPosRanks,
  }]));
  assert(Object.values(controlResults).every((control) => control.passed), `External controls failed: ${JSON.stringify(controlResults)}`);

  const external = readRunEntries(manifest.externalSample.run, validateExternalOutput);
  const externalStratumById = new Map(manifest.externalSample.entries.map((entry) => [entry.entryId, entry.evidenceStratum]));
  const externalCategoriesById = new Map(manifest.externalSample.entries.map((entry) => [entry.entryId, entry.categories ?? []]));
  const categories = [...new Set(manifest.externalSample.entries.flatMap((entry) => entry.categories ?? []))].sort();
  const finalSampleUsage = usageForRun(manifest.externalSample.run);
  const finalControlUsage = usageForRun(manifest.controls.run);
  const discardedAttemptDirectory = resolve(options.outputDirectory, 'discarded-attempt-1');
  const discardedSampleUsage = usageAt(resolve(discardedAttemptDirectory, 'external-reference/usage.json'));
  const discardedControlUsage = usageAt(resolve(discardedAttemptDirectory, 'external-controls/usage.json'));
  const externalSummary = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'complete',
    sourceRunIdentitySha256: manifest.sourceLearnerContent.runIdentitySha256,
    sourceContentSha256: manifest.sourceLearnerContent.contentSha256,
    sample: {
      size: manifest.externalSample.sampleSize,
      allocation: manifest.externalSample.allocation,
      method: manifest.externalSample.method,
    },
    reference: manifest.externalReference,
    controls: controlResults,
    result: {
      scope: `This check measures whether each ${manifest.externalSample.selectionKind === 'probability-sample' ? 'sampled' : 'targeted'} definition expresses a listed real Spanish sense. It does not measure whether that sense is the right Spanish to teach at ${manifest.level} and must not be presented as an overall quality rate.`,
      overall: externalMetrics(external),
      byEvidenceStratum: Object.fromEntries(Object.keys(manifest.externalSample.population.strata)
        .filter((stratum) => manifest.externalSample.allocation[stratum] > 0).map((stratum) => [
        stratum,
        externalMetrics(external.filter(({ input }) => externalStratumById.get(input.entryId) === stratum)),
      ])),
      byCategory: Object.fromEntries(categories.map((category) => [
        category,
        externalMetrics(external.filter(({ input }) => externalCategoriesById.get(input.entryId).includes(category))),
      ])),
      a1ProbabilityBaseline: manifest.level === 'A2' ? {
        strictNonCorrespondenceRate: 0.0333,
        wilson95: { lower: 0.0182, upper: 0.0603 },
        comparability: 'The A1 baseline is a probability sample of all A1 entries; this A2 result is a targeted category cohort. Any difference is descriptive, not an unbiased level-to-level rate comparison.',
      } : null,
    },
    usage: {
      finalSample: finalSampleUsage,
      finalControls: finalControlUsage,
      discardedAttempts: discardedSampleUsage || discardedControlUsage ? [{
        reason: 'The initial comparison rule accepted a broad hypernym for cuidador; the failed control invalidated that attempt and the rule was tightened before rerunning.',
        sample: discardedSampleUsage,
        controls: discardedControlUsage,
        total: addUsage(discardedSampleUsage, discardedControlUsage),
      }] : [],
      finalRunTotal: addUsage(finalSampleUsage, finalControlUsage),
      actualTotal: addUsage(finalSampleUsage, finalControlUsage, discardedSampleUsage, discardedControlUsage),
    },
  };

  const analyzeAi = options.group !== 'external';
  const ai = analyzeAi ? readRunEntries(manifest.aiCrossReview.run, validateAiOutput) : [];
  const aiMetadata = manifest.aiCrossReview.entries
    ?? JSON.parse(readFileSync(manifest.aiCrossReview.sourceSampleManifestPath, 'utf8')).entries;
  const aiStratumById = new Map(aiMetadata.map((entry) => [entry.entryId, entry.evidenceStratum]));
  const aiCategoriesById = new Map(aiMetadata.map((entry) => [entry.entryId, entry.categories ?? []]));
  const aiCategories = [...new Set(aiMetadata.flatMap((entry) => entry.categories ?? []))].sort();
  const aiStrata = [...new Set(aiStratumById.values())].sort();
  const aiSummary = analyzeAi ? {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'complete',
    sourceRunIdentitySha256: manifest.sourceLearnerContent.runIdentitySha256,
    sourceContentSha256: manifest.sourceLearnerContent.contentSha256,
    model: manifest.aiCrossReview.run.model,
    blinding: manifest.aiCrossReview.blinding,
    selectionKind: manifest.aiCrossReview.selectionKind ?? 'probability-sample',
    excludedFromProbabilityErrorDenominators: Boolean(manifest.aiCrossReview.excludedFromProbabilityErrorDenominators),
    sampleSize: ai.length,
    result: {
      overall: aiMetrics(ai),
      byEvidenceStratum: Object.fromEntries(aiStrata.map((stratum) => [
        stratum,
        aiMetrics(ai.filter(({ input }) => aiStratumById.get(input.entryId) === stratum)),
      ])),
      byCategory: Object.fromEntries(aiCategories.map((category) => [
        category,
        aiMetrics(ai.filter(({ input }) => aiCategoriesById.get(input.entryId).includes(category))),
      ])),
    },
    usage: usageForRun(manifest.aiCrossReview.run),
  } : null;
  const findings = {
    schemaVersion: 1,
    notHumanReview: true,
    level: manifest.level,
    externalNonCorrespondence: external
      .filter(({ output }) => output.correspondence === 'non-correspondence')
      .map(({ input, output }) => ({
        entryId: input.entryId,
        term: input.term,
        partOfSpeech: input.partOfSpeech,
        definition: input.definition,
        example: input.example,
        categories: externalCategoriesById.get(input.entryId),
        rationale: output.rationale,
      })),
    aiMaterialOrSenseDisagreement: ai
      .filter(({ output }) => output.senseVerdict === 'wrong'
        || output.definitionVerdict === 'material-error'
        || output.exampleVerdict === 'material-error')
      .map(({ input, output }) => ({ ...input, ...output })),
  };
  const externalSummaryPath = resolve(options.outputDirectory, 'external-reference-summary.json');
  const aiSummaryPath = resolve(options.outputDirectory, 'ai-cross-review-summary.json');
  const findingsPath = resolve(options.outputDirectory, 'findings.json');
  writeFileAtomic(externalSummaryPath, canonicalJson(externalSummary));
  if (aiSummary) writeFileAtomic(aiSummaryPath, canonicalJson(aiSummary));
  writeFileAtomic(findingsPath, canonicalJson(findings));
  console.log(canonicalJson({ externalSummaryPath, aiSummaryPath: aiSummary ? aiSummaryPath : null, findingsPath, external: externalSummary.result, ai: aiSummary?.result ?? null }));
}

export { rankDistribution };

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'prepare') await prepare(options);
    else if (options.command === 'generate') generate(options);
    else analyze(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
