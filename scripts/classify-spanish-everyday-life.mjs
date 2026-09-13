import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBatch } from './validate-spanish-a1-learner-content.mjs';

const EXPECTED_COUNTS = Object.freeze({ A1: 1707, A2: 1847 });
const CATEGORY_ROOTS = Object.freeze({
  food: Object.freeze(['omw-en-00021265-n', 'omw-en-07555863-n']),
  clothing: Object.freeze(['omw-en-03051540-n']),
  sport: Object.freeze(['omw-en-00523513-n', 'omw-en-07456188-n']),
  leisure: Object.freeze(['omw-en-00288970-n', 'omw-en-00426928-n', 'omw-en-15137676-n']),
});
const CATEGORY_PRECEDENCE = Object.freeze(['food', 'clothing', 'sport', 'leisure']);
const KNOWN_A1_SIGNAL_TERMS = Object.freeze(['sushi', 'camiseta', 'pollo', 'bañador', 'partido', 'senderismo', 'cava']);

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

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, canonicalJson(value));
  renameSync(temporaryPath, path);
}

function parseArgs(argv) {
  const options = {
    a1ManifestPath: resolve('.artifacts/spanish-a1-learner-content/full/manifest.json'),
    a2ManifestPath: resolve('.artifacts/spanish-a2-learner-content/full/manifest.json'),
    wordnetPath: resolve('.artifacts/spanish-source-archives/omw-en/omw-en.xml'),
    outputPath: resolve('.artifacts/spanish-a2-quality-qa/modern-everyday-life-classification.json'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--a1-manifest') options.a1ManifestPath = resolve(argv[++index]);
    else if (argument === '--a2-manifest') options.a2ManifestPath = resolve(argv[++index]);
    else if (argument === '--wordnet') options.wordnetPath = resolve(argv[++index]);
    else if (argument === '--output') options.outputPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function loadSelectedSenses(manifestPath, level) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert(manifest.mode === 'full' && manifest.level === level && manifest.entryCount === EXPECTED_COUNTS[level],
    `Expected the immutable ${EXPECTED_COUNTS[level]}-entry ${level} learner run.`);
  const entries = [];
  for (const batch of manifest.batches) {
    const inputText = readFileSync(batch.inputPath);
    const outputText = readFileSync(batch.outputPath);
    assert(sha256(inputText) === batch.inputSha256, `${level} batch ${batch.batchNumber}: input hash mismatch.`);
    const input = JSON.parse(inputText);
    const output = JSON.parse(outputText);
    validateBatch(input, output);
    for (let index = 0; index < input.length; index += 1) {
      const generated = output[index];
      const selectedSense = input[index].candidateSenses.find((sense) => sense.senseId === generated.meaningReferenceSenseId);
      assert(selectedSense?.englishSynsetId, `${generated.entryId}: selected English synset is missing.`);
      entries.push({
        entryId: generated.entryId,
        term: generated.term,
        partOfSpeech: generated.partOfSpeech,
        level,
        englishSynsetId: selectedSense.englishSynsetId,
        evidenceStratum: selectedSense.spanishDefinition ? 'spanish-gloss' : 'english-bridge-only',
      });
    }
  }
  assert(entries.length === EXPECTED_COUNTS[level], `${level}: selected-sense population is incomplete.`);
  return { manifest, entries };
}

export async function loadHypernyms(wordnetPath) {
  assert(existsSync(wordnetPath), `Missing OMW English XML: ${wordnetPath}`);
  const hypernyms = new Map();
  let currentSynsetId = null;
  const lines = createInterface({ input: createReadStream(wordnetPath), crlfDelay: Infinity });
  for await (const line of lines) {
    const start = line.match(/<Synset\s+id="([^"]+)"/u);
    if (start) {
      currentSynsetId = start[1];
      if (!hypernyms.has(currentSynsetId)) hypernyms.set(currentSynsetId, []);
    }
    if (currentSynsetId) {
      const relation = line.match(/<SynsetRelation\s+target="([^"]+)"\s+relType="hypernym"/u);
      if (relation) hypernyms.get(currentSynsetId).push(relation[1]);
    }
    if (line.includes('</Synset>')) currentSynsetId = null;
  }
  return hypernyms;
}

function reachesRoot(synsetId, roots, hypernyms, memo) {
  const key = `${synsetId}\u0000${[...roots].sort().join(',')}`;
  if (memo.has(key)) return memo.get(key);
  const seen = new Set();
  const pending = [synsetId];
  while (pending.length > 0) {
    const current = pending.pop();
    if (roots.has(current)) {
      memo.set(key, true);
      return true;
    }
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(hypernyms.get(current) ?? []));
  }
  memo.set(key, false);
  return false;
}

export function classifyEverydayEntry(entry, hypernyms, memo = new Map()) {
  const matched = CATEGORY_PRECEDENCE.filter((category) => reachesRoot(
    entry.englishSynsetId,
    new Set(CATEGORY_ROOTS[category]),
    hypernyms,
    memo,
  ));
  if (matched.includes('sport')) return ['sport'];
  return matched.filter((category) => category !== 'leisure' || !matched.includes('sport'));
}

function summarize(entries) {
  const byCategory = Object.fromEntries(CATEGORY_PRECEDENCE.map((category) => {
    const count = entries.filter((entry) => entry.categories.includes(category)).length;
    return [category, { count, population: entries.length, rate: count / entries.length }];
  }));
  const targeted = entries.filter((entry) => entry.categories.length > 0);
  return {
    population: entries.length,
    targetedCount: targeted.length,
    targetedRate: targeted.length / entries.length,
    byCategory,
  };
}

export async function classifyEverydayLife(options) {
  const a1 = loadSelectedSenses(options.a1ManifestPath, 'A1');
  const a2 = loadSelectedSenses(options.a2ManifestPath, 'A2');
  const hypernyms = await loadHypernyms(options.wordnetPath);
  const memo = new Map();
  const classifiedA1 = a1.entries.map((entry) => ({ ...entry, categories: classifyEverydayEntry(entry, hypernyms, memo) }));
  const classifiedA2 = a2.entries.map((entry) => ({ ...entry, categories: classifyEverydayEntry(entry, hypernyms, memo) }));
  const targetA1Entries = classifiedA1.filter((entry) => entry.categories.length > 0);
  const targetEntries = classifiedA2.filter((entry) => entry.categories.length > 0);
  const report = {
    schemaVersion: 1,
    notHumanReview: true,
    level: 'A2',
    purpose: 'Deterministic targeted external-reference QA cohort for modern everyday-life senses; not a probability sample.',
    method: 'Selected OMW English noun synsets are classified by transitive hypernym ancestry. Sport takes precedence over its broader leisure/diversion ancestor. No model judgment is used.',
    classifier: {
      version: 1,
      taxonomy: 'WordNet 3.0 synset hypernym ancestry',
      roots: CATEGORY_ROOTS,
      precedence: CATEGORY_PRECEDENCE,
      scope: 'Selected noun senses reachable from the explicit food, clothing, sport, diversion, or leisure roots.',
      wordnet: { path: options.wordnetPath, sha256: sha256File(options.wordnetPath) },
    },
    sources: {
      A1: { manifestPath: options.a1ManifestPath, manifestSha256: sha256File(options.a1ManifestPath), runIdentitySha256: a1.manifest.runIdentitySha256 },
      A2: { manifestPath: options.a2ManifestPath, manifestSha256: sha256File(options.a2ManifestPath), runIdentitySha256: a2.manifest.runIdentitySha256 },
    },
    distribution: { A1: summarize(classifiedA1), A2: summarize(classifiedA2) },
    knownA1Signal: KNOWN_A1_SIGNAL_TERMS.map((term) => ({
      term,
      matches: classifiedA1.filter((entry) => entry.term === term).map((entry) => ({ entryId: entry.entryId, categories: entry.categories })),
    })),
    entriesByLevel: {
      A1: targetA1Entries,
      A2: targetEntries,
    },
    entries: targetEntries.map((entry) => ({
      entryId: entry.entryId,
      term: entry.term,
      partOfSpeech: entry.partOfSpeech,
      evidenceStratum: entry.evidenceStratum,
      categories: entry.categories,
      englishSynsetId: entry.englishSynsetId,
    })),
  };
  writeJsonAtomic(options.outputPath, report);
  return { outputPath: options.outputPath, report };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await classifyEverydayLife(parseArgs(process.argv.slice(2)));
    console.log(canonicalJson({ outputPath: result.outputPath, distribution: result.report.distribution, knownA1Signal: result.report.knownA1Signal }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
