import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mapElelexTag, parseElelex } from './build-spanish-cefr-catalog.mjs';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const THRESHOLDS = [0.5, 0.25, 0.1];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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
    elelexPath: resolve('assets/catalog/sources/elelex-freeling-2020-12-04.tsv'),
    catalogPath: resolve('assets/catalog/spanish/cefr-course-catalog.json'),
    everydayPath: resolve('.artifacts/spanish-a2-quality-qa/modern-everyday-life-classification.json'),
    outputDirectory: resolve('.artifacts/spanish-targeted-quality-qa'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--elelex') options.elelexPath = resolve(argv[++index]);
    else if (argument === '--catalog') options.catalogPath = resolve(argv[++index]);
    else if (argument === '--everyday') options.everydayPath = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function buildMinorityPosReport(elelexRows, courseCatalog) {
  const frequencyByPair = new Map();
  const totalBySourceLemma = new Map();
  for (const row of elelexRows) {
    const partOfSpeech = mapElelexTag(row.sourceTag).partOfSpeech;
    if (!partOfSpeech) continue;
    const pairKey = `${row.normalizedLemma}\u0000${partOfSpeech}`;
    frequencyByPair.set(pairKey, (frequencyByPair.get(pairKey) ?? 0) + row.totalFrequency);
    totalBySourceLemma.set(row.normalizedLemma, (totalBySourceLemma.get(row.normalizedLemma) ?? 0) + row.totalFrequency);
  }

  const singleWordEntries = courseCatalog.entries.filter((entry) => !entry.isMultiwordExpression);
  const measured = singleWordEntries.map((entry) => {
    const sourcePairKey = `${entry.sourceNormalizedTerm}\u0000${entry.partOfSpeech}`;
    const posFrequency = frequencyByPair.get(sourcePairKey);
    const lemmaFrequency = totalBySourceLemma.get(entry.sourceNormalizedTerm);
    if (!Number.isFinite(posFrequency) || !Number.isFinite(lemmaFrequency) || lemmaFrequency <= 0) {
      throw new Error(`${entry.id}: missing ELELex frequency evidence.`);
    }
    return { entry, sourcePairKey, sourceShare: posFrequency / lemmaFrequency };
  });

  const minimumShareByCanonicalPair = new Map();
  for (const item of measured) {
    const canonicalPairKey = `${item.entry.normalizedTerm}\u0000${item.entry.partOfSpeech}`;
    minimumShareByCanonicalPair.set(canonicalPairKey, Math.min(
      minimumShareByCanonicalPair.get(canonicalPairKey) ?? 1,
      item.sourceShare,
    ));
  }
  const expanded = measured.map((item) => {
    const canonicalPairKey = `${item.entry.normalizedTerm}\u0000${item.entry.partOfSpeech}`;
    return { ...item, canonicalPairKey, riskShare: minimumShareByCanonicalPair.get(canonicalPairKey) };
  });

  const summarize = (items) => Object.fromEntries(LEVELS.map((level) => [level, items.filter(({ entry }) => entry.level === level).length]));
  const thresholds = Object.fromEntries(THRESHOLDS.map((threshold) => {
    const pairLevel = measured.filter((item) => item.sourceShare < threshold);
    const entryLevel = expanded.filter((item) => item.riskShare < threshold);
    return [String(threshold), {
      thresholdExclusive: threshold,
      distinctSourceLemmaPosPairs: pairLevel.length,
      catalogEntries: entryLevel.length,
      catalogEntriesByLevel: summarize(entryLevel),
    }];
  }));
  const cohort = expanded.filter((item) => item.riskShare < 0.5);
  return {
    schemaVersion: 1,
    notHumanReview: true,
    purpose: 'Deterministic targeted QA cohort for catalog entries whose ELELex POS frequency is a minority of the source lemma frequency; not a probability sample.',
    population: {
      frozenCourseCatalogEntries: courseCatalog.entries.length,
      excludedMultiwordExpressions: courseCatalog.entries.length - singleWordEntries.length,
      evaluatedSingleWordCatalogEntries: singleWordEntries.length,
    },
    method: {
      frequencyField: 'ELELex total_freq@total',
      sourcePairShare: 'Sum compatible source-row frequency for (sourceNormalizedTerm, catalog POS), divided by the sum across supported noun/verb/adjective/adverb rows for sourceNormalizedTerm.',
      normalizedDuplicateExpansion: 'After risk is computed on distinct source lemma/POS pairs, every catalog entry sharing the normalized display lemma/POS is included when any source-form pair is below the threshold. This makes each independently generated definition reviewable.',
      thresholdExclusive: 0.5,
      multiwordPolicy: 'Excluded from the 6,171-entry incidence denominator; all 14 have a 100% POS share and do not change flagged counts.',
    },
    thresholds,
    normalizationDuplicate: {
      normalizedTerm: 'solo',
      partOfSpeech: 'adverb',
      sourceRows: [12614, 12904],
      distinctPairCountAt50Percent: thresholds['0.5'].distinctSourceLemmaPosPairs,
      catalogEntryCountAt50Percent: thresholds['0.5'].catalogEntries,
      explanation: 'The sólo → solo display normalization leaves two immutable generated catalog entries. The entry-level review cohort therefore contains both even though the source-pair risk calculation is deduplicated.',
    },
    entries: cohort.map(({ entry, sourcePairKey, canonicalPairKey, sourceShare, riskShare }) => ({
      entryId: entry.id,
      term: entry.term,
      sourceNormalizedTerm: entry.sourceNormalizedTerm,
      partOfSpeech: entry.partOfSpeech,
      level: entry.level,
      sourceRows: entry.sourceRows,
      sourcePairKey,
      canonicalPairKey,
      sourcePairShare: sourceShare,
      cohortRiskShare: riskShare,
      categories: ['minority-pos'],
    })),
  };
}

function targetManifest(level, entries, method) {
  return {
    schemaVersion: 1,
    notHumanReview: true,
    level,
    selectionKind: 'deterministic-targeted-risk-cohort',
    excludedFromProbabilityErrorDenominators: true,
    method,
    entries: entries.filter((entry) => entry.level === level),
  };
}

export function runMinorityPosClassification(argv) {
  const options = parseArgs(argv);
  const elelex = readFileSync(options.elelexPath);
  const catalog = readFileSync(options.catalogPath);
  const courseCatalog = JSON.parse(catalog);
  const report = buildMinorityPosReport(parseElelex(elelex.toString('utf8')), courseCatalog);
  report.sources = {
    elelex: { path: options.elelexPath, sha256: sha256(elelex) },
    courseCatalog: { path: options.catalogPath, sha256: sha256(catalog) },
  };
  const reportPath = resolve(options.outputDirectory, 'minority-pos-cohort.json');
  writeJsonAtomic(reportPath, report);
  for (const level of LEVELS) {
    writeJsonAtomic(resolve(options.outputDirectory, `${level.toLowerCase()}-minority-pos-target.json`), targetManifest(
      level,
      report.entries,
      report.method.normalizedDuplicateExpansion,
    ));
  }
  if (existsSync(options.everydayPath)) {
    const everyday = JSON.parse(readFileSync(options.everydayPath, 'utf8'));
    writeJsonAtomic(resolve(options.outputDirectory, 'a1-everyday-target.json'), targetManifest(
      'A1',
      everyday.entriesByLevel?.A1 ?? [],
      everyday.method,
    ));
  }
  return { reportPath, report };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = runMinorityPosClassification(process.argv.slice(2));
    console.log(canonicalJson({ reportPath: result.reportPath, population: result.report.population, thresholds: result.report.thresholds }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
