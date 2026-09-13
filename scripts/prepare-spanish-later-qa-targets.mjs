import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateBatch } from './validate-spanish-a1-learner-content.mjs';

const SAMPLE_SIZE = 300;
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
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
    const input = JSON.parse(readFileSync(batch.inputPath, 'utf8'));
    const output = JSON.parse(readFileSync(batch.outputPath, 'utf8'));
    validateBatch(input, output);
    for (let index = 0; index < input.length; index += 1) {
      const selected = input[index].candidateSenses.find((sense) => sense.senseId === output[index].meaningReferenceSenseId);
      entries.push({
        ...output[index],
        evidenceStratum: selected?.spanishDefinition?.trim() ? 'spanish-gloss' : 'english-bridge-only',
      });
    }
  }
  if (entries.length !== manifest.entryCount) throw new Error(`${manifest.level}: incomplete learner content.`);
  return { manifest, entries };
}

function allocate(entries) {
  const strata = ['spanish-gloss', 'english-bridge-only'];
  const exact = strata.map((stratum) => {
    const population = entries.filter((entry) => entry.evidenceStratum === stratum).length;
    const quota = population / entries.length * SAMPLE_SIZE;
    return { stratum, population, count: Math.floor(quota), remainder: quota - Math.floor(quota) };
  });
  let left = SAMPLE_SIZE - exact.reduce((sum, item) => sum + item.count, 0);
  exact.sort((a, b) => b.remainder - a.remainder || a.stratum.localeCompare(b.stratum));
  for (let index = 0; index < left; index += 1) exact[index].count += 1;
  return exact;
}

export function buildTarget(level) {
  const slug = level.toLowerCase();
  const { manifest, entries } = loadGenerated(resolve(`.artifacts/spanish-${slug}-learner-content/full/manifest.json`));
  const allocations = allocate(entries);
  const probability = allocations.flatMap(({ stratum, count }) => entries
    .filter((entry) => entry.evidenceStratum === stratum)
    .sort((left, right) => sha256(`${manifest.runIdentitySha256}\0later-level-probability-v1\0${stratum}\0${left.entryId}`)
      .localeCompare(sha256(`${manifest.runIdentitySha256}\0later-level-probability-v1\0${stratum}\0${right.entryId}`))
      || left.entryId.localeCompare(right.entryId))
    .slice(0, count));
  const probabilityIds = new Set(probability.map((entry) => entry.entryId));
  const minorityManifest = JSON.parse(readFileSync(resolve(`.artifacts/spanish-targeted-quality-qa/${slug}-minority-pos-target.json`), 'utf8'));
  const minorityIds = new Set(minorityManifest.entries.map((entry) => entry.entryId));
  const selected = entries.filter((entry) => probabilityIds.has(entry.entryId) || minorityIds.has(entry.entryId));
  const result = {
    schemaVersion: 1,
    notHumanReview: true,
    level,
    selectionKind: 'deduplicated-probability-sample-plus-targeted-minority-pos-cohort',
    excludedFromProbabilityErrorDenominators: true,
    probabilityDenominatorCategory: 'probability-sample',
    targetedDenominatorCategory: 'minority-pos',
    method: 'A deterministic 300-entry proportional sample across Spanish-gloss and bridge-only strata is combined with the complete under-50%-lemma-frequency minority-POS cohort. Overlaps are judged once and retained in both named denominators.',
    sample: {
      seed: manifest.runIdentitySha256,
      size: probabilityIds.size,
      allocation: Object.fromEntries(allocations.map(({ stratum, count }) => [stratum, count])),
    },
    cohortCounts: {
      probabilitySample: probabilityIds.size,
      minorityPos: minorityIds.size,
      overlap: selected.filter((entry) => probabilityIds.has(entry.entryId) && minorityIds.has(entry.entryId)).length,
      union: selected.length,
    },
    entries: selected.map((entry) => ({
      entryId: entry.entryId,
      term: entry.term,
      partOfSpeech: entry.partOfSpeech,
      categories: [
        ...(probabilityIds.has(entry.entryId) ? ['probability-sample'] : []),
        ...(minorityIds.has(entry.entryId) ? ['minority-pos'] : []),
      ],
    })),
  };
  writeJsonAtomic(resolve(`.artifacts/spanish-${slug}-quality-qa/target.json`), result);
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const levels = process.argv.slice(2).map((level) => level.toUpperCase());
  for (const level of levels.length ? levels : ['B2', 'C1']) {
    const result = buildTarget(level);
    console.log(canonicalJson({ level, cohortCounts: result.cohortCounts, allocation: result.sample.allocation }));
  }
}
