import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBatch as validateLearnerBatch } from './validate-spanish-a1-learner-content.mjs';
import { analyzeSharedHintRisk, selectPilotGroups, summarizeSharedHintRisk } from './spanish-a1-slovak-translations.mjs';

const DESKTOP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';
const CODEX_BINARY = process.env.WORDFOLD_CODEX_BINARY || (existsSync(DESKTOP_CODEX) ? DESKTOP_CODEX : 'codex');
const LEVEL_COUNTS = Object.freeze({ A2: 1847, B1: 1315, B2: 763, C1: 555 });
const PILOT_GROUPS = 100;
const BATCH_SIZE = 50;
const OWNER_SAMPLE_SIZE = 300;
const A1_TOKENS_PER_ENTRY = 585;
const A1_BASELINE_PROJECTION = 1_080_495;
const MODEL = Object.freeze({ id: 'gpt-5.6-sol', reasoningEffort: 'medium' });

const PROMPT = `You are writing concise Slovak learning hints for Spanish LEVEL vocabulary in Wordfold.

Each input is one selected Spanish synset/ILI group. Every member has the same selected meaning but may use a different Spanish headword. Read the Spanish definitions and examples, then write one natural shared Slovak hint for that exact meaning. Use contemporary standard Slovak as spoken in Slovakia: noun nominative, verb infinitive with necessary sa/si, masculine singular adjective, and natural adverb form. A hint is normally 1-5 words and may use a semicolon to preserve a necessary distinction.

Use memberOverrides when a single shared Slovak hint would be materially unnatural or misleading for a particular Spanish member despite the shared synset. Overrides must name only supplied member entry IDs. Every input includes sharedHintRisk. When sharedHintRisk.flagged=true, explicitly assess the gate. If an override is required, return it and use sharedHintRiskAssessment="override-required". If the Spanish definitions diverge but one Slovak hint genuinely fits every member, do not invent an override: set needsReview=true, use sharedHintRiskAssessment="false-positive-candidate", and begin reviewNote with "gate-false-positive-candidate:" followed by the Slovak-specific rationale. Otherwise use sharedHintRiskAssessment="unresolved" with needsReview=true and a rationale. A flagged group may never return one unqualified shared hint.

For unflagged groups use sharedHintRiskAssessment="not-applicable". Do not translate examples, change Spanish content, change CEFR levels, browse, or claim human/native review. Set notHumanReview=true. Copy groupId exactly and preserve group order. Return only the requested JSON object.`;

const OUTPUT_ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['groupId', 'notHumanReview', 'slovakHint', 'memberOverrides', 'sharedHintRiskAssessment', 'confidence', 'needsReview', 'reviewNote'],
  properties: {
    groupId: { type: 'string' },
    notHumanReview: { type: 'boolean', const: true },
    slovakHint: { type: 'string' },
    memberOverrides: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entryId', 'slovakHint', 'rationale'],
        properties: {
          entryId: { type: 'string' },
          slovakHint: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    sharedHintRiskAssessment: { enum: ['not-applicable', 'override-required', 'false-positive-candidate', 'unresolved'] },
    confidence: { enum: ['high', 'medium', 'low'] },
    needsReview: { type: 'boolean' },
    reviewNote: { type: 'string' },
  },
});

const OUTPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Wordfold Spanish A2 grouped Slovak translation',
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
  writeFileSync(temporaryPath, value);
  renameSync(temporaryPath, path);
}

function writeImmutable(path, value) {
  if (existsSync(path)) {
    assert(readFileSync(path).equals(Buffer.from(value)), `Immutable translation artifact changed: ${path}`);
    return;
  }
  writeFileAtomic(path, value);
}

function parseArgs(argv) {
  const options = {
    command: argv[0],
    level: 'A2',
    learnerManifestPath: null,
    pilotDirectory: null,
    outputDirectory: null,
    ownerReviewDirectory: null,
    correctionsPath: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--level') options.level = argv[++index].toUpperCase();
    else if (argument === '--learner-manifest') options.learnerManifestPath = resolve(argv[++index]);
    else if (argument === '--pilot-dir') options.pilotDirectory = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else if (argument === '--owner-review-dir') options.ownerReviewDirectory = resolve(argv[++index]);
    else if (argument === '--corrections') options.correctionsPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  assert(['prepare-pilot', 'generate-pilot', 'analyze-pilot', 'prepare-remaining', 'generate-remaining', 'analyze'].includes(options.command),
    'Usage: spanish-a2-slovak-translations.mjs prepare-pilot|generate-pilot|analyze-pilot|prepare-remaining|generate-remaining|analyze');
  assert(LEVEL_COUNTS[options.level], '--level must be A2, B1, B2, or C1.');
  const slug = options.level.toLowerCase();
  options.learnerManifestPath ??= resolve(`.artifacts/spanish-${slug}-learner-content/full/manifest.json`);
  options.pilotDirectory ??= resolve(`.artifacts/spanish-${slug}-slovak-translations/pilot`);
  options.outputDirectory ??= resolve(`.artifacts/spanish-${slug}-slovak-translations/full`);
  options.ownerReviewDirectory ??= resolve(`.artifacts/spanish-${slug}-owner-review`);
  return options;
}

function promptForLevel(level) { return PROMPT.replaceAll('LEVEL', level); }

export function buildTranslationGroups(learnerManifestPath, level = 'A2', correctionsPath = null) {
  const manifest = JSON.parse(readFileSync(learnerManifestPath, 'utf8'));
  const expectedEntries = LEVEL_COUNTS[level];
  assert(manifest.mode === 'full' && manifest.level === level && manifest.entryCount === expectedEntries,
    `Expected the immutable ${expectedEntries}-entry ${level} learner run.`);
  const generated = [];
  const selectedSenseById = new Map();
  const inputById = new Map();
  for (const batch of manifest.batches) {
    const inputText = readFileSync(batch.inputPath);
    const outputText = readFileSync(batch.outputPath);
    assert(sha256(inputText) === batch.inputSha256, `Learner batch ${batch.batchNumber}: input hash mismatch.`);
    const input = JSON.parse(inputText);
    const output = JSON.parse(outputText);
    validateLearnerBatch(input, output);
    for (let index = 0; index < input.length; index += 1) {
      const selectedSense = input[index].candidateSenses.find((sense) => sense.senseId === output[index].meaningReferenceSenseId);
      assert(selectedSense?.iliId, `${output[index].entryId}: selected sense has no ILI.`);
      selectedSenseById.set(output[index].entryId, selectedSense);
      inputById.set(output[index].entryId, input[index]);
      generated.push(output[index]);
    }
  }
  assert(generated.length === expectedEntries, `${level} learner entries are incomplete.`);
  const originalContentSha256 = sha256(canonicalJson(generated));
  let corrections = null;
  if (correctionsPath) {
    corrections = JSON.parse(readFileSync(correctionsPath, 'utf8'));
    assert(corrections.notHumanReview === true, 'Translation corrections must be marked notHumanReview.');
    const applicable = corrections.entries.filter((entry) => entry.level === level || corrections.level === level);
    const byId = new Map(applicable.filter((entry) => entry.replacementDefinition || entry.replacementExample || entry.replacementMeaningReferenceSenseId)
      .map((entry) => [entry.entryId, entry]));
    let applied = 0;
    for (let index = 0; index < generated.length; index += 1) {
      const correction = byId.get(generated[index].entryId);
      if (!correction) continue;
      generated[index] = {
        ...generated[index],
        meaningReferenceSenseId: correction.replacementMeaningReferenceSenseId ?? generated[index].meaningReferenceSenseId,
        definition: correction.replacementDefinition ?? generated[index].definition,
        example: correction.replacementExample ?? generated[index].example,
      };
      if (correction.replacementMeaningReferenceSenseId) {
        const replacementSense = inputById.get(generated[index].entryId).candidateSenses
          .find((sense) => sense.senseId === correction.replacementMeaningReferenceSenseId);
        assert(replacementSense?.iliId, `${generated[index].entryId}: replacement sense is not a supplied ILI candidate.`);
        selectedSenseById.set(generated[index].entryId, replacementSense);
      }
      applied += 1;
    }
    assert(applied === byId.size, `${level} correction sidecar contains unknown entry IDs.`);
  }
  const contentSha256 = sha256(canonicalJson(generated));
  const byIli = new Map();
  for (const entry of generated) {
    const sense = selectedSenseById.get(entry.entryId);
    const members = byIli.get(sense.iliId) ?? [];
    members.push({
      entryId: entry.entryId,
      term: entry.term,
      partOfSpeech: entry.partOfSpeech,
      level: entry.level,
      definition: entry.definition,
      example: entry.example,
      selectedSenseId: entry.meaningReferenceSenseId,
    });
    byIli.set(sense.iliId, members);
  }
  const groups = [...byIli].map(([iliId, members]) => {
    members.sort((left, right) => left.entryId.localeCompare(right.entryId));
    assert(new Set(members.map((member) => member.partOfSpeech)).size === 1, `${iliId}: shared ILI has multiple parts of speech.`);
    const group = {
      groupId: `es-sk:${level.toLowerCase()}:${iliId}`,
      notHumanReview: true,
      iliId,
      partOfSpeech: members[0].partOfSpeech,
      members,
    };
    return { ...group, sharedHintRisk: analyzeSharedHintRisk(group) };
  }).sort((left, right) => left.groupId.localeCompare(right.groupId));
  return { manifest, generated, groups, originalContentSha256, contentSha256, correctionsPath, corrections };
}

function prepareBatches(directory, prefix, groups, level) {
  mkdirSync(directory, { recursive: true });
  const promptPath = resolve(directory, 'PROMPT.txt');
  const schemaPath = resolve(directory, 'output.schema.json');
  const prompt = promptForLevel(level);
  const outputSchema = structuredClone(OUTPUT_SCHEMA);
  outputSchema.title = `Wordfold Spanish ${level} grouped Slovak translation`;
  writeImmutable(promptPath, `${prompt}\n`);
  writeImmutable(schemaPath, canonicalJson(outputSchema));
  const batches = [];
  for (let offset = 0; offset < groups.length; offset += BATCH_SIZE) {
    const batchGroups = groups.slice(offset, offset + BATCH_SIZE);
    const batchNumber = batches.length + 1;
    const base = `${prefix}-${String(batchNumber).padStart(3, '0')}`;
    const inputPath = resolve(directory, `${base}.input.json`);
    const outputPath = resolve(directory, `${base}.output.json`);
    const checkpointPath = resolve(directory, `${base}.checkpoint.json`);
    const inputText = canonicalJson(batchGroups);
    writeImmutable(inputPath, inputText);
    batches.push({ batchNumber, groupCount: batchGroups.length, entryCount: batchGroups.reduce((sum, group) => sum + group.members.length, 0), groupIds: batchGroups.map((group) => group.groupId), inputPath, inputSha256: sha256(inputText), outputPath, checkpointPath });
  }
  return { promptPath, schemaPath, batches, prompt, outputSchema };
}

function commonManifest(source, run, scope) {
  return {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'prepared',
    scope,
    courseId: 'es-sk',
    level: source.manifest.level,
    sourceLearnerContent: {
      path: source.manifestPath,
      manifestSha256: sha256File(source.manifestPath),
      runIdentitySha256: source.manifest.runIdentitySha256,
      originalContentSha256: source.originalContentSha256,
      contentSha256: source.contentSha256,
      entryCount: source.generated.length,
      corrections: source.correctionsPath ? { path: source.correctionsPath, sha256: sha256File(source.correctionsPath) } : null,
      immutable: true,
    },
    grouping: {
      key: 'selected OMW sense ILI',
      behavior: 'One Slovak hint per selected-sense concept, with member overrides when the same ILI does not support one natural Slovak hint.',
    },
    model: MODEL,
    prompt: { path: run.promptPath, sha256: sha256(`${run.prompt}\n`) },
    outputSchema: { path: run.schemaPath, sha256: sha256(canonicalJson(run.outputSchema)) },
    batchSize: BATCH_SIZE,
    batches: run.batches,
  };
}

function preparePilot(options) {
  const source = buildTranslationGroups(options.learnerManifestPath, options.level, options.correctionsPath);
  source.manifestPath = options.learnerManifestPath;
  const slug = options.level.toLowerCase();
  const seedSha256 = sha256(`${source.contentSha256}\u0000${slug}-slovak-translation-pilot-v1`);
  const sample = selectPilotGroups(source.groups, seedSha256, PILOT_GROUPS, `${slug}-slovak-translation-pilot-v1`);
  const run = prepareBatches(options.pilotDirectory, 'pilot', sample.selected, options.level);
  const manifest = {
    ...commonManifest(source, run, '100-group-pilot'),
    population: populationSummary(source.groups),
    pilot: {
      groupCount: PILOT_GROUPS,
      seedSha256,
      method: 'Proportional by singleton/shared plus part of speech; SHA-256 ranking within each stratum.',
      populations: sample.populations,
      allocation: sample.allocation,
      groupIds: sample.selected.map((group) => group.groupId),
    },
    projection: { tokens: source.generated.length * A1_TOKENS_PER_ENTRY, basis: `${A1_TOKENS_PER_ENTRY} A1 translation tokens per source entry` },
  };
  manifest.runIdentitySha256 = sha256(canonicalJson({ ...manifest, status: undefined }));
  writeFileAtomic(resolve(options.pilotDirectory, 'manifest.json'), canonicalJson(manifest));
  console.log(canonicalJson({ manifest: resolve(options.pilotDirectory, 'manifest.json'), population: manifest.population, pilot: manifest.pilot }));
}

function populationSummary(groups) {
  const shared = groups.filter((group) => group.members.length > 1);
  return {
    entries: groups.reduce((sum, group) => sum + group.members.length, 0),
    groups: groups.length,
    sharedGroups: shared.length,
    entriesInSharedGroups: shared.reduce((sum, group) => sum + group.members.length, 0),
    divergenceGate: summarizeSharedHintRisk(groups),
  };
}

function validateHint(value, label) {
  assert(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 100,
    `${label}: Slovak hint must be 1-100 characters.`);
  assert(!/[\r\n\t]/u.test(value), `${label}: Slovak hint must be one line.`);
  assert(value.split(/\s+/u).length <= 12, `${label}: Slovak hint must contain at most 12 words.`);
}

export function validateOutput(input, output) {
  assert(Array.isArray(output) && output.length === input.length, 'Translation output length mismatch.');
  const assessments = new Set(['not-applicable', 'override-required', 'false-positive-candidate', 'unresolved']);
  const confidences = new Set(['high', 'medium', 'low']);
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
      assert(typeof override.rationale === 'string' && override.rationale.trim(), `${expected.groupId}: override rationale is required.`);
    }
    assert(assessments.has(actual.sharedHintRiskAssessment), `${expected.groupId}: invalid shared-hint risk assessment.`);
    assert(confidences.has(actual.confidence), `${expected.groupId}: invalid confidence.`);
    assert(typeof actual.needsReview === 'boolean' && typeof actual.reviewNote === 'string', `${expected.groupId}: invalid review fields.`);
    assert(actual.needsReview ? actual.reviewNote.trim().length > 0 : actual.reviewNote === '', `${expected.groupId}: review note does not match needsReview.`);
    if (expected.sharedHintRisk.flagged) {
      assert(actual.sharedHintRiskAssessment !== 'not-applicable', `${expected.groupId}: flagged group was not assessed.`);
      if (actual.sharedHintRiskAssessment === 'override-required') assert(actual.memberOverrides.length > 0, `${expected.groupId}: override assessment requires an override.`);
      if (actual.sharedHintRiskAssessment === 'false-positive-candidate') {
        assert(actual.memberOverrides.length === 0 && actual.needsReview, `${expected.groupId}: false-positive candidate must use the needsReview fallback.`);
        assert(actual.reviewNote.startsWith('gate-false-positive-candidate:'), `${expected.groupId}: false-positive rationale prefix is missing.`);
      }
      if (actual.sharedHintRiskAssessment === 'unresolved') assert(actual.needsReview, `${expected.groupId}: unresolved gate requires needsReview.`);
    } else {
      assert(actual.sharedHintRiskAssessment === 'not-applicable', `${expected.groupId}: unflagged group must be not-applicable.`);
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

function addUsageAttempt(previous, current) {
  const attempts = [...(previous?.attempts ?? (previous ? [{ ...previous, attempts: undefined }] : [])), current];
  return {
    batchNumber: current.batchNumber,
    source: attempts.length === 1 ? current.source : `Aggregate of ${attempts.length} Codex attempts`,
    inputTokens: attempts.reduce((sum, attempt) => sum + attempt.inputTokens, 0),
    cachedInputTokens: attempts.reduce((sum, attempt) => sum + (attempt.cachedInputTokens ?? 0), 0),
    outputTokens: attempts.reduce((sum, attempt) => sum + attempt.outputTokens, 0),
    totalTokens: attempts.reduce((sum, attempt) => sum + attempt.totalTokens, 0),
    attempts,
  };
}

function normalizeProviderEntries(entries) {
  return entries.map((entry) => ({
    ...entry,
    // reviewNote is reserved for an active needsReview fallback. Providers
    // sometimes duplicate an override rationale here even though the group
    // already has an explicit, validated member override.
    reviewNote: entry.needsReview ? entry.reviewNote : '',
  }));
}

function generateDirectory(directory) {
  const manifestPath = resolve(directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert(manifest.notHumanReview === true && LEVEL_COUNTS[manifest.level], 'Invalid translation manifest.');
  assert(sha256File(manifest.sourceLearnerContent.path) === manifest.sourceLearnerContent.manifestSha256,
    `${manifest.level} learner manifest changed after translation preparation.`);
  const usagePath = resolve(directory, 'usage.json');
  const usageByBatch = new Map();
  if (existsSync(usagePath)) {
    for (const item of JSON.parse(readFileSync(usagePath, 'utf8')).batches ?? []) usageByBatch.set(item.batchNumber, item);
  }
  const prompt = readFileSync(manifest.prompt.path, 'utf8');
  for (const batch of manifest.batches) {
    let retryReason = null;
    if (existsSync(batch.checkpointPath) && existsSync(batch.outputPath)) {
      const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, 'utf8'));
      if (checkpoint.status === 'valid' && checkpoint.inputSha256 === batch.inputSha256
        && checkpoint.outputSha256 === sha256File(batch.outputPath)) {
        console.log(`Batch ${batch.batchNumber}: valid checkpoint, skipped.`);
        continue;
      }
      retryReason = checkpoint.error ?? null;
    }
    const inputText = readFileSync(batch.inputPath, 'utf8');
    assert(sha256(inputText) === batch.inputSha256, `Batch ${batch.batchNumber}: input hash mismatch.`);
    const temporaryOutput = `${batch.outputPath}.tmp-${process.pid}-${randomUUID()}`;
    const retryInstruction = retryReason ? `\nA previous attempt failed validation: ${retryReason}\nReturn a fresh complete batch that corrects that failure.\n` : '';
    const task = `${prompt}\nProcess this complete batch in order.${retryInstruction}\nBATCH INPUT:\n${inputText}`;
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
      providerOutput.entries = normalizeProviderEntries(providerOutput.entries);
      const input = JSON.parse(inputText);
      const outputText = canonicalJson(providerOutput.entries);
      const attemptUsage = usageFromEvents(execution.stdout, batch.batchNumber);
      usageByBatch.set(batch.batchNumber, addUsageAttempt(usageByBatch.get(batch.batchNumber), attemptUsage));
      writeUsage(usagePath, usageByBatch.values());
      try {
        validateOutput(input, providerOutput.entries);
      } catch (error) {
        writeFileAtomic(batch.outputPath, outputText);
        writeFileAtomic(batch.checkpointPath, canonicalJson({
          schemaVersion: 1,
          notHumanReview: true,
          status: 'invalid',
          runIdentitySha256: manifest.runIdentitySha256,
          batchNumber: batch.batchNumber,
          inputSha256: batch.inputSha256,
          outputSha256: sha256(outputText),
          error: error.message,
          usage: usageByBatch.get(batch.batchNumber),
        }));
        throw error;
      }
      writeFileAtomic(batch.outputPath, outputText);
      writeFileAtomic(batch.checkpointPath, canonicalJson({
        schemaVersion: 1,
        notHumanReview: true,
        status: 'valid',
        runIdentitySha256: manifest.runIdentitySha256,
        batchNumber: batch.batchNumber,
        inputSha256: batch.inputSha256,
        outputSha256: sha256(outputText),
        model: manifest.model,
        usage: usageByBatch.get(batch.batchNumber),
      }));
      console.log(`Batch ${batch.batchNumber}: valid.`);
    } finally {
      if (existsSync(temporaryOutput)) unlinkSync(temporaryOutput);
    }
  }
}

function readCompletedRecords(manifest) {
  const records = [];
  for (const batch of manifest.batches) {
    assert(existsSync(batch.outputPath), `Missing translation output: ${batch.outputPath}`);
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    validateOutput(input, output);
    for (let index = 0; index < input.length; index += 1) records.push({ input: input[index], output: output[index] });
  }
  return records;
}

function outcomeSummary(records) {
  const flagged = records.filter(({ input }) => input.sharedHintRisk.flagged);
  return {
    flaggedGroups: flagged.length,
    overrides: flagged.filter(({ output }) => output.sharedHintRiskAssessment === 'override-required').length,
    falsePositiveCandidates: flagged.filter(({ output }) => output.sharedHintRiskAssessment === 'false-positive-candidate').length,
    unresolved: flagged.filter(({ output }) => output.sharedHintRiskAssessment === 'unresolved').length,
    needsReview: flagged.filter(({ output }) => output.needsReview).length,
  };
}

function analyzePilot(options) {
  const manifestPath = resolve(options.pilotDirectory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const records = readCompletedRecords(manifest);
  assert(records.length === PILOT_GROUPS, 'Expected 100 completed pilot groups.');
  const usage = JSON.parse(readFileSync(resolve(options.pilotDirectory, 'usage.json'), 'utf8')).totals;
  const sourceEntries = records.reduce((sum, record) => sum + record.input.members.length, 0);
  const summary = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'complete',
    level: options.level,
    groups: records.length,
    sourceEntries,
    sharedHintGate: outcomeSummary(records),
    usage: {
      ...usage,
      tokensPerGroup: usage.totalTokens / records.length,
      tokensPerSourceEntry: usage.totalTokens / sourceEntries,
      a1BaselineTokensPerEntry: A1_TOKENS_PER_ENTRY,
    },
  };
  writeFileAtomic(resolve(options.pilotDirectory, 'pilot-summary.json'), canonicalJson(summary));
  console.log(canonicalJson(summary));
}

function prepareRemaining(options) {
  const source = buildTranslationGroups(options.learnerManifestPath, options.level, options.correctionsPath);
  source.manifestPath = options.learnerManifestPath;
  const pilotManifestPath = resolve(options.pilotDirectory, 'manifest.json');
  const pilotSummaryPath = resolve(options.pilotDirectory, 'pilot-summary.json');
  const pilotManifest = JSON.parse(readFileSync(pilotManifestPath, 'utf8'));
  const pilotSummary = JSON.parse(readFileSync(pilotSummaryPath, 'utf8'));
  assert(pilotSummary.status === 'complete', 'The 100-group pilot must validate before remaining generation is prepared.');
  const pilotIds = new Set(pilotManifest.pilot.groupIds);
  const remaining = source.groups.filter((group) => !pilotIds.has(group.groupId));
  assert(remaining.length === source.groups.length - PILOT_GROUPS, 'Remaining group partition is inconsistent.');
  const run = prepareBatches(options.outputDirectory, 'remaining', remaining, options.level);
  const manifest = {
    ...commonManifest(source, run, 'remaining-after-100-group-pilot'),
    population: populationSummary(source.groups),
    pilot: {
      manifestPath: pilotManifestPath,
      manifestSha256: sha256File(pilotManifestPath),
      summaryPath: pilotSummaryPath,
      summarySha256: sha256File(pilotSummaryPath),
      usagePath: resolve(options.pilotDirectory, 'usage.json'),
      groupIds: [...pilotIds],
    },
    remaining: {
      groups: remaining.length,
      sourceEntries: remaining.reduce((sum, group) => sum + group.members.length, 0),
      batches: run.batches.length,
    },
    projection: { tokens: source.generated.length * A1_TOKENS_PER_ENTRY, basis: `${A1_TOKENS_PER_ENTRY} A1 translation tokens per source entry` },
  };
  manifest.runIdentitySha256 = sha256(canonicalJson({ ...manifest, status: undefined }));
  writeFileAtomic(resolve(options.outputDirectory, 'manifest.json'), canonicalJson(manifest));
  console.log(canonicalJson({ manifest: resolve(options.outputDirectory, 'manifest.json'), remaining: manifest.remaining, population: manifest.population }));
}

function addUsage(left, right) {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function tsvCell(value) {
  const normalized = String(value ?? '').replace(/[\r\n\t]+/gu, ' ').trim();
  return /["\t\n]/u.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

function reviewTsv(records, prefix) {
  const header = [
    'reviewItemId', 'groupId', 'spanishTerm', 'pos', 'spanishDefinition', 'proposedSlovakHint',
    'criticalError', 'materialError', 'verdict', 'notes',
  ];
  const rows = records.map((record, index) => {
    const overrideById = new Map(record.output.memberOverrides.map((override) => [override.entryId, override.slovakHint]));
    const terms = record.input.members.map((member) => member.term).join(' / ');
    const definitions = record.input.members.map((member) => `${member.term}: ${member.definition}`).join(' | ');
    const hints = record.input.members.map((member) => `${member.term}: ${overrideById.get(member.entryId) ?? record.output.slovakHint}`).join(' | ');
    return [
      `${prefix}-${String(index + 1).padStart(3, '0')}`,
      record.input.groupId,
      terms,
      record.input.partOfSpeech,
      definitions,
      hints,
      '', '', '', '',
    ];
  });
  return `${[header, ...rows].map((row) => row.map(tsvCell).join('\t')).join('\n')}\n`;
}

function prepareOwnerReview(records, manifest, outputDirectory) {
  const groups = records.map((record) => record.input);
  const recordById = new Map(records.map((record) => [record.input.groupId, record]));
  const slug = manifest.level.toLowerCase();
  const seedSha256 = sha256(`${manifest.runIdentitySha256}\u0000${slug}-slovak-owner-probability-sample-v1`);
  const selected = selectPilotGroups(groups, seedSha256, OWNER_SAMPLE_SIZE, `${slug}-slovak-owner-probability-sample-v1`);
  const probabilityIds = new Set(selected.selected.map((group) => group.groupId));
  const probabilityRecords = selected.selected.map((group) => recordById.get(group.groupId));
  const targetedRecords = records.filter((record) => record.input.sharedHintRisk.flagged && !probabilityIds.has(record.input.groupId));
  mkdirSync(outputDirectory, { recursive: true });
  const probabilityPath = resolve(outputDirectory, 'probability-sample-300.tsv');
  const targetedPath = resolve(outputDirectory, 'targeted-shared-hint-findings.tsv');
  writeFileAtomic(probabilityPath, reviewTsv(probabilityRecords, `SK-${manifest.level}-P`));
  writeFileAtomic(targetedPath, reviewTsv(targetedRecords, `SK-${manifest.level}-T`));
  const reviewManifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'awaiting-native-owner-review',
    level: manifest.level,
    sourceTranslationRunIdentitySha256: manifest.runIdentitySha256,
    policy: {
      A1: '100% native-owner review.',
      A2ThroughC1: 'Probability sample plus separately reported targeted findings.',
      productCopy: 'A1 Slovak hints reviewed by a native speaker; A2-C1 sampled.',
      criticalErrorMaximumRate: 0.02,
      materialErrorMaximumRate: 0.05,
      denominator: 'The 300-row probability sample only. Targeted findings are excluded unless independently selected into the probability sample.',
      escalation: `If either bound is crossed, expand the probability sample or require 100% review for ${manifest.level}.`,
      a1SlovakOwnerDisagreementBaseline: 'pending-completion-of-full-A1-owner-review',
      unrelatedMetric: 'The A1 3.33% Spanish external-reference non-correspondence rate is not a Slovak owner-disagreement baseline.',
    },
    probabilitySample: {
      size: probabilityRecords.length,
      seedSha256,
      method: 'Proportional by singleton/shared plus part of speech; SHA-256 ranking within each stratum.',
      populations: selected.populations,
      allocation: selected.allocation,
      path: probabilityPath,
      sha256: sha256File(probabilityPath),
    },
    targetedFindings: {
      excludedFromProbabilityDenominator: true,
      overlapAssignedToProbabilitySample: records.filter((record) => record.input.sharedHintRisk.flagged && probabilityIds.has(record.input.groupId)).length,
      additionalRows: targetedRecords.length,
      path: targetedPath,
      sha256: sha256File(targetedPath),
    },
  };
  const manifestPath = resolve(outputDirectory, 'manifest.json');
  writeFileAtomic(manifestPath, canonicalJson(reviewManifest));
  return { manifestPath, probabilityPath, targetedPath, reviewManifest };
}

function analyze(options) {
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const remainingRecords = readCompletedRecords(manifest);
  const pilotManifest = JSON.parse(readFileSync(manifest.pilot.manifestPath, 'utf8'));
  const pilotRecords = readCompletedRecords(pilotManifest);
  const records = [...pilotRecords, ...remainingRecords];
  assert(new Set(records.map((record) => record.input.groupId)).size === manifest.population.groups,
    `Combined ${options.level} translation groups are incomplete or duplicated.`);
  const expectedEntries = LEVEL_COUNTS[options.level];
  assert(records.reduce((sum, record) => sum + record.input.members.length, 0) === expectedEntries,
    `Combined ${options.level} translation source entries changed.`);
  const pilotUsage = JSON.parse(readFileSync(manifest.pilot.usagePath, 'utf8')).totals;
  const remainingUsage = JSON.parse(readFileSync(resolve(options.outputDirectory, 'usage.json'), 'utf8')).totals;
  const usage = addUsage(pilotUsage, remainingUsage);
  const ownerReview = prepareOwnerReview(records, manifest, options.ownerReviewDirectory);
  const summary = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'complete-awaiting-sampled-native-owner-review',
    level: options.level,
    population: manifest.population,
    sharedHintGate: outcomeSummary(records),
    usage: {
      pilot: pilotUsage,
      remaining: remainingUsage,
      cumulative: usage,
      tokensPerSourceEntry: usage.totalTokens / expectedEntries,
      a1BaselineTokensPerEntry: A1_TOKENS_PER_ENTRY,
      projectionTokens: expectedEntries * A1_TOKENS_PER_ENTRY,
      differenceFromProjection: usage.totalTokens - expectedEntries * A1_TOKENS_PER_ENTRY,
    },
    ownerReview: {
      manifestPath: ownerReview.manifestPath,
      manifestSha256: sha256File(ownerReview.manifestPath),
      probabilityRows: ownerReview.reviewManifest.probabilitySample.size,
      additionalTargetedRows: ownerReview.reviewManifest.targetedFindings.additionalRows,
      a1SlovakBaseline: 'pending',
    },
    stopGate: 'Not distributable until the unresolved UCLouvain ShareAlike question is resolved.',
  };
  const summaryPath = resolve(options.outputDirectory, 'summary.json');
  writeFileAtomic(summaryPath, canonicalJson(summary));
  console.log(canonicalJson({ summaryPath, summary }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'prepare-pilot') preparePilot(options);
    else if (options.command === 'generate-pilot') generateDirectory(options.pilotDirectory);
    else if (options.command === 'analyze-pilot') analyzePilot(options);
    else if (options.command === 'prepare-remaining') prepareRemaining(options);
    else if (options.command === 'generate-remaining') generateDirectory(options.outputDirectory);
    else analyze(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
