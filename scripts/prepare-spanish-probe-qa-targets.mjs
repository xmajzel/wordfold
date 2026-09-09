import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateBatch } from './validate-spanish-a1-learner-content.mjs';
import { classifyEverydayEntry, loadHypernyms } from './classify-spanish-everyday-life.mjs';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function assert(condition, message) { if (!condition) throw new Error(message); }
function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, canonicalJson(value));
  renameSync(temporaryPath, path);
}

function loadGenerated(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entries = [];
  for (const batch of manifest.batches) {
    const inputText = readFileSync(batch.inputPath);
    assert(sha256(inputText) === batch.inputSha256, `Batch ${batch.batchNumber}: input hash mismatch.`);
    const input = JSON.parse(inputText);
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    validateBatch(input, output);
    for (let index = 0; index < input.length; index += 1) {
      const selectedSense = input[index].candidateSenses.find((sense) => sense.senseId === output[index].meaningReferenceSenseId);
      assert(selectedSense?.englishSynsetId, `${output[index].entryId}: selected English synset is missing.`);
      entries.push({ ...output[index], englishSynsetId: selectedSense.englishSynsetId });
    }
  }
  assert(entries.length === manifest.entryCount, 'Generated probe is incomplete.');
  return { manifest, entries };
}

export async function buildProbeTargets(options) {
  const { manifest, entries } = loadGenerated(options.b1ManifestPath);
  assert(manifest.level === 'B1' && manifest.mode === 'pilot', 'Expected the immutable B1 probe manifest.');
  const pilotIds = new Set(manifest.selection.probabilityPilotEntryIds);
  const minorityIds = new Set(manifest.selection.includedTargetEntryIds);
  assert(pilotIds.size === 100 && minorityIds.size === 55, 'Expected the approved 100-entry pilot and 55-entry minority-POS cohort.');
  const hypernyms = await loadHypernyms(options.wordnetPath);
  const memo = new Map();
  const targetEntries = entries.map((entry) => {
    const everydayCategories = classifyEverydayEntry(entry, hypernyms, memo);
    const categories = [];
    if (pilotIds.has(entry.entryId)) categories.push('probability-pilot');
    if (minorityIds.has(entry.entryId)) categories.push('minority-pos');
    if (everydayCategories.length > 0) categories.push('everyday-life', ...everydayCategories.map((category) => `everyday-${category}`));
    return { entryId: entry.entryId, term: entry.term, partOfSpeech: entry.partOfSpeech, categories };
  });
  assert(targetEntries.every((entry) => entry.categories.includes('probability-pilot') || entry.categories.includes('minority-pos')),
    'Every B1 probe entry must belong to an approved cohort.');
  const b1Target = {
    schemaVersion: 1,
    notHumanReview: true,
    level: 'B1',
    selectionKind: 'deduplicated-probability-pilot-plus-targeted-minority-pos-cohort',
    excludedFromProbabilityErrorDenominators: true,
    method: 'The deterministic 100-entry B1 POS-proportional pilot is combined with every B1 minority-POS entry; five overlaps are generated and reviewed once but retained in both named cohort denominators.',
    probabilityDenominatorCategory: 'probability-pilot',
    targetedDenominatorCategory: 'minority-pos',
    cohortCounts: {
      probabilityPilot: targetEntries.filter((entry) => entry.categories.includes('probability-pilot')).length,
      minorityPos: targetEntries.filter((entry) => entry.categories.includes('minority-pos')).length,
      overlap: targetEntries.filter((entry) => entry.categories.includes('probability-pilot') && entry.categories.includes('minority-pos')).length,
      union: targetEntries.length,
      everydayLifeInUnion: targetEntries.filter((entry) => entry.categories.includes('everyday-life')).length,
      everydayLifeInProbabilityPilot: targetEntries.filter((entry) => entry.categories.includes('probability-pilot') && entry.categories.includes('everyday-life')).length,
    },
    entries: targetEntries,
  };
  writeJsonAtomic(options.b1TargetPath, b1Target);

  const correctionsText = readFileSync(options.a2CorrectionsPath);
  const corrections = JSON.parse(correctionsText);
  assert(corrections.notHumanReview === true && corrections.level === 'A2' && corrections.entries.length === 23,
    'Expected the 23-entry A2 correction sidecar.');
  const a2Target = {
    schemaVersion: 1,
    notHumanReview: true,
    level: 'A2',
    selectionKind: 'post-correction-external-verification-census',
    excludedFromProbabilityErrorDenominators: true,
    method: 'Every repaired A2 learner-content entry is rechecked after applying the correction sidecar; this is a census of repairs, not a probability sample.',
    correctionSidecarSha256: sha256(correctionsText),
    entries: corrections.entries.map((entry) => ({
      entryId: entry.entryId,
      term: entry.term,
      partOfSpeech: entry.partOfSpeech,
      categories: ['post-correction', ...(entry.semanticException ? ['semantic-exception'] : [])],
    })),
  };
  writeJsonAtomic(options.a2TargetPath, a2Target);
  return { b1Target, a2Target };
}

function parseArgs(argv) {
  const options = {
    b1ManifestPath: resolve('.artifacts/spanish-b1-learner-content/probe/manifest.json'),
    wordnetPath: resolve('.artifacts/spanish-source-archives/omw-en/omw-en.xml'),
    b1TargetPath: resolve('.artifacts/spanish-b1-quality-qa/probe-target.json'),
    a2CorrectionsPath: resolve('assets/catalog/spanish/a2-ai-cross-review-adjudications.json'),
    a2TargetPath: resolve('.artifacts/spanish-a2-post-correction-quality-qa/target.json'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--b1-manifest') options.b1ManifestPath = resolve(argv[++index]);
    else if (argument === '--wordnet') options.wordnetPath = resolve(argv[++index]);
    else if (argument === '--b1-target') options.b1TargetPath = resolve(argv[++index]);
    else if (argument === '--a2-corrections') options.a2CorrectionsPath = resolve(argv[++index]);
    else if (argument === '--a2-target') options.a2TargetPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await buildProbeTargets(parseArgs(process.argv.slice(2)));
    console.log(canonicalJson({ b1: result.b1Target.cohortCounts, a2Repairs: result.a2Target.entries.length }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
