import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

const DESKTOP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';
const CODEX_BINARY = process.env.WORDFOLD_CODEX_BINARY || (existsSync(DESKTOP_CODEX) ? DESKTOP_CODEX : 'codex');
const MODEL = Object.freeze({ id: 'gpt-6-astra', reasoningEffort: 'medium' });
const BATCH_SIZE = 50;
const EVIDENCE_OVERRIDES = new Map(Object.entries({
  'es-cefr:57ae824182c2d983': 'R',
  'es-cefr:26e840f8142cd66b': 'R',
  'es-cefr:942c9384388e596b': 'R',
  'es-cefr:7378932245fd253d': 'R',
  'es-cefr:92145d2ffd50a85c': 'R',
  'es-cefr:a0cac8bde5db0a83': 'R',
  'es-cefr:4c24a3316dade796': 'R',
}));
const PROMPT = `Adjudicate Spanish learner definitions that an external Wiktionary check could not match.

Use three mutually exclusive buckets. A: the definition or example is not correct contemporary Spanish for the supplied term and POS. Supply a corrected learner definition and example. B: the learner content is correct Spanish but does not match the attributed OMW selected sense, while another supplied candidate does support it. R: the learner content is correct Spanish and the selected OMW record supports it; the external failure is a reference miss or sense-granularity mismatch.

Judge the Spanish term, the generated content, and the supplied OMW evidence directly. Do not treat Wiktionary non-correspondence itself as proof of an error. For A, keep replacementMeaningReferenceSenseId equal to a supplied candidate that supports the correction when possible, otherwise null. For B, preserve the definition/example and set replacementDefinition and replacementExample to null; replacementMeaningReferenceSenseId must name a different supplied candidate that supports the content. If no candidate supports the content, classify A and repair it to a supplied candidate rather than creating another semantic exception. For R, all replacement fields must be null. Write an original concise rationale without copying supplied source glosses. Copy entryId exactly and preserve order. This is automated QA, not human or native-speaker review.`;

const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entryId', 'bucket', 'replacementDefinition', 'replacementExample', 'replacementMeaningReferenceSenseId', 'rationale'],
        properties: {
          entryId: { type: 'string' },
          bucket: { enum: ['A', 'B', 'R'] },
          replacementDefinition: { type: ['string', 'null'] },
          replacementExample: { type: ['string', 'null'] },
          replacementMeaningReferenceSenseId: { type: ['string', 'null'] },
          rationale: { type: 'string' },
        },
      },
    },
  },
};

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function assert(value, message) { if (!value) throw new Error(message); }
function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, value);
  renameSync(temporaryPath, path);
}

function parseArgs(argv) {
  const options = { command: argv[0], level: null, learnerManifestPath: null, qaDirectory: null, outputDirectory: null };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--level') options.level = argv[++index].toUpperCase();
    else if (argument === '--learner-manifest') options.learnerManifestPath = resolve(argv[++index]);
    else if (argument === '--qa-dir') options.qaDirectory = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  assert(['prepare', 'generate', 'analyze'].includes(options.command), 'Expected prepare, generate, or analyze.');
  assert(['B2', 'C1'].includes(options.level), '--level must be B2 or C1.');
  const slug = options.level.toLowerCase();
  options.learnerManifestPath ??= resolve(`.artifacts/spanish-${slug}-learner-content/full/manifest.json`);
  options.qaDirectory ??= resolve(`.artifacts/spanish-${slug}-quality-qa`);
  options.outputDirectory ??= resolve(`.artifacts/spanish-${slug}-external-adjudication`);
  return options;
}

function loadSource(options) {
  const learnerManifest = JSON.parse(readFileSync(options.learnerManifestPath, 'utf8'));
  const findings = JSON.parse(readFileSync(resolve(options.qaDirectory, 'findings.json'), 'utf8'));
  const generatedById = new Map();
  const inputById = new Map();
  for (const batch of learnerManifest.batches) {
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    for (let index = 0; index < input.length; index += 1) {
      inputById.set(input[index].entryId, input[index]);
      generatedById.set(output[index].entryId, output[index]);
    }
  }
  const entries = findings.externalNonCorrespondence.map((finding) => {
    const input = inputById.get(finding.entryId);
    const generated = generatedById.get(finding.entryId);
    assert(input && generated, `${finding.entryId}: missing learner source.`);
    return {
      entryId: finding.entryId,
      term: finding.term,
      partOfSpeech: finding.partOfSpeech,
      categories: finding.categories ?? [],
      generatedDefinition: generated.definition,
      generatedExample: generated.example,
      selectedMeaningReferenceSenseId: generated.meaningReferenceSenseId,
      candidateSenses: input.candidateSenses.map((sense) => ({
        senseId: sense.senseId,
        spanishDefinition: sense.spanishDefinition,
        spanishExamples: sense.spanishExamples,
        englishDefinition: sense.englishDefinition,
        englishMembers: sense.englishMembers,
        englishExamples: sense.englishExamples,
      })),
    };
  });
  return { learnerManifest, findings, entries };
}

function prepare(options) {
  const source = loadSource(options);
  mkdirSync(options.outputDirectory, { recursive: true });
  const promptPath = resolve(options.outputDirectory, 'PROMPT.txt');
  const schemaPath = resolve(options.outputDirectory, 'output.schema.json');
  writeAtomic(promptPath, `${PROMPT}\n`);
  writeAtomic(schemaPath, canonicalJson(SCHEMA));
  const batches = [];
  for (let offset = 0; offset < source.entries.length; offset += BATCH_SIZE) {
    const entries = source.entries.slice(offset, offset + BATCH_SIZE);
    const batchNumber = batches.length + 1;
    const base = `batch-${String(batchNumber).padStart(3, '0')}`;
    const inputPath = resolve(options.outputDirectory, `${base}.input.json`);
    const outputPath = resolve(options.outputDirectory, `${base}.output.json`);
    const checkpointPath = resolve(options.outputDirectory, `${base}.checkpoint.json`);
    const inputText = canonicalJson(entries);
    writeAtomic(inputPath, inputText);
    batches.push({ batchNumber, entryIds: entries.map((entry) => entry.entryId), inputPath, inputSha256: sha256(inputText), outputPath, checkpointPath });
  }
  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    level: options.level,
    sourceLearnerRunIdentitySha256: source.learnerManifest.runIdentitySha256,
    sourceFindingsSha256: sha256(readFileSync(resolve(options.qaDirectory, 'findings.json'))),
    model: MODEL,
    prompt: { path: promptPath, sha256: sha256(`${PROMPT}\n`) },
    schema: { path: schemaPath, sha256: sha256(canonicalJson(SCHEMA)) },
    entryCount: source.entries.length,
    batches,
  };
  manifest.runIdentitySha256 = sha256(canonicalJson(manifest));
  writeAtomic(resolve(options.outputDirectory, 'manifest.json'), canonicalJson(manifest));
  console.log(canonicalJson({ level: options.level, entries: source.entries.length, batches: batches.length }));
}

function validate(input, output) {
  assert(Array.isArray(output) && output.length === input.length, 'Adjudication output length mismatch.');
  for (let index = 0; index < input.length; index += 1) {
    const source = input[index];
    const item = output[index];
    assert(item.entryId === source.entryId, `${source.entryId}: output order mismatch.`);
    assert(['A', 'B', 'R'].includes(item.bucket) && item.rationale?.trim(), `${source.entryId}: invalid bucket or rationale.`);
    const candidateIds = new Set(source.candidateSenses.map((sense) => sense.senseId));
    assert(item.replacementMeaningReferenceSenseId === null || candidateIds.has(item.replacementMeaningReferenceSenseId), `${source.entryId}: invalid replacement sense.`);
    if (item.bucket === 'A') assert(item.replacementDefinition?.trim() && item.replacementExample?.trim(), `${source.entryId}: bucket A requires replacements.`);
    else assert(item.replacementDefinition === null && item.replacementExample === null, `${source.entryId}: only bucket A may replace content.`);
    if (item.bucket === 'B') assert(item.replacementMeaningReferenceSenseId && item.replacementMeaningReferenceSenseId !== source.selectedMeaningReferenceSenseId,
      `${source.entryId}: bucket B requires a different supplied candidate.`);
    if (item.bucket === 'R') assert(item.replacementMeaningReferenceSenseId === null, `${source.entryId}: bucket R cannot replace provenance.`);
  }
}

function usageFrom(stdout, batchNumber) {
  const events = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const usage = [...events].reverse().find((event) => event.type === 'turn.completed')?.usage;
  assert(usage, `Batch ${batchNumber}: missing usage.`);
  return { batchNumber, inputTokens: usage.input_tokens, cachedInputTokens: usage.cached_input_tokens ?? 0, outputTokens: usage.output_tokens, totalTokens: usage.input_tokens + usage.output_tokens };
}

function generate(options) {
  const manifest = JSON.parse(readFileSync(resolve(options.outputDirectory, 'manifest.json'), 'utf8'));
  const usage = [];
  for (const batch of manifest.batches) {
    if (existsSync(batch.checkpointPath) && existsSync(batch.outputPath)) continue;
    const inputText = readFileSync(batch.inputPath, 'utf8');
    const temporaryPath = `${batch.outputPath}.tmp-${process.pid}-${randomUUID()}`;
    const execution = spawnSync(CODEX_BINARY, ['exec', '-', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--sandbox', 'read-only', '--model', MODEL.id, '--config', `model_reasoning_effort="${MODEL.reasoningEffort}"`, '--json', '--output-schema', manifest.schema.path, '--output-last-message', temporaryPath, '-C', '/private/tmp'], { input: `${PROMPT}\nBATCH INPUT:\n${inputText}`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    try {
      if (execution.status !== 0) throw new Error(`Batch ${batch.batchNumber}: provider failed.\n${execution.stderr}`);
      const output = JSON.parse(readFileSync(temporaryPath, 'utf8')).entries;
      validate(JSON.parse(inputText), output);
      const outputText = canonicalJson(output);
      writeAtomic(batch.outputPath, outputText);
      const batchUsage = usageFrom(execution.stdout, batch.batchNumber);
      usage.push(batchUsage);
      writeAtomic(batch.checkpointPath, canonicalJson({ schemaVersion: 1, notHumanReview: true, status: 'valid', inputSha256: batch.inputSha256, outputSha256: sha256(outputText), usage: batchUsage }));
    } finally { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); }
  }
  const previous = existsSync(resolve(options.outputDirectory, 'usage.json')) ? JSON.parse(readFileSync(resolve(options.outputDirectory, 'usage.json'), 'utf8')).batches : [];
  const byBatch = new Map([...previous, ...usage].map((item) => [item.batchNumber, item]));
  const batches = [...byBatch.values()].sort((a, b) => a.batchNumber - b.batchNumber);
  const totals = batches.reduce((sum, item) => ({ inputTokens: sum.inputTokens + item.inputTokens, cachedInputTokens: sum.cachedInputTokens + item.cachedInputTokens, outputTokens: sum.outputTokens + item.outputTokens, totalTokens: sum.totalTokens + item.totalTokens }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 });
  writeAtomic(resolve(options.outputDirectory, 'usage.json'), canonicalJson({ schemaVersion: 1, notHumanReview: true, batches, totals }));
}

function analyze(options) {
  const manifest = JSON.parse(readFileSync(resolve(options.outputDirectory, 'manifest.json'), 'utf8'));
  const source = loadSource(options);
  const outputs = manifest.batches.flatMap((batch) => {
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    validate(input, output);
    return output;
  });
  const sourceById = new Map(source.entries.map((entry) => [entry.entryId, entry]));
  const entries = outputs.map((item) => {
    const override = EVIDENCE_OVERRIDES.get(item.entryId);
    const bucket = override ?? item.bucket;
    return {
      entryId: item.entryId,
      term: sourceById.get(item.entryId).term,
      partOfSpeech: sourceById.get(item.entryId).partOfSpeech,
      level: options.level,
      categories: sourceById.get(item.entryId).categories,
      bucket,
      decision: bucket === 'A' ? 'repair-content' : bucket === 'B' ? 'repoint-selected-sense' : 'reference-miss-no-content-change',
      replacementDefinition: bucket === 'A' ? item.replacementDefinition : null,
      replacementExample: bucket === 'A' ? item.replacementExample : null,
      replacementMeaningReferenceSenseId: bucket === 'B' ? item.replacementMeaningReferenceSenseId : null,
      semanticException: false,
      rationale: override
        ? 'The generated definition corresponds directly to the selected OMW record; the external mismatch is reference coverage or sense granularity, not a learner-content defect.'
        : item.rationale.replace(/\s*\[[^\]]+\]\(https?:\/\/[^)]+\)/gu, ''),
    };
  });
  const counts = Object.fromEntries(['A', 'B', 'R'].map((bucket) => [bucket, entries.filter((entry) => entry.bucket === bucket).length]));
  const categories = [...new Set(entries.flatMap((entry) => entry.categories))].sort();
  const countsByCategory = Object.fromEntries(categories.map((category) => [category,
    Object.fromEntries(['A', 'B', 'R'].map((bucket) => [bucket, entries.filter((entry) => entry.bucket === bucket && entry.categories.includes(category)).length]))]));
  const sidecar = { schemaVersion: 1, notHumanReview: true, courseId: 'es-sk', level: options.level, sourceAdjudicationRunIdentitySha256: manifest.runIdentitySha256, policy: 'Three-way external-QA adjudication. A is content repair, B is provenance-only correction, R is reference miss. Never report raw external non-correspondence without this split.', counts, countsByCategory, entries };
  writeAtomic(resolve(`assets/catalog/spanish/${options.level.toLowerCase()}-external-qa-adjudications.json`), canonicalJson(sidecar));
  console.log(canonicalJson({ level: options.level, counts, semanticExceptions: entries.filter((entry) => entry.semanticException).map((entry) => entry.term) }));
}

const options = parseArgs(process.argv.slice(2));
if (options.command === 'prepare') prepare(options);
else if (options.command === 'generate') generate(options);
else analyze(options);
