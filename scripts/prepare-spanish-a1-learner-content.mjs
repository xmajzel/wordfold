import { createHash, randomUUID } from 'node:crypto';
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

export const PILOT_SIZE = 100;
export const BATCH_SIZE = 50;
export const PILOT_SEED = 'wordfold-es-a1-learner-content-pilot-v1';
export const PILOT_MODEL = Object.freeze({
  id: 'gpt-5',
  settings: Object.freeze({
    reasoningEffort: 'session-configured',
    temperature: null,
    responseFormat: 'json-schema',
  }),
});
export const FULL_MODEL = Object.freeze({
  id: 'gpt-5.6-sol',
  settings: Object.freeze({
    reasoningEffort: 'session-configured',
    temperature: null,
    responseFormat: 'json-schema',
  }),
});

export const OUTPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Wordfold Spanish A1 learner-content batch',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'entryId', 'term', 'normalizedTerm', 'partOfSpeech', 'level',
      'pcicClassification', 'meaningReferenceSenseId', 'definition', 'example',
      'confidence', 'needsReview', 'reviewNote',
    ],
    properties: {
      entryId: { type: 'string' },
      term: { type: 'string' },
      normalizedTerm: { type: 'string' },
      partOfSpeech: { enum: ['noun', 'verb', 'adjective', 'adverb'] },
      level: { type: 'string', const: 'A1' },
      pcicClassification: { type: ['string', 'null'] },
      meaningReferenceSenseId: { type: 'string' },
      definition: { type: 'string' },
      example: { type: 'string' },
      confidence: { enum: ['high', 'medium', 'low'] },
      needsReview: { type: 'boolean' },
      reviewNote: { type: 'string' },
    },
  },
});

export const CODEX_OUTPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Wordfold Spanish A1 learner-content Codex response',
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: { entries: OUTPUT_SCHEMA },
});

export const PROMPT = `You are preparing Spanish learner content for Wordfold.

For every supplied entry, choose exactly one supplied OMW Spanish sense. Use its Spanish evidence and its bridged WordNet 3.0 English synset only as evidence. Do not browse, invent a sense, change the term, or change catalog membership, POS, or CEFR level. ELELex already fixed membership and level. PCIC classification is copied metadata only and must never affect membership, level, or sense choice.

Return a JSON array matching the supplied schema and input order. Copy entryId, term, normalizedTerm, partOfSpeech, level, and pcicClassification exactly. meaningReferenceSenseId must equal one candidateSenses[].senseId from the same entry.

Write an original learner-friendly Spanish definition of 3–24 words. Capitalize it, end it with punctuation, avoid defining the term with itself, and express only the selected sense. Write an original natural Spanish example of 4–24 words containing the exact supplied term, capitalized and ending with punctuation. Prefer the ordinary A1-appropriate meaning supported by the evidence; WordNet source order is not a curriculum ranking.

Set confidence to high, medium, or low. Ordinary polysemy is not itself a reason for review. Set needsReview only for a genuine evidence conflict, coverage problem, or unresolved choice, and otherwise use an empty reviewNote. Do not add translations, pronunciation, markdown, or commentary.`;

function schemaForLevel(level) {
  const schema = structuredClone(OUTPUT_SCHEMA);
  schema.title = `Wordfold Spanish ${level} learner-content batch`;
  schema.items.properties.level.const = level;
  return schema;
}

function codexSchemaForLevel(level, outputSchema) {
  const schema = structuredClone(CODEX_OUTPUT_SCHEMA);
  schema.title = `Wordfold Spanish ${level} learner-content Codex response`;
  schema.properties.entries = outputSchema;
  return schema;
}

function promptForLevel(level) {
  return PROMPT.replace('ordinary A1-appropriate meaning', `ordinary ${level}-appropriate meaning`);
}

function parseArgs(argv) {
  const options = {
    level: 'A1',
    catalogPath: resolve('assets/catalog/spanish/cefr-course-catalog.json'),
    evidencePath: null,
    outputDirectory: null,
    reusePilotDirectory: null,
    includeTargetManifestPath: null,
    mode: 'full',
    pilotSize: PILOT_SIZE,
    batchSize: BATCH_SIZE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--level') options.level = argv[++index].toUpperCase();
    else if (argument === '--catalog') options.catalogPath = resolve(argv[++index]);
    else if (argument === '--evidence') options.evidencePath = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else if (argument === '--reuse-pilot-dir') options.reusePilotDirectory = resolve(argv[++index]);
    else if (argument === '--include-target-manifest') options.includeTargetManifestPath = resolve(argv[++index]);
    else if (argument === '--pilot') options.mode = 'pilot';
    else if (argument === '--full') options.mode = 'full';
    else if (argument === '--pilot-size') options.pilotSize = Number(argv[++index]);
    else if (argument === '--batch-size') options.batchSize = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.pilotSize) || options.pilotSize < 1) throw new Error('--pilot-size must be a positive integer.');
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) throw new Error('--batch-size must be a positive integer.');
  if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(options.level)) throw new Error('--level must be A1, A2, B1, B2, or C1.');
  const levelSlug = options.level.toLowerCase();
  options.evidencePath ??= resolve(`assets/catalog/spanish/${levelSlug}-lexical-evidence.json`);
  options.reusePilotDirectory ??= resolve(`.artifacts/spanish-${levelSlug}-learner-content/pilot`);
  options.outputDirectory ??= resolve(`.artifacts/spanish-${levelSlug}-learner-content/${options.mode}`);
  return options;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function writeFileAtomic(path, value) {
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
    if (!readFileSync(path).equals(Buffer.from(value))) throw new Error(`Resume refused because immutable run input changed: ${path}`);
    return;
  }
  writeFileAtomic(path, value);
}

function allocateQuotas(entries, size) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.partOfSpeech, (counts.get(entry.partOfSpeech) ?? 0) + 1);
  const allocations = [...counts].map(([partOfSpeech, count]) => {
    const exact = (count / entries.length) * size;
    return { partOfSpeech, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = size - allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  allocations.sort((left, right) => right.remainder - left.remainder || left.partOfSpeech.localeCompare(right.partOfSpeech, 'en'));
  for (let index = 0; index < remaining; index += 1) allocations[index].count += 1;
  return new Map(allocations.map(({ partOfSpeech, count }) => [partOfSpeech, count]));
}

export function selectPilot(entries, size = PILOT_SIZE, seed = PILOT_SEED) {
  if (entries.length < size) throw new Error(`Pilot requires ${size} entries, but only ${entries.length} are available.`);
  const order = new Map(entries.map((entry, index) => [entry.entryId, index]));
  const quotas = allocateQuotas(entries, size);
  const selected = [];
  for (const [partOfSpeech, quota] of quotas) {
    const candidates = entries
      .filter((entry) => entry.partOfSpeech === partOfSpeech)
      .sort((left, right) => sha256(`${seed}\u0000${left.entryId}`).localeCompare(sha256(`${seed}\u0000${right.entryId}`), 'en'));
    const requiredMultiwords = candidates.filter((entry) => entry.term.includes(' '));
    const chosen = [...requiredMultiwords, ...candidates.filter((entry) => !entry.term.includes(' '))].slice(0, quota);
    selected.push(...chosen);
  }
  return selected.sort((left, right) => order.get(left.entryId) - order.get(right.entryId));
}

function compactSense(sense) {
  return {
    senseId: sense.senseId,
    spanishSynsetId: sense.semanticReference.spanishSynsetId,
    englishSynsetId: sense.semanticReference.englishSynsetId,
    iliId: sense.semanticReference.iliId,
    spanishDefinition: sense.semanticReference.spanish.definition,
    spanishExamples: sense.semanticReference.spanish.examples,
    englishDefinition: sense.semanticReference.english.definition,
    englishMembers: sense.semanticReference.english.members,
    englishExamples: sense.semanticReference.english.examples,
  };
}

function compactEntry(entry) {
  return {
    entryId: entry.entryId,
    term: entry.term,
    normalizedTerm: entry.normalizedTerm,
    partOfSpeech: entry.partOfSpeech,
    level: entry.level,
    pcicClassification: entry.pcicClassification,
    candidateSenses: entry.candidateSenses.map(compactSense),
  };
}

function validCheckpoint(batch, manifestIdentity, checkpointPath, outputPath) {
  if (!existsSync(checkpointPath) || !existsSync(outputPath)) return false;
  try {
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    return checkpoint.schemaVersion === 1
      && checkpoint.status === 'valid'
      && checkpoint.runIdentitySha256 === manifestIdentity
      && checkpoint.batchNumber === batch.batchNumber
      && checkpoint.inputSha256 === batch.inputSha256
      && checkpoint.outputSha256 === sha256(readFileSync(outputPath));
  } catch {
    return false;
  }
}

export function prepareRun(options) {
  const catalogText = readFileSync(options.catalogPath);
  const evidenceText = readFileSync(options.evidencePath);
  const catalog = JSON.parse(catalogText);
  const evidence = JSON.parse(evidenceText);
  const levelCatalog = catalog.entries.filter((entry) => entry.level === options.level);
  if (levelCatalog.length < 1 || catalog.counts?.[options.level] !== levelCatalog.length) {
    throw new Error(`Frozen ${options.level} course slice count mismatch: header ${catalog.counts?.[options.level]}, entries ${levelCatalog.length}.`);
  }
  if (evidence.schemaVersion !== 2 || evidence.level !== options.level || evidence.catalog?.sha256 !== sha256(catalogText)) {
    throw new Error('Lexical evidence is not bound to the current CEFR course catalog.');
  }
  const expectedIds = levelCatalog.map((entry) => entry.id);
  const evidenceIds = evidence.entries.map((entry) => entry.entryId);
  if (JSON.stringify(expectedIds) !== JSON.stringify(evidenceIds)) {
    throw new Error(`Lexical evidence entry IDs/order differ from the fixed ${options.level} catalog slice.`);
  }

  const acceptedPilotManifestPath = resolve(options.reusePilotDirectory, 'manifest.json');
  const acceptedPilotManifestText = options.mode === 'full' ? readFileSync(acceptedPilotManifestPath) : null;
  const acceptedPilotManifest = acceptedPilotManifestText ? JSON.parse(acceptedPilotManifestText) : null;
  const pilotSeed = `wordfold-es-${options.level.toLowerCase()}-learner-content-pilot-v1`;
  const probabilityPilotEntries = selectPilot(evidence.entries, options.pilotSize, pilotSeed);
  const acceptedEntryIds = acceptedPilotManifest?.batches.flatMap((batch) => batch.entryIds) ?? [];
  const pilotEntries = options.mode === 'full'
    ? acceptedEntryIds.map((entryId) => evidence.entries.find((entry) => entry.entryId === entryId))
    : probabilityPilotEntries;
  if (pilotEntries.some((entry) => !entry)) throw new Error('Accepted pilot/probe contains an entry outside the current lexical evidence.');
  const pilotIds = new Set(pilotEntries.map((entry) => entry.entryId));
  const includeTargetManifestText = options.includeTargetManifestPath
    ? readFileSync(options.includeTargetManifestPath)
    : null;
  const includeTargetManifest = includeTargetManifestText ? JSON.parse(includeTargetManifestText) : null;
  if (includeTargetManifest) {
    if (options.mode !== 'pilot') throw new Error('--include-target-manifest is supported only for a pilot/probe run.');
    if (includeTargetManifest.notHumanReview !== true || includeTargetManifest.level !== options.level) {
      throw new Error('Included target manifest must be marked notHumanReview and match the requested level.');
    }
  }
  const evidenceById = new Map(evidence.entries.map((entry) => [entry.entryId, entry]));
  const targetIds = [...new Set((includeTargetManifest?.entries ?? []).map((entry) => entry.entryId))];
  const missingTargetIds = targetIds.filter((entryId) => !evidenceById.has(entryId));
  if (missingTargetIds.length > 0) throw new Error(`Included target manifest has missing entry IDs: ${missingTargetIds.join(', ')}.`);
  const targetedAdditions = targetIds.filter((entryId) => !pilotIds.has(entryId)).map((entryId) => evidenceById.get(entryId));
  const selectedSourceEntries = options.mode === 'full'
    ? [...pilotEntries, ...evidence.entries.filter((entry) => !pilotIds.has(entry.entryId))]
    : [...pilotEntries, ...targetedAdditions];
  const selected = selectedSourceEntries.map(compactEntry);
  const selectedIds = selected.map((entry) => entry.entryId);
  const model = options.level === 'A1' && options.mode === 'pilot' ? PILOT_MODEL : FULL_MODEL;
  mkdirSync(options.outputDirectory, { recursive: true });
  const promptPath = resolve(options.outputDirectory, 'PROMPT.txt');
  const schemaPath = resolve(options.outputDirectory, 'output.schema.json');
  const codexSchemaPath = resolve(options.outputDirectory, 'codex-output.schema.json');
  const outputSchema = schemaForLevel(options.level);
  const codexOutputSchema = codexSchemaForLevel(options.level, outputSchema);
  const promptText = `${promptForLevel(options.level)}\n`;
  const schemaText = canonicalJson(outputSchema);
  const codexSchemaText = canonicalJson(codexOutputSchema);
  writeImmutable(promptPath, promptText);
  writeImmutable(schemaPath, schemaText);
  writeImmutable(codexSchemaPath, codexSchemaText);

  const batches = [];
  for (let offset = 0; offset < selected.length; offset += options.batchSize) {
    const entries = selected.slice(offset, offset + options.batchSize);
    const batchNumber = batches.length + 1;
    const baseName = `${options.mode === 'full' ? 'batch' : 'pilot'}-${String(batchNumber).padStart(3, '0')}`;
    const inputPath = resolve(options.outputDirectory, `${baseName}.input.json`);
    const outputPath = resolve(options.outputDirectory, `${baseName}.output.json`);
    const checkpointPath = resolve(options.outputDirectory, `${baseName}.checkpoint.json`);
    const inputText = canonicalJson(entries);
    writeImmutable(inputPath, inputText);
    let reusedFrom = null;
    if (options.mode === 'full' && offset < acceptedEntryIds.length) {
      const pilotBaseName = `pilot-${String(batchNumber).padStart(3, '0')}`;
      const pilotInputPath = resolve(options.reusePilotDirectory, `${pilotBaseName}.input.json`);
      const pilotOutputPath = resolve(options.reusePilotDirectory, `${pilotBaseName}.output.json`);
      if (!existsSync(pilotInputPath) || !existsSync(pilotOutputPath)) {
        throw new Error(`Cannot reuse accepted pilot batch ${batchNumber}: input or output is missing.`);
      }
      if (!readFileSync(pilotInputPath).equals(Buffer.from(inputText))) {
        throw new Error(`Cannot reuse accepted pilot batch ${batchNumber}: full-run input differs from pilot input.`);
      }
      writeImmutable(outputPath, readFileSync(pilotOutputPath));
      reusedFrom = pilotOutputPath;
    }
    batches.push({
      batchNumber,
      startIndex: offset,
      endIndexExclusive: offset + entries.length,
      entryCount: entries.length,
      entryIds: entries.map((entry) => entry.entryId),
      inputPath,
      inputSha256: sha256(inputText),
      outputPath,
      checkpointPath,
      reusedFrom,
    });
  }

  const runIdentity = {
    catalogSha256: sha256(catalogText),
    lexicalEvidenceSha256: sha256(evidenceText),
    orderedEntryIds: expectedIds,
    selectedEntryIds: selectedIds,
    sourceVersions: {
      membershipAndLevel: `${levelCatalog[0].source}:${levelCatalog[0].sourceVersion}`,
      lexical: `${evidence.source.id}:${evidence.source.version}`,
      semantic: `${evidence.semanticSource.id}:${evidence.semanticSource.version}`,
    },
    normalization: evidence.normalization,
    promptSha256: sha256(promptText),
    schemaSha256: sha256(schemaText),
    codexSchemaSha256: sha256(codexSchemaText),
    model,
    mode: options.mode,
    includedTargetManifest: includeTargetManifest ? {
      path: options.includeTargetManifestPath,
      sha256: sha256(includeTargetManifestText),
      entryIds: targetIds,
    } : null,
    acceptedPilot: options.mode === 'full' ? {
      entries: acceptedEntryIds.length,
      directory: options.reusePilotDirectory,
      batchNumbers: Array.from({ length: Math.ceil(acceptedEntryIds.length / options.batchSize) }, (_value, index) => index + 1),
      manifestSha256: sha256(acceptedPilotManifestText),
      model: acceptedPilotManifest.model,
    } : null,
    batchSize: options.batchSize,
    batchBoundaries: batches.map((batch) => ({
      batchNumber: batch.batchNumber,
      startIndex: batch.startIndex,
      endIndexExclusive: batch.endIndexExclusive,
      entryIds: batch.entryIds,
      inputSha256: batch.inputSha256,
    })),
  };
  const runIdentitySha256 = sha256(canonicalJson(runIdentity));
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  if (existsSync(manifestPath)) {
    const previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (previous.runIdentitySha256 !== runIdentitySha256) {
      throw new Error('Resume refused because manifest identity differs from the prepared run.');
    }
  }
  const batchStatus = batches.map((batch) => ({
    ...batch,
    status: validCheckpoint(batch, runIdentitySha256, batch.checkpointPath, batch.outputPath) ? 'valid' : 'pending-or-invalid',
  }));
  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    courseId: 'es-sk',
    level: options.level,
    mode: options.mode,
    pilotSize: options.pilotSize,
    entryCount: selected.length,
    selection: {
      method: 'deterministic-seeded-POS-proportional-sample-with-multiword-coverage',
      seed: pilotSeed,
      selectedPosCounts: Object.fromEntries([...new Set(selected.map((entry) => entry.partOfSpeech))].sort().map((pos) => [pos, selected.filter((entry) => entry.partOfSpeech === pos).length])),
      selectedMultiwords: selected.filter((entry) => entry.term.includes(' ')).map((entry) => entry.entryId),
      probabilityPilotEntryIds: probabilityPilotEntries.map((entry) => entry.entryId),
      includedTargetEntryIds: targetIds,
      overlapEntryIds: targetIds.filter((entryId) => pilotIds.has(entryId)),
      targetedAdditionEntryIds: targetedAdditions.map((entry) => entry.entryId),
    },
    inputCatalog: {
      path: options.catalogPath,
      sha256: runIdentity.catalogSha256,
      entries: catalog.entries.length,
      levelEntries: levelCatalog.length,
      orderedEntryIds: expectedIds,
    },
    lexicalEvidence: { path: options.evidencePath, sha256: runIdentity.lexicalEvidenceSha256 },
    sourceVersions: runIdentity.sourceVersions,
    normalization: runIdentity.normalization,
    prompt: { path: promptPath, sha256: runIdentity.promptSha256 },
    outputSchema: { path: schemaPath, sha256: runIdentity.schemaSha256 },
    codexOutputSchema: { path: codexSchemaPath, sha256: runIdentity.codexSchemaSha256 },
    model,
    acceptedPilot: runIdentity.acceptedPilot,
    batchSize: options.batchSize,
    runIdentitySha256,
    batches: batchStatus,
  };
  writeFileAtomic(manifestPath, canonicalJson(manifest));
  return { manifestPath, manifest };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = prepareRun(parseArgs(process.argv.slice(2)));
    const pending = result.manifest.batches.filter((batch) => batch.status !== 'valid');
    console.log(`Prepared ${result.manifest.entryCount} ${result.manifest.mode} entries in ${result.manifest.batches.length} batches of ${result.manifest.batchSize}.`);
    console.log(`Resume status: ${pending.length} pending or invalid batch(es); ${result.manifest.batches.length - pending.length} valid batch(es).`);
    console.log(`Manifest: ${result.manifestPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
