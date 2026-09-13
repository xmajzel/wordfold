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
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DESKTOP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';
const CODEX_BINARY = process.env.WORDFOLD_CODEX_BINARY || (existsSync(DESKTOP_CODEX) ? DESKTOP_CODEX : 'codex');
const MODEL = Object.freeze({ id: 'gpt-6-astra', reasoningEffort: 'medium' });
const BATCH_SIZE = 50;
const EXPECTED = Object.freeze({ queue: 2804, attention: 305, exactPass: 1247, nearMiss: 416, absent: 1141, tier2: 1557 });
const EXPECTED_ANALYSIS = Object.freeze({
  flagged: 117,
  correctSlovak: 5,
  selectedSenseCorrespondence: 80,
  naturalEverydayEquivalent: 110,
  registerAppropriate: 21,
  interPassSplits: 35,
  flaggedAttention: 36,
});
const QUEUE_HEADER = Object.freeze([
  'level', 'queueType', 'reviewItemId', 'groupId', 'spanishTerm', 'pos',
  'spanishDefinition', 'proposedSlovakHint', 'criticalError', 'materialError',
  'verdict', 'notes', 'attention',
]);
const DIMENSIONS = Object.freeze([
  'correctSlovak',
  'selectedSenseCorrespondence',
  'naturalEverydayEquivalent',
  'registerAppropriate',
]);
const VERDICTS = new Set(['pass', 'disagree', 'uncertain']);
const PROMPT = `You are an independent AI cross-reviewer of Spanish-to-Slovak learner hints for Wordfold.

Review each item using only the learner-facing Spanish term, part of speech, Spanish definition, and proposed Slovak hint supplied. The Spanish definition states the selected sense you must judge. You receive no source gloss, source synset or ILI, generator confidence, generation flags, reference-match status, or other review pass. Do not browse or use machine translation as a judge.

Return a separate verdict for every dimension:
- correctSlovak: pass only if the proposed hint is valid, intelligible Slovak wording.
- selectedSenseCorrespondence: pass only if the hint renders the specific sense expressed by the Spanish definition, not merely another meaning of the headword.
- naturalEverydayEquivalent: pass only if the hint is the most natural concise everyday Slovak equivalent for that sense; mark disagree for a materially less natural choice.
- registerAppropriate: pass only if formality, markedness, and domain register fit the Spanish sense.

Use disagree for a definite mismatch and uncertain only when the supplied learner-facing evidence is insufficient. Multi-member rows may contain member-specific hints; judge the complete row and mark a dimension disagree if any member fails it. Write one concise original rationale identifying the affected member and dimension when needed. Do not propose or copy replacement lemmas. Copy reviewItemId exactly and preserve input order. This is AI cross-review, not human or native bilingual review. Return only the requested JSON object.`;

const CORRECTION_PROMPT = `You are proposing corrected Slovak learner hints for Spanish vocabulary rows flagged by two prior AI cross-review passes.

Use only the supplied learner-facing Spanish term, part of speech, Spanish definition, current Slovak hint, dimension verdicts, and rationales. Do not browse, use machine translation, consult lexical databases, or derive wording from OMW-SK. You receive no OMW-SK lemmas or other lexical-reference evidence.

For every item, provide a correctedSlovakHint that directly and naturally expresses the selected sense in concise, intelligible, register-appropriate Slovak. The correction must address the supplied flagged dimensions. For multi-member rows, preserve explicit member assignments in the form "Spanish term: Slovak hint | Spanish term: Slovak hint". Do not add explanations inside the hint.

Write one concise original correctionRationale explaining what the correction changes and why. Copy reviewItemId exactly and preserve input order. Corrections are AI editorial judgment, not human or native bilingual review. Return only the requested JSON object.`;

const OUTPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Wordfold Spanish-Slovak blinded correspondence cross-review',
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['reviewItemId', ...DIMENSIONS, 'rationale'],
        properties: {
          reviewItemId: { type: 'string' },
          correctSlovak: { enum: [...VERDICTS] },
          selectedSenseCorrespondence: { enum: [...VERDICTS] },
          naturalEverydayEquivalent: { enum: [...VERDICTS] },
          registerAppropriate: { enum: [...VERDICTS] },
          rationale: { type: 'string' },
        },
      },
    },
  },
});

const CORRECTION_OUTPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Wordfold Spanish-Slovak flagged-row correction proposals',
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['reviewItemId', 'correctedSlovakHint', 'correctionRationale'],
        properties: {
          reviewItemId: { type: 'string' },
          correctedSlovakHint: { type: 'string' },
          correctionRationale: { type: 'string' },
        },
      },
    },
  },
});

const DEFAULTS = Object.freeze({
  queuePath: resolve('.artifacts/spanish-owner-review/outstanding-owner-review-queue.tsv'),
  queueManifestPath: resolve('.artifacts/spanish-owner-review/manifest.json'),
  omwArchivePath: resolve('.artifacts/spanish-source-archives/omw-sk-2.0.tar.xz'),
  wiktextractPath: resolve('.artifacts/spanish-a1-quality-qa/reference/es-extract.jsonl.gz'),
  outputDirectory: resolve('.artifacts/spanish-slovak-correspondence-qa'),
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

function writeAtomic(path, value) {
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

function parseArgs(argv) {
  const options = { command: argv[0], pass: null, fromBatch: 1, toBatch: Number.POSITIVE_INFINITY, ...DEFAULTS };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--queue') options.queuePath = resolve(argv[++index]);
    else if (argument === '--queue-manifest') options.queueManifestPath = resolve(argv[++index]);
    else if (argument === '--omw-sk') options.omwArchivePath = resolve(argv[++index]);
    else if (argument === '--wiktextract') options.wiktextractPath = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else if (argument === '--pass') options.pass = Number(argv[++index]);
    else if (argument === '--from') options.fromBatch = Number(argv[++index]);
    else if (argument === '--to') options.toBatch = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  assert(['prepare', 'generate', 'correct', 'analyze'].includes(options.command), 'Expected prepare, generate, correct, or analyze.');
  assert(options.pass === null || [1, 2].includes(options.pass), '--pass must be 1 or 2.');
  assert(Number.isInteger(options.fromBatch) && options.fromBatch > 0, '--from must be a positive integer.');
  assert(options.toBatch === Number.POSITIVE_INFINITY || (Number.isInteger(options.toBatch) && options.toBatch >= options.fromBatch), '--to must be >= --from.');
  return options;
}

function parseTsv(path) {
  const text = readFileSync(path, 'utf8');
  const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
  const header = lines.shift().split('\t');
  assert(header.join('\t') === QUEUE_HEADER.join('\t'), `Unexpected owner-review queue schema: ${header.join(', ')}.`);
  const rows = lines.filter(Boolean).map((line, index) => {
    const cells = line.split('\t');
    assert(cells.length === QUEUE_HEADER.length, `Queue row ${index + 1}: expected 13 columns.`);
    return Object.fromEntries(QUEUE_HEADER.map((column, columnIndex) => [column, cells[columnIndex]]));
  });
  assert(rows.length === EXPECTED.queue, `Expected ${EXPECTED.queue} owner-review rows; found ${rows.length}.`);
  assert(new Set(rows.map((row) => row.reviewItemId)).size === rows.length, 'Duplicate reviewItemId in owner-review queue.');
  assert(rows.filter((row) => row.attention).length === EXPECTED.attention, `Expected ${EXPECTED.attention} attention rows.`);
  return { text, rows };
}

function xmlDecode(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(\d+);/gu, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/giu, (_match, hexadecimal) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)));
}

function normalizeSlovak(value) {
  return value.normalize('NFKC').replaceAll('_', ' ').toLocaleLowerCase('sk').replace(/\s+/gu, ' ').trim();
}

function normalizeSpanish(value) {
  return value.normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/gu, ' ').trim();
}

export function parseOmwSlovakXml(xml) {
  const lemmasBySynset = new Map();
  for (const match of xml.matchAll(/<LexicalEntry\b[\s\S]*?<\/LexicalEntry>/gu)) {
    const entry = match[0];
    const lemmaMatch = entry.match(/<Lemma\b[^>]*\bwrittenForm="([^"]+)"/u);
    if (!lemmaMatch) continue;
    const lemma = normalizeSlovak(xmlDecode(lemmaMatch[1]));
    for (const senseMatch of entry.matchAll(/<Sense\b[^>]*\bsynset="([^"]+)"/gu)) {
      const synsetId = senseMatch[1];
      if (!lemmasBySynset.has(synsetId)) lemmasBySynset.set(synsetId, new Set());
      lemmasBySynset.get(synsetId).add(lemma);
    }
  }
  const lemmasByIli = new Map();
  for (const match of xml.matchAll(/<Synset\b[^>]*\bid="([^"]+)"[^>]*\bili="(i\d+)"[^>]*\/?\s*>/gu)) {
    const lemmas = lemmasBySynset.get(match[1]);
    if (!lemmas) continue;
    if (!lemmasByIli.has(match[2])) lemmasByIli.set(match[2], new Set());
    for (const lemma of lemmas) lemmasByIli.get(match[2]).add(lemma);
  }
  return lemmasByIli;
}

function loadOmwSlovak(path) {
  const archive = spawnSync('tar', ['-xOf', path, 'omw-sk/omw-sk.xml'], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  assert(archive.status === 0, `Could not read OMW Slovak XML: ${archive.stderr}`);
  return parseOmwSlovakXml(archive.stdout);
}

export function hintAtoms(proposedSlovakHint) {
  return memberHintAssignments(proposedSlovakHint).flatMap((assignment) => assignment.atoms);
}

function memberHintAssignments(proposedSlovakHint) {
  return proposedSlovakHint.split(' | ').map((memberHint) => {
    const separator = memberHint.indexOf(': ');
    const member = separator === -1 ? null : normalizeSpanish(memberHint.slice(0, separator));
    const hint = separator === -1 ? memberHint : memberHint.slice(separator + 2);
    return { member, atoms: hint.split(/\s*(?:;|\/)\s*/u).map(normalizeSlovak).filter(Boolean) };
  });
}

function selectedIli(row) {
  const match = row.groupId.match(/:(i\d+)$/u);
  assert(match, `${row.reviewItemId}: groupId does not end in an ILI.`);
  return match[1];
}

function classifyTier1(rows, lemmasByIli) {
  return rows.map((row) => {
    const ili = selectedIli(row);
    const listed = lemmasByIli.get(ili);
    const atoms = hintAtoms(row.proposedSlovakHint);
    assert(atoms.length > 0, `${row.reviewItemId}: proposed Slovak hint is empty.`);
    const matchingAtoms = listed ? atoms.filter((atom) => listed.has(atom)) : [];
    const cohort = !listed ? 'ili-absent' : matchingAtoms.length === atoms.length ? 'exact-pass' : 'ili-present-near-miss';
    return {
      reviewItemId: row.reviewItemId,
      groupId: row.groupId,
      level: row.level,
      ili,
      cohort,
      proposedHintAtomCount: atoms.length,
      exactListedAtomCount: matchingAtoms.length,
    };
  });
}

function compatibleWiktionaryPos(queuePos, wiktionaryPos) {
  return ({ adjective: 'adj', adverb: 'adv', noun: 'noun', verb: 'verb' })[queuePos] === wiktionaryPos;
}

async function wiktextractCoverage(path, rows, tier1ById) {
  const terms = new Set(rows.flatMap((row) => row.spanishTerm.split(' / ').map(normalizeSpanish)));
  const recordsByTerm = new Map();
  const stream = createReadStream(path).pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    const record = JSON.parse(line);
    const term = normalizeSpanish(record.word ?? '');
    if (!terms.has(term)) continue;
    if (!recordsByTerm.has(term)) recordsByTerm.set(term, []);
    recordsByTerm.get(term).push(record);
  }

  const results = rows.map((row) => {
    const members = row.spanishTerm.split(' / ').map(normalizeSpanish);
    const assignments = memberHintAssignments(row.proposedSlovakHint);
    const memberResults = members.map((member, index) => {
      const records = (recordsByTerm.get(member) ?? []).filter((record) => compatibleWiktionaryPos(row.pos, record.pos));
      const translations = records.flatMap((record) => record.translations ?? []).filter((translation) => translation.lang_code === 'sk');
      const assignment = assignments.find((candidate) => candidate.member === member) ?? assignments[index] ?? assignments[0];
      const atoms = assignment?.atoms ?? [];
      const translationByWord = new Map();
      for (const translation of translations) {
        const word = normalizeSlovak(translation.word ?? '');
        if (!translationByWord.has(word)) translationByWord.set(word, []);
        translationByWord.get(word).push(translation);
      }
      return {
        hasPair: translations.length > 0,
        exact: atoms.length > 0 && atoms.every((atom) => translationByWord.has(atom)),
        exactWithSenseIndex: atoms.length > 0 && atoms.every((atom) => translationByWord.get(atom)?.some((translation) => translation.sense_index)),
      };
    });
    const hasPair = memberResults.every((result) => result.hasPair);
    const exact = memberResults.every((result) => result.exact);
    const exactWithSenseIndex = memberResults.every((result) => result.exactWithSenseIndex);
    return {
      reviewItemId: row.reviewItemId,
      hasTranslationPair: hasPair,
      exactProposedHintPair: exact,
      exactPairWithEditorialSenseIndex: exactWithSenseIndex,
      marginalBeyondOmwExactPass: exactWithSenseIndex && tier1ById.get(row.reviewItemId).cohort !== 'exact-pass',
    };
  });
  const count = (key) => results.filter((result) => result[key]).length;
  return {
    status: 'qa-evidence-only-no-deterministic-selected-ili-join',
    denominator: rows.length,
    anySlovakTranslationPair: count('hasTranslationPair'),
    exactProposedHintPair: count('exactProposedHintPair'),
    exactPairWithEditorialSenseIndex: count('exactPairWithEditorialSenseIndex'),
    maximumMarginalCandidatesBeyondOmwExactPass: count('marginalBeyondOmwExactPass'),
    autoPasses: 0,
    limitation: 'Wiktionary editorial sense indexes have no deterministic mapping to the selected OMW ILI; translation pairs are retained as QA evidence but cannot certify selected-sense correspondence.',
  };
}

function cohortCounts(records) {
  return Object.fromEntries(['exact-pass', 'ili-present-near-miss', 'ili-absent'].map((cohort) => [cohort, records.filter((record) => record.cohort === cohort).length]));
}

function modelInput(row) {
  return {
    reviewItemId: row.reviewItemId,
    level: row.level,
    spanishTerm: row.spanishTerm,
    partOfSpeech: row.pos,
    spanishDefinition: row.spanishDefinition,
    proposedSlovakHint: row.proposedSlovakHint,
  };
}

function preparePass(outputDirectory, passNumber, inputs) {
  const directory = resolve(outputDirectory, `pass-${passNumber}`);
  const promptPath = resolve(directory, 'PROMPT.txt');
  const schemaPath = resolve(directory, 'output.schema.json');
  writeAtomic(promptPath, `${PROMPT}\n`);
  writeAtomic(schemaPath, canonicalJson(OUTPUT_SCHEMA));
  const batches = [];
  for (let offset = 0; offset < inputs.length; offset += BATCH_SIZE) {
    const entries = inputs.slice(offset, offset + BATCH_SIZE);
    const batchNumber = batches.length + 1;
    const base = `batch-${String(batchNumber).padStart(3, '0')}`;
    const inputPath = resolve(directory, `${base}.input.json`);
    const outputPath = resolve(directory, `${base}.output.json`);
    const checkpointPath = resolve(directory, `${base}.checkpoint.json`);
    const inputText = canonicalJson(entries);
    writeAtomic(inputPath, inputText);
    batches.push({ batchNumber, entryCount: entries.length, inputPath, inputSha256: sha256(inputText), outputPath, checkpointPath });
  }
  return {
    passNumber,
    isolation: 'Separate ephemeral Codex invocation per batch; this pass receives no outputs or summaries from the other pass.',
    model: MODEL,
    prompt: { path: promptPath, sha256: sha256File(promptPath) },
    outputSchema: { path: schemaPath, sha256: sha256File(schemaPath) },
    batches,
  };
}

async function prepare(options) {
  assert(existsSync(options.omwArchivePath), `Missing OMW Slovak archive: ${options.omwArchivePath}`);
  assert(existsSync(options.wiktextractPath), `Missing Wiktextract archive: ${options.wiktextractPath}`);
  const queue = parseTsv(options.queuePath);
  const queueManifest = JSON.parse(readFileSync(options.queueManifestPath, 'utf8'));
  assert(queueManifest.notHumanReview === true && queueManifest.totalQaInputRows === EXPECTED.queue, 'Invalid consolidated owner-review manifest.');
  const lemmasByIli = loadOmwSlovak(options.omwArchivePath);
  const tier1 = classifyTier1(queue.rows, lemmasByIli);
  const counts = cohortCounts(tier1);
  assert(counts['exact-pass'] === EXPECTED.exactPass, `OMW exact-pass population changed: ${counts['exact-pass']}.`);
  assert(counts['ili-present-near-miss'] === EXPECTED.nearMiss, `OMW near-miss population changed: ${counts['ili-present-near-miss']}.`);
  assert(counts['ili-absent'] === EXPECTED.absent, `OMW ILI-absent population changed: ${counts['ili-absent']}.`);
  const tier1ById = new Map(tier1.map((record) => [record.reviewItemId, record]));
  const wiktextract = await wiktextractCoverage(options.wiktextractPath, queue.rows, tier1ById);
  const tier2Rows = queue.rows.filter((row) => tier1ById.get(row.reviewItemId).cohort !== 'exact-pass');
  assert(tier2Rows.length === EXPECTED.tier2, `Tier-2 population changed: ${tier2Rows.length}.`);
  const tier2Inputs = tier2Rows.map(modelInput);
  const tier1Path = resolve(options.outputDirectory, 'tier-1.json');
  writeAtomic(tier1Path, canonicalJson({
    schemaVersion: 1,
    notHumanReview: true,
    policy: 'OMW exact listed-lemma matches on the selected ILI pass deterministically. ILI-present nonmatches are active-reference near-misses; absent ILIs are no-evidence rows. No OMW lemma is copied into product content.',
    counts,
    entries: tier1,
  }));
  const passes = [preparePass(options.outputDirectory, 1, tier2Inputs), preparePass(options.outputDirectory, 2, tier2Inputs)];
  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'prepared',
    courseId: 'es-sk',
    purpose: 'Reference correspondence verification plus two isolated blinded AI cross-reviews; not human review and not native bilingual correspondence verification.',
    sourceQueue: { path: options.queuePath, sha256: sha256(queue.text), rows: queue.rows.length, attentionRows: EXPECTED.attention },
    sourceQueueManifest: { path: options.queueManifestPath, sha256: sha256File(options.queueManifestPath) },
    tier1: {
      omwSlovak: {
        id: 'omw-sk:2.0',
        version: '2.0',
        archivePath: options.omwArchivePath,
        downloadUrl: 'https://github.com/omwn/omw-data/releases/download/v2.0/omw-sk-2.0.tar.xz',
        sha256: sha256File(options.omwArchivePath),
        license: 'CC BY-SA 3.0',
        rawReferenceBundled: false,
        coverage: {
          selectedIliPresent: counts['exact-pass'] + counts['ili-present-near-miss'],
          exactListedLemmaPasses: counts['exact-pass'],
          iliPresentHintNotListed: counts['ili-present-near-miss'],
          selectedIliAbsent: counts['ili-absent'],
          denominator: queue.rows.length,
        },
      },
      wiktextract: {
        sourcePath: options.wiktextractPath,
        sha256: sha256File(options.wiktextractPath),
        dumpDate: '2026-09-01',
        extractedAt: '2026-09-05',
        wiktextractRevision: 'ccec6f1',
        wikitextprocessorRevision: '4deed51',
        license: 'CC BY-SA 4.0 / GFDL source text; Wiktextract software is MIT.',
        rawReferenceBundled: false,
        ...wiktextract,
      },
      artifact: { path: tier1Path, sha256: sha256File(tier1Path) },
      correctionNonDerivationRule: 'OMW Slovak lemmas may flag or pass correspondence only. They must never be copied or substituted as corrected product hints. Corrections come only from the owner\'s judgment or an independent Astra proposal.',
    },
    tier2: {
      population: EXPECTED.tier2,
      cohorts: { iliPresentHintNotListed: EXPECTED.nearMiss, selectedIliAbsent: EXPECTED.absent },
      blindness: 'Inputs contain only reviewItemId, level, Spanish term, part of speech, learner-facing Spanish definition, and proposed Slovak hint. They omit source glosses, sense/ILI IDs, generator confidence, flags, cohort membership, and the other pass.',
      interpretation: 'Report AI cross-review disagreement rates, never measured error rates. Count only matching pass verdicts as positive evidence; queue every dimension that is not unanimously pass and every inter-pass disagreement.',
      passes,
    },
    outputPolicy: {
      schemaColumns: QUEUE_HEADER,
      narrowedQueue: 'All 305 attention-marked rows plus every tier-1 near-miss and every tier-2 row with a non-unanimous dimension. The 416 near-miss rows sort first.',
      ownerScope: 'Monolingual Slovak naturalness and wording only; the owner is not asked to certify bilingual selected-sense correspondence.',
    },
    productDisclosure: 'Spanish definitions are generated and automatically verified against reference sources; they have not been reviewed by native Spanish speakers. Slovak hints are checked against linked lexical references where available and independently AI cross-reviewed; they have not been reviewed by native Slovak speakers. Flagged A1 hints carry AI-assisted, owner-accepted verdicts. Spanish–Slovak sense correspondence has not been verified by a native bilingual reviewer.',
  };
  manifest.runIdentitySha256 = sha256(canonicalJson(manifest));
  writeAtomic(resolve(options.outputDirectory, 'manifest.json'), canonicalJson(manifest));
  console.log(canonicalJson({ counts, wiktextract, tier2BatchesPerPass: passes[0].batches.length, manifestPath: resolve(options.outputDirectory, 'manifest.json') }));
}

function validateOutput(input, output) {
  assert(Array.isArray(output) && output.length === input.length, 'Cross-review output length mismatch.');
  for (let index = 0; index < input.length; index += 1) {
    const expected = input[index];
    const actual = output[index];
    assert(actual?.reviewItemId === expected.reviewItemId, `${expected.reviewItemId}: output identity/order mismatch.`);
    for (const dimension of DIMENSIONS) assert(VERDICTS.has(actual[dimension]), `${expected.reviewItemId}: invalid ${dimension}.`);
    assert(typeof actual.rationale === 'string' && actual.rationale.trim(), `${expected.reviewItemId}: rationale is required.`);
  }
}

function usageFromEvents(stdout, batchNumber) {
  const events = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const completed = [...events].reverse().find((event) => event.type === 'turn.completed');
  assert(completed?.usage, `Batch ${batchNumber}: Codex did not report provider usage.`);
  return {
    batchNumber,
    source: 'Codex turn.completed provider usage',
    inputTokens: completed.usage.input_tokens,
    cachedInputTokens: completed.usage.cached_input_tokens ?? 0,
    outputTokens: completed.usage.output_tokens,
    totalTokens: completed.usage.input_tokens + completed.usage.output_tokens,
  };
}

function usageTotals(batches) {
  return batches.reduce((sum, batch) => ({
    inputTokens: sum.inputTokens + batch.inputTokens,
    cachedInputTokens: sum.cachedInputTokens + batch.cachedInputTokens,
    outputTokens: sum.outputTokens + batch.outputTokens,
    totalTokens: sum.totalTokens + batch.totalTokens,
  }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 });
}

function writeUsage(path, batches) {
  const ordered = [...batches].sort((left, right) => left.batchNumber - right.batchNumber);
  writeAtomic(path, canonicalJson({ schemaVersion: 1, notHumanReview: true, batches: ordered, totals: usageTotals(ordered) }));
}

function generatePass(manifest, pass, options) {
  const usagePath = resolve(dirname(pass.prompt.path), 'usage.json');
  const usageByBatch = new Map();
  if (existsSync(usagePath)) {
    for (const batch of JSON.parse(readFileSync(usagePath, 'utf8')).batches ?? []) usageByBatch.set(batch.batchNumber, batch);
  }
  const prompt = readFileSync(pass.prompt.path, 'utf8');
  for (const batch of pass.batches.filter((candidate) => candidate.batchNumber >= options.fromBatch && candidate.batchNumber <= options.toBatch)) {
    if (existsSync(batch.checkpointPath) && existsSync(batch.outputPath)) {
      const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, 'utf8'));
      if (checkpoint.status === 'valid' && checkpoint.inputSha256 === batch.inputSha256 && checkpoint.outputSha256 === sha256File(batch.outputPath)) {
        console.log(`pass ${pass.passNumber} batch ${batch.batchNumber}: valid checkpoint, skipped.`);
        continue;
      }
    }
    const inputText = readFileSync(batch.inputPath, 'utf8');
    assert(sha256(inputText) === batch.inputSha256, `Pass ${pass.passNumber} batch ${batch.batchNumber}: input hash mismatch.`);
    const temporaryOutput = `${batch.outputPath}.tmp-${process.pid}-${randomUUID()}`;
    console.log(`pass ${pass.passNumber} batch ${batch.batchNumber}: generating ${batch.entryCount} judgments...`);
    const execution = spawnSync(CODEX_BINARY, [
      'exec', '-', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
      '--sandbox', 'read-only', '--model', pass.model.id,
      '--config', `model_reasoning_effort="${pass.model.reasoningEffort}"`, '--json',
      '--output-schema', pass.outputSchema.path, '--output-last-message', temporaryOutput,
      '-C', '/private/tmp',
    ], {
      input: `${prompt}\nProcess this complete batch in order.\nBATCH INPUT:\n${inputText}`,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    try {
      if (execution.status !== 0) throw new Error(`Pass ${pass.passNumber} batch ${batch.batchNumber}: Codex failed (${execution.status}).\n${execution.stderr}\n${execution.stdout}`);
      const providerOutput = JSON.parse(readFileSync(temporaryOutput, 'utf8'));
      validateOutput(JSON.parse(inputText), providerOutput.entries);
      const outputText = canonicalJson(providerOutput.entries);
      writeAtomic(batch.outputPath, outputText);
      const usage = usageFromEvents(execution.stdout, batch.batchNumber);
      usageByBatch.set(batch.batchNumber, usage);
      writeUsage(usagePath, usageByBatch.values());
      writeAtomic(batch.checkpointPath, canonicalJson({
        schemaVersion: 1,
        notHumanReview: true,
        status: 'valid',
        runIdentitySha256: manifest.runIdentitySha256,
        passNumber: pass.passNumber,
        batchNumber: batch.batchNumber,
        inputSha256: batch.inputSha256,
        outputSha256: sha256(outputText),
        model: pass.model,
        usage,
      }));
      console.log(`pass ${pass.passNumber} batch ${batch.batchNumber}: valid.`);
    } finally {
      if (existsSync(temporaryOutput)) unlinkSync(temporaryOutput);
    }
  }
}

function generate(options) {
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert(manifest.notHumanReview === true && manifest.tier2.population === EXPECTED.tier2, 'Invalid correspondence-QA manifest.');
  assert(sha256File(options.queuePath) === manifest.sourceQueue.sha256, 'Owner-review queue changed after QA preparation.');
  assert(sha256File(options.omwArchivePath) === manifest.tier1.omwSlovak.sha256, 'OMW Slovak archive changed after QA preparation.');
  const passes = options.pass === null ? manifest.tier2.passes : manifest.tier2.passes.filter((pass) => pass.passNumber === options.pass);
  for (const pass of passes) generatePass(manifest, pass, options);
}

function readPass(pass) {
  const results = new Map();
  for (const batch of pass.batches) {
    assert(existsSync(batch.outputPath), `Missing pass ${pass.passNumber} output: ${batch.outputPath}`);
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    validateOutput(input, output);
    for (const item of output) results.set(item.reviewItemId, item);
  }
  assert(results.size === EXPECTED.tier2, `Pass ${pass.passNumber}: expected ${EXPECTED.tier2} results.`);
  return results;
}

function dimensionComparison(left, right, dimension) {
  const values = [left[dimension], right[dimension]];
  return {
    pass1: values[0],
    pass2: values[1],
    agreement: values[0] === values[1],
    unanimousPass: values.every((value) => value === 'pass'),
    unanimousDisagreement: values.every((value) => value === 'disagree'),
    unanimousUncertain: values.every((value) => value === 'uncertain'),
  };
}

function summarizeCohort(records) {
  const dimensionCounts = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, {
    unanimousPass: records.filter((record) => record.dimensions[dimension].unanimousPass).length,
    unanimousDisagreement: records.filter((record) => record.dimensions[dimension].unanimousDisagreement).length,
    unanimousUncertain: records.filter((record) => record.dimensions[dimension].unanimousUncertain).length,
    interPassDisagreement: records.filter((record) => !record.dimensions[dimension].agreement).length,
  }]));
  const agreedDisagreementRows = records.filter((record) => record.agreedDisagreement).length;
  const interPassDisagreementRows = records.filter((record) => record.interPassDisagreement).length;
  const nonUnanimousRows = records.filter((record) => record.nonUnanimous).length;
  return {
    total: records.length,
    unanimousAllPassRows: records.length - nonUnanimousRows,
    agreedDisagreementRows,
    twoPassAiCrossReviewDisagreementRate: agreedDisagreementRows / records.length,
    interPassDisagreementRows,
    interPassDisagreementRate: interPassDisagreementRows / records.length,
    anyNonUnanimousDimensionRows: nonUnanimousRows,
    narrowedQueueFlagRate: nonUnanimousRows / records.length,
    dimensions: dimensionCounts,
  };
}

function tsvCell(value) {
  return String(value ?? '').replace(/[\r\n\t]+/gu, ' ').trim();
}

function queueNote(tier1, comparison) {
  const reasons = [];
  if (tier1.cohort === 'ili-present-near-miss') reasons.push('OMW-SK: selected ILI present; proposed hint not fully listed');
  if (comparison?.agreedDisagreement) reasons.push('Astra: both passes disagree on at least one dimension');
  if (comparison?.interPassDisagreement) reasons.push('Astra: inter-pass disagreement');
  if (comparison && !comparison.agreedDisagreement && !comparison.interPassDisagreement && comparison.nonUnanimous) reasons.push('Astra: unanimous uncertainty/non-pass');
  return reasons.join('; ');
}

function buildComparisons(manifest, tier1ById) {
  const pass1 = readPass(manifest.tier2.passes[0]);
  const pass2 = readPass(manifest.tier2.passes[1]);
  const inputs = manifest.tier2.passes[0].batches.flatMap((batch) => JSON.parse(readFileSync(batch.inputPath, 'utf8')));
  const comparisons = inputs.map((row) => {
    const left = pass1.get(row.reviewItemId);
    const right = pass2.get(row.reviewItemId);
    const tier1 = tier1ById.get(row.reviewItemId);
    assert(left && right, `${row.reviewItemId}: missing one cross-review pass.`);
    assert(tier1, `${row.reviewItemId}: missing tier-1 classification.`);
    const dimensions = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, dimensionComparison(left, right, dimension)]));
    return {
      ...row,
      groupId: tier1.groupId,
      cohort: tier1.cohort,
      dimensions,
      agreedDisagreement: Object.values(dimensions).some((dimension) => dimension.unanimousDisagreement),
      interPassDisagreement: Object.values(dimensions).some((dimension) => !dimension.agreement),
      nonUnanimous: Object.values(dimensions).some((dimension) => !dimension.unanimousPass),
      pass1Rationale: left.rationale,
      pass2Rationale: right.rationale,
    };
  });
  assert(comparisons.length === EXPECTED.tier2, `Expected ${EXPECTED.tier2} comparison rows.`);
  return comparisons;
}

function validateAnalysisCounts(comparisons, queueById) {
  const flagged = comparisons.filter((record) => record.nonUnanimous);
  const dimensionFlags = Object.fromEntries(DIMENSIONS.map((dimension) => [
    dimension,
    comparisons.filter((record) => !record.dimensions[dimension].unanimousPass).length,
  ]));
  const interPassSplits = comparisons.filter((record) => record.interPassDisagreement).length;
  const flaggedAttention = flagged.filter((record) => Boolean(queueById.get(record.reviewItemId)?.attention)).length;
  assert(flagged.length === EXPECTED_ANALYSIS.flagged, `Expected ${EXPECTED_ANALYSIS.flagged} flagged rows; found ${flagged.length}.`);
  for (const dimension of DIMENSIONS) {
    assert(dimensionFlags[dimension] === EXPECTED_ANALYSIS[dimension],
      `Expected ${EXPECTED_ANALYSIS[dimension]} ${dimension} flags; found ${dimensionFlags[dimension]}.`);
  }
  assert(interPassSplits === EXPECTED_ANALYSIS.interPassSplits,
    `Expected ${EXPECTED_ANALYSIS.interPassSplits} inter-pass split rows; found ${interPassSplits}.`);
  assert(flaggedAttention === EXPECTED_ANALYSIS.flaggedAttention,
    `Expected ${EXPECTED_ANALYSIS.flaggedAttention} flagged attention rows; found ${flaggedAttention}.`);
  return { flagged, dimensionFlags, interPassSplits, flaggedAttention };
}

function correctionInput(record) {
  return {
    reviewItemId: record.reviewItemId,
    level: record.level,
    spanishTerm: record.spanishTerm,
    partOfSpeech: record.partOfSpeech,
    spanishDefinition: record.spanishDefinition,
    currentSlovakHint: record.proposedSlovakHint,
    flaggedDimensions: Object.fromEntries(DIMENSIONS
      .filter((dimension) => !record.dimensions[dimension].unanimousPass)
      .map((dimension) => [dimension, {
        pass1: record.dimensions[dimension].pass1,
        pass2: record.dimensions[dimension].pass2,
      }])),
    pass1Rationale: record.pass1Rationale,
    pass2Rationale: record.pass2Rationale,
  };
}

function validateCorrectionOutput(input, output) {
  assert(Array.isArray(output) && output.length === input.length, 'Correction output length mismatch.');
  for (let index = 0; index < input.length; index += 1) {
    const expected = input[index];
    const actual = output[index];
    assert(actual?.reviewItemId === expected.reviewItemId, `${expected.reviewItemId}: correction identity/order mismatch.`);
    assert(typeof actual.correctedSlovakHint === 'string' && actual.correctedSlovakHint.trim(),
      `${expected.reviewItemId}: correctedSlovakHint is required.`);
    assert(typeof actual.correctionRationale === 'string' && actual.correctionRationale.trim(),
      `${expected.reviewItemId}: correctionRationale is required.`);
  }
}

function prepareCorrectionRun(mainManifest, comparisons, outputDirectory) {
  const directory = resolve(outputDirectory, 'corrections');
  const manifestPath = resolve(directory, 'manifest.json');
  if (existsSync(manifestPath)) {
    const existing = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert(existing.sourceRunIdentitySha256 === mainManifest.runIdentitySha256, 'Correction source run identity changed.');
    assert(sha256File(existing.prompt.path) === existing.prompt.sha256, 'Correction prompt changed after preparation.');
    assert(sha256File(existing.outputSchema.path) === existing.outputSchema.sha256, 'Correction schema changed after preparation.');
    for (const batch of existing.batches) {
      assert(sha256File(batch.inputPath) === batch.inputSha256, `Correction batch ${batch.batchNumber}: input changed after preparation.`);
    }
    return existing;
  }

  const flagged = comparisons.filter((record) => record.nonUnanimous).map(correctionInput);
  assert(flagged.length === EXPECTED_ANALYSIS.flagged, 'Correction input population changed.');
  const promptPath = resolve(directory, 'PROMPT.txt');
  const schemaPath = resolve(directory, 'output.schema.json');
  writeAtomic(promptPath, `${CORRECTION_PROMPT}\n`);
  writeAtomic(schemaPath, canonicalJson(CORRECTION_OUTPUT_SCHEMA));
  const batches = [];
  for (let offset = 0; offset < flagged.length; offset += BATCH_SIZE) {
    const entries = flagged.slice(offset, offset + BATCH_SIZE);
    const batchNumber = batches.length + 1;
    const base = `batch-${String(batchNumber).padStart(3, '0')}`;
    const inputPath = resolve(directory, `${base}.input.json`);
    const outputPath = resolve(directory, `${base}.output.json`);
    const checkpointPath = resolve(directory, `${base}.checkpoint.json`);
    const inputText = canonicalJson(entries);
    writeAtomic(inputPath, inputText);
    batches.push({ batchNumber, entryCount: entries.length, inputPath, inputSha256: sha256(inputText), outputPath, checkpointPath });
  }
  assert(batches.map((batch) => batch.entryCount).join(',') === '50,50,17', 'Expected correction batches of 50, 50, and 17 rows.');
  const correctionManifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'prepared',
    sourceRunIdentitySha256: mainManifest.runIdentitySha256,
    population: flagged.length,
    provenance: 'Independent Astra editorial judgment from learner-facing inputs and cross-review findings only; no OMW-SK evidence or lemmas are supplied.',
    model: MODEL,
    prompt: { path: promptPath, sha256: sha256File(promptPath) },
    outputSchema: { path: schemaPath, sha256: sha256File(schemaPath) },
    batches,
  };
  correctionManifest.runIdentitySha256 = sha256(canonicalJson(correctionManifest));
  writeAtomic(manifestPath, canonicalJson(correctionManifest));
  return correctionManifest;
}

function generateCorrectionRun(run, options) {
  const usagePath = resolve(dirname(run.prompt.path), 'usage.json');
  const usageByBatch = new Map();
  if (existsSync(usagePath)) {
    for (const batch of JSON.parse(readFileSync(usagePath, 'utf8')).batches ?? []) usageByBatch.set(batch.batchNumber, batch);
  }
  const prompt = readFileSync(run.prompt.path, 'utf8');
  for (const batch of run.batches.filter((candidate) => candidate.batchNumber >= options.fromBatch && candidate.batchNumber <= options.toBatch)) {
    if (existsSync(batch.checkpointPath) && existsSync(batch.outputPath)) {
      const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, 'utf8'));
      if (checkpoint.status === 'valid' && checkpoint.inputSha256 === batch.inputSha256
        && checkpoint.outputSha256 === sha256File(batch.outputPath)) {
        console.log(`correction batch ${batch.batchNumber}: valid checkpoint, skipped.`);
        continue;
      }
    }
    const inputText = readFileSync(batch.inputPath, 'utf8');
    assert(sha256(inputText) === batch.inputSha256, `Correction batch ${batch.batchNumber}: input hash mismatch.`);
    const temporaryOutput = `${batch.outputPath}.tmp-${process.pid}-${randomUUID()}`;
    console.log(`correction batch ${batch.batchNumber}: generating ${batch.entryCount} proposals...`);
    const execution = spawnSync(CODEX_BINARY, [
      'exec', '-', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
      '--sandbox', 'read-only', '--model', run.model.id,
      '--config', `model_reasoning_effort="${run.model.reasoningEffort}"`, '--json',
      '--output-schema', run.outputSchema.path, '--output-last-message', temporaryOutput,
      '-C', '/private/tmp',
    ], {
      input: `${prompt}\nProcess this complete batch in order.\nBATCH INPUT:\n${inputText}`,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    try {
      if (execution.status !== 0) throw new Error(`Correction batch ${batch.batchNumber}: Codex failed (${execution.status}).\n${execution.stderr}\n${execution.stdout}`);
      const providerOutput = JSON.parse(readFileSync(temporaryOutput, 'utf8'));
      validateCorrectionOutput(JSON.parse(inputText), providerOutput.entries);
      const outputText = canonicalJson(providerOutput.entries);
      writeAtomic(batch.outputPath, outputText);
      const usage = usageFromEvents(execution.stdout, batch.batchNumber);
      usageByBatch.set(batch.batchNumber, usage);
      writeUsage(usagePath, usageByBatch.values());
      writeAtomic(batch.checkpointPath, canonicalJson({
        schemaVersion: 1,
        notHumanReview: true,
        status: 'valid',
        runIdentitySha256: run.runIdentitySha256,
        batchNumber: batch.batchNumber,
        inputSha256: batch.inputSha256,
        outputSha256: sha256(outputText),
        model: run.model,
        usage,
      }));
      console.log(`correction batch ${batch.batchNumber}: valid.`);
    } finally {
      if (existsSync(temporaryOutput)) unlinkSync(temporaryOutput);
    }
  }
}

function correct(options) {
  const mainManifest = JSON.parse(readFileSync(resolve(options.outputDirectory, 'manifest.json'), 'utf8'));
  assert(mainManifest.notHumanReview === true && mainManifest.tier2.population === EXPECTED.tier2,
    'Invalid correspondence-QA manifest.');
  const queue = parseTsv(options.queuePath);
  assert(sha256(queue.text) === mainManifest.sourceQueue.sha256, 'Owner-review queue changed after QA preparation.');
  const queueById = new Map(queue.rows.map((row) => [row.reviewItemId, row]));
  const tier1 = JSON.parse(readFileSync(mainManifest.tier1.artifact.path, 'utf8'));
  const tier1ById = new Map(tier1.entries.map((entry) => [entry.reviewItemId, entry]));
  const comparisons = buildComparisons(mainManifest, tier1ById);
  validateAnalysisCounts(comparisons, queueById);
  const run = prepareCorrectionRun(mainManifest, comparisons, options.outputDirectory);
  generateCorrectionRun(run, options);
}

function readCorrections(outputDirectory, sourceRunIdentitySha256) {
  const manifestPath = resolve(outputDirectory, 'corrections/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert(manifest.sourceRunIdentitySha256 === sourceRunIdentitySha256, 'Correction source run identity mismatch.');
  const results = new Map();
  for (const batch of manifest.batches) {
    assert(existsSync(batch.outputPath) && existsSync(batch.checkpointPath), `Missing correction batch ${batch.batchNumber}.`);
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, 'utf8'));
    validateCorrectionOutput(input, output);
    assert(checkpoint.status === 'valid' && checkpoint.runIdentitySha256 === manifest.runIdentitySha256
      && checkpoint.inputSha256 === batch.inputSha256 && checkpoint.outputSha256 === sha256File(batch.outputPath),
    `Invalid correction checkpoint ${batch.batchNumber}.`);
    for (const item of output) results.set(item.reviewItemId, item);
  }
  assert(results.size === EXPECTED_ANALYSIS.flagged, `Expected ${EXPECTED_ANALYSIS.flagged} correction proposals.`);
  return { manifest, results };
}

export function wilson95(successes, total) {
  assert(Number.isInteger(successes) && Number.isInteger(total) && total > 0 && successes >= 0 && successes <= total,
    'Wilson interval requires integer successes within a positive total.');
  const z = 1.96;
  const proportion = successes / total;
  const denominator = 1 + z ** 2 / total;
  const center = (proportion + z ** 2 / (2 * total)) / denominator;
  const halfWidth = z * Math.sqrt((proportion * (1 - proportion) + z ** 2 / (4 * total)) / total) / denominator;
  return { lower: center - halfWidth, upper: center + halfWidth };
}

function analyze(options) {
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert(manifest.notHumanReview === true && manifest.tier2.population === EXPECTED.tier2, 'Invalid correspondence-QA manifest.');
  const queue = parseTsv(options.queuePath);
  assert(sha256(queue.text) === manifest.sourceQueue.sha256, 'Owner-review queue changed after QA preparation.');
  const queueById = new Map(queue.rows.map((row) => [row.reviewItemId, row]));
  const tier1Document = JSON.parse(readFileSync(manifest.tier1.artifact.path, 'utf8'));
  const tier1ById = new Map(tier1Document.entries.map((entry) => [entry.reviewItemId, entry]));
  const comparisons = buildComparisons(manifest, tier1ById);
  const comparisonById = new Map(comparisons.map((record) => [record.reviewItemId, record]));
  const nearMiss = comparisons.filter((record) => record.cohort === 'ili-present-near-miss');
  const absent = comparisons.filter((record) => record.cohort === 'ili-absent');
  assert(nearMiss.length === EXPECTED.nearMiss && absent.length === EXPECTED.absent, 'Tier-2 cohort sizes changed.');
  const analysis = validateAnalysisCounts(comparisons, queueById);
  const corrections = readCorrections(options.outputDirectory, manifest.runIdentitySha256);
  const flaggedIds = new Set(analysis.flagged.map((record) => record.reviewItemId));
  const ordered = queue.rows.filter((row) => flaggedIds.has(row.reviewItemId));
  assert(ordered.length === EXPECTED_ANALYSIS.flagged, 'Final owner queue population changed.');

  const ownerColumns = [
    ...QUEUE_HEADER,
    'flaggedDimensions', 'interPassSplit', 'flaggedAttention', 'ownerVerdictScope',
    'correctedSlovakHint', 'correctionRationale',
  ];
  const outputRows = ordered.map((row) => {
    const comparison = comparisonById.get(row.reviewItemId);
    const correction = corrections.results.get(row.reviewItemId);
    assert(comparison && correction, `${row.reviewItemId}: missing comparison or correction.`);
    const flaggedDimensions = DIMENSIONS.filter((dimension) => !comparison.dimensions[dimension].unanimousPass);
    const definitive = flaggedDimensions.includes('correctSlovak');
    const output = QUEUE_HEADER.map((column) => row[column]);
    const noteIndex = QUEUE_HEADER.indexOf('notes');
    const note = queueNote(tier1ById.get(row.reviewItemId), comparison);
    output[noteIndex] = [output[noteIndex], note].filter(Boolean).join('; ');
    return [
      ...output,
      flaggedDimensions.join(','),
      comparison.interPassDisagreement ? 'yes' : '',
      row.attention ? 'yes' : '',
      definitive ? 'definitive-slovak-wording' : 'advisory-correction-wording-only',
      correction.correctedSlovakHint,
      correction.correctionRationale,
    ].map(tsvCell);
  });
  const ownerTsv = `${[ownerColumns, ...outputRows].map((row) => row.join('\t')).join('\n')}\n`;
  const ownerPath = resolve(options.outputDirectory, 'owner-review-queue.tsv');
  writeAtomic(ownerPath, ownerTsv);
  const comparisonPath = resolve(options.outputDirectory, 'tier-2-comparisons.json');
  writeAtomic(comparisonPath, canonicalJson({ schemaVersion: 1, notHumanReview: true, dimensions: DIMENSIONS, entries: comparisons }));

  const usageByPass = manifest.tier2.passes.map((pass) => {
    const usagePath = resolve(dirname(pass.prompt.path), 'usage.json');
    const usage = JSON.parse(readFileSync(usagePath, 'utf8'));
    const recordedBatches = new Set(usage.batches.map((batch) => batch.batchNumber));
    const missingBatchNumbers = pass.batches.map((batch) => batch.batchNumber).filter((batchNumber) => !recordedBatches.has(batchNumber));
    return {
      passNumber: pass.passNumber,
      path: usagePath,
      sha256: sha256File(usagePath),
      recordStatus: missingBatchNumbers.length ? 'lower-bound' : 'complete',
      missingBatchNumbers,
      ...usage.totals,
    };
  });
  assert(usageByPass[0].recordStatus === 'lower-bound' && usageByPass[0].missingBatchNumbers.join(',') === '29',
    'Expected pass-1 usage to be a lower bound with only batch 29 missing.');
  assert(usageByPass[1].recordStatus === 'complete', 'Expected complete pass-2 usage records.');
  const cumulativeUsage = usageTotals(usageByPass);
  const standardCostUsd = cumulativeUsage.inputTokens * 10 / 1_000_000 + cumulativeUsage.outputTokens * 50 / 1_000_000;
  const correctionUsagePath = resolve(dirname(corrections.manifest.prompt.path), 'usage.json');
  const correctionUsage = JSON.parse(readFileSync(correctionUsagePath, 'utf8'));
  const countsByLevel = Object.fromEntries(['A1', 'A2', 'B1', 'B2', 'C1'].map((level) => [level, ordered.filter((row) => row.level === level).length]));

  const omwSlovak = loadOmwSlovak(options.omwArchivePath);
  const exactCorrectionReferenceMatches = ordered.filter((row) => {
    const listed = omwSlovak.get(selectedIli(row));
    const atoms = hintAtoms(corrections.results.get(row.reviewItemId).correctedSlovakHint);
    return Boolean(listed) && atoms.length > 0 && atoms.every((atom) => listed.has(atom));
  });
  const riskSummary = (records) => {
    const flaggedRows = records.filter((record) => record.nonUnanimous).length;
    const interval = wilson95(flaggedRows, records.length);
    return {
      rows: records.length,
      flaggedRows,
      flagRate: flaggedRows / records.length,
      flagRatePercent: Number((flaggedRows / records.length * 100).toFixed(2)),
      wilson95Percent: {
        lower: Number((interval.lower * 100).toFixed(2)),
        upper: Number((interval.upper * 100).toFixed(2)),
      },
    };
  };
  const nearMissRisk = riskSummary(nearMiss);
  const absentRisk = riskSummary(absent);
  const enrichment = nearMissRisk.flagRate / absentRisk.flagRate;
  assert(nearMissRisk.flaggedRows === 61 && absentRisk.flaggedRows === 56, 'Cohort flagged-row counts changed.');

  const summary = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'complete-awaiting-owner-correction-wording-review',
    courseId: 'es-sk',
    tier1: manifest.tier1,
    tier2: {
      label: 'Two-pass AI cross-review disagreement rates; not measured error rates and not human or native bilingual review.',
      rule: 'Only identical pass/pass dimension verdicts count as positive evidence. Any other dimension state is flagged; inter-pass disagreement is reported separately.',
      overall: {
        rows: comparisons.length,
        flaggedRows: analysis.flagged.length,
        flagRate: analysis.flagged.length / comparisons.length,
        flagRatePercent: Number((analysis.flagged.length / comparisons.length * 100).toFixed(2)),
        flaggedRowsByDimension: analysis.dimensionFlags,
        interPassSplitRows: analysis.interPassSplits,
      },
      iliPresentHintNotListed: summarizeCohort(nearMiss),
      selectedIliAbsent: summarizeCohort(absent),
      validatedPredictiveRiskSignal: {
        status: 'validated',
        riskFlag: 'OMW-SK selected ILI present but proposed hint is not an exact listed-lemma match.',
        nearMiss: nearMissRisk,
        absent: absentRisk,
        enrichmentRatio: enrichment,
        enrichmentRatioRounded: Number(enrichment.toFixed(2)),
        confidenceIntervalsOverlap: nearMissRisk.wilson95Percent.lower <= absentRisk.wilson95Percent.upper,
        conclusion: 'An OMW-SK near-miss is a genuine predictive risk flag and must remain a permanent cheap correspondence check.',
      },
      usage: {
        passes: usageByPass,
        cumulative: { recordStatus: 'lower-bound', reason: 'Pass 1 batch 29 usage is missing and was not reconstructed.', ...cumulativeUsage },
        pricing: { model: MODEL.id, inputUsdPerMillion: 10, outputUsdPerMillion: 50, lowerBoundStandardProviderCostUsd: standardCostUsd },
      },
      comparisonArtifact: { path: comparisonPath, sha256: sha256File(comparisonPath) },
    },
    corrections: {
      count: corrections.results.size,
      provenance: corrections.manifest.provenance,
      runManifest: { path: resolve(dirname(corrections.manifest.prompt.path), 'manifest.json'), sha256: sha256File(resolve(dirname(corrections.manifest.prompt.path), 'manifest.json')) },
      usage: correctionUsage.totals,
      postGenerationOmwCheck: {
        role: 'Corroboration only; OMW-SK evidence was not available during correction generation.',
        exactListedLemmaRows: exactCorrectionReferenceMatches.length,
        denominator: corrections.results.size,
        reviewItemIds: exactCorrectionReferenceMatches.map((row) => row.reviewItemId),
      },
    },
    finalOwnerQueue: {
      path: ownerPath,
      sha256: sha256(ownerTsv),
      rows: ordered.length,
      columns: ownerColumns,
      columnCount: ownerColumns.length,
      countsByLevel,
      proposedCorrectionRows: corrections.results.size,
      interPassSplitRows: analysis.interPassSplits,
      flaggedAttentionRows: analysis.flaggedAttention,
      definitiveSlovakWordingRows: analysis.dimensionFlags.correctSlovak,
      advisoryCorrectionWordingRows: ordered.length - analysis.dimensionFlags.correctSlovak,
      sourceAttentionRows: EXPECTED.attention,
      excludedUnflaggedAttentionRows: EXPECTED.attention - analysis.flaggedAttention,
      selectionPolicy: 'Include every flagged row with its proposed correction. Preserve inter-pass split and flagged-attention markers; exclude unflagged format-attention rows.',
      attentionConclusion: 'Format-based attention selection did not predict defects; unflagged attention rows have clean wording and are excluded.',
      ownerScope: 'The correctSlovak dimension marks definitive AI wording findings, including three A1 rows. Owner verdicts based on this queue are AI-assisted and must never be described as native-speaker review or native bilingual selected-sense certification.',
    },
    correctionNonDerivationRule: manifest.tier1.correctionNonDerivationRule,
    productDisclosure: manifest.productDisclosure,
  };
  writeAtomic(resolve(options.outputDirectory, 'summary.json'), canonicalJson(summary));
  console.log(canonicalJson({
    tier2: summary.tier2,
    corrections: summary.corrections,
    finalOwnerQueue: summary.finalOwnerQueue,
    summaryPath: resolve(options.outputDirectory, 'summary.json'),
  }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'prepare') await prepare(options);
    else if (options.command === 'generate') generate(options);
    else if (options.command === 'correct') correct(options);
    else analyze(options);
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
