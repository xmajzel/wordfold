import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { buildStagedSpanishA1 } from './stage-spanish-a1-course.mjs';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const EXPECTED_COUNTS = Object.freeze({ A1: 1564, A2: 322, B1: 311, B2: 307, C1: 300 });
const HEADER = [
  'level', 'queueType', 'reviewItemId', 'groupId', 'spanishTerm', 'pos',
  'spanishDefinition', 'proposedSlovakHint', 'criticalError', 'materialError',
  'verdict', 'notes', 'attention',
];
const SOURCE_HEADER = HEADER.slice(2, 12);
const OUTPUT_DIRECTORY = resolve('.artifacts/spanish-owner-review');
const OUTPUT_PATH = resolve(OUTPUT_DIRECTORY, 'outstanding-owner-review-queue.tsv');
const MANIFEST_PATH = resolve(OUTPUT_DIRECTORY, 'manifest.json');
const A1_OWNER_ADJUDICATIONS_PATH = resolve('assets/catalog/spanish/a1-slovak-owner-adjudications.json');
const CATALOG_MANIFEST_PATH = resolve('assets/catalog/spanish/cefr-catalog-manifest.json');
const AMENDMENT_PATH = resolve('assets/catalog/spanish/b1-post-translation-content-corrections.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, value);
  renameSync(temporaryPath, path);
}

function tsvCell(value) {
  return String(value ?? '').replace(/[\r\n\t]+/gu, ' ').trim();
}

function withoutDiacritics(value) {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').toLocaleLowerCase('es').replace(/\s+/gu, ' ').trim();
}

function hintValues(hintCell) {
  return hintCell.split(' | ').map((part) => {
    const separator = part.indexOf(': ');
    return separator === -1 ? part.trim() : part.slice(separator + 2).trim();
  });
}

export function attentionMarker(spanishTerm, proposedSlovakHint) {
  const terms = spanishTerm.split(' / ').map((term) => term.trim()).filter(Boolean);
  const hints = hintValues(proposedSlovakHint);
  if (terms.length > 1 || hints.length > 1) return 'shared';
  if (terms.length === 1 && hints.length === 1 && withoutDiacritics(terms[0]) === withoutDiacritics(hints[0])) return 'cognate';
  if (hints.some((hint) => hint.split(/\s+/u).filter(Boolean).length >= 3)) return 'phrase';
  return '';
}

function a1Rows() {
  const catalog = buildStagedSpanishA1({ applyAiAssistedVerdicts: false });
  const historicalQaInput = catalog.concepts.filter((concept) => concept.review.slovakOwnerVerdictProvenance !== 'historical-owner-accepted');
  assert(historicalQaInput.length === EXPECTED_COUNTS.A1, `A1 historical QA input count changed: ${historicalQaInput.length}.`);
  return historicalQaInput.map((concept) => {
    const term = concept.members.map((member) => member.term).join(' / ');
    const definition = concept.members.map((member) => `${member.term}: ${member.definition}`).join(' | ');
    const hint = concept.members.map((member) => `${member.term}: ${member.slovakHint}`).join(' | ');
    return [
      'A1', 'historical-full-population', `SK-A1-F-${String(concept.courseOrder).padStart(4, '0')}`,
      concept.id, term, concept.partOfSpeech, definition, hint, '', '', '', '',
      attentionMarker(term, hint),
    ];
  });
}

function readSourceRows(level, queueType, path, amendmentByGroupId) {
  const text = readFileSync(path, 'utf8');
  const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
  const header = lines.shift().split('\t');
  assert(header.join('\t') === SOURCE_HEADER.join('\t'), `${level}/${queueType}: unexpected TSV header.`);
  const rows = lines.filter(Boolean).map((line) => {
    const source = line.split('\t');
    assert(source.length === SOURCE_HEADER.length, `${level}/${queueType}: expected ${SOURCE_HEADER.length} source columns.`);
    const amendment = amendmentByGroupId.get(source[1]);
    if (amendment) source[4] = `${amendment.term}: ${amendment.replacementDefinition}`;
    return [level, queueType, ...source, attentionMarker(source[2], source[5])];
  });
  return { rows, source: { level, queueType, path, sha256: sha256(text), rows: rows.length } };
}

function laterRows() {
  const amendmentText = readFileSync(AMENDMENT_PATH, 'utf8');
  const amendments = JSON.parse(amendmentText);
  assert(amendments.notHumanReview === true && Array.isArray(amendments.entries), 'Invalid B1 content amendment sidecar.');
  const amendmentByGroupId = new Map(amendments.entries.map((entry) => [entry.groupId, entry]));
  const rows = [];
  const sources = [];
  for (const level of LEVELS.slice(1)) {
    const directory = resolve(`.artifacts/spanish-${level.toLowerCase()}-owner-review`);
    const manifestPath = resolve(directory, 'manifest.json');
    const manifestText = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);
    assert(manifest.notHumanReview === true && manifest.level === level && manifest.probabilitySample.size === 300,
      `${level}: invalid sampled owner-review manifest.`);
    for (const [queueType, filename] of [['probability', 'probability-sample-300.tsv'], ['targeted', 'targeted-shared-hint-findings.tsv']]) {
      const loaded = readSourceRows(level, queueType, resolve(directory, filename), amendmentByGroupId);
      rows.push(...loaded.rows);
      sources.push({ ...loaded.source, manifestPath, manifestSha256: sha256(manifestText) });
    }
  }
  return { rows, sources, amendmentText };
}

function attentionCounts(rows) {
  return Object.fromEntries(['shared', 'cognate', 'phrase', ''].map((marker) => [marker || 'empty', rows.filter((row) => row[12] === marker).length]));
}

function sittingRanges(rows) {
  const ranges = [];
  for (const level of LEVELS) {
    const indexed = rows.map((row, index) => ({ row, index })).filter(({ row }) => row[0] === level);
    for (let offset = 0; offset < indexed.length; offset += 300) {
      const slice = indexed.slice(offset, offset + 300);
      ranges.push({
        id: `${level}-${String(ranges.filter((range) => range.level === level).length + 1).padStart(2, '0')}`,
        level,
        rows: slice.length,
        dataRowStart: slice[0].index + 1,
        dataRowEnd: slice.at(-1).index + 1,
        tsvLineStart: slice[0].index + 2,
        tsvLineEnd: slice.at(-1).index + 2,
      });
    }
  }
  return ranges;
}

export function combineOwnerReview() {
  const a1OwnerAdjudicationsText = readFileSync(A1_OWNER_ADJUDICATIONS_PATH, 'utf8');
  const a1OwnerAdjudications = JSON.parse(a1OwnerAdjudicationsText);
  assert(a1OwnerAdjudications.notHumanReview === true
    && a1OwnerAdjudications.coverage.policyRequiredFlaggedConcepts === 47
    && a1OwnerAdjudications.coverage.policyRequiredVerdictsRecorded === 47
    && a1OwnerAdjudications.coverage.policyRequiredVerdictsPending === 0,
  'A1 narrowed-policy verdict coverage changed.');
  const catalogManifestText = readFileSync(CATALOG_MANIFEST_PATH, 'utf8');
  const catalogManifest = JSON.parse(catalogManifestText);
  assert(catalogManifest.notHumanReview === true, 'Catalog manifest must remain notHumanReview.');

  const a1 = a1Rows();
  const later = laterRows();
  const rows = [...a1, ...later.rows].map((row) => row.map(tsvCell));
  assert(rows.length === 2804, `Expected 2,804 correspondence-QA input rows; found ${rows.length}.`);
  assert(rows.every((row) => row.length === HEADER.length), 'Every consolidated row must have 13 columns.');
  assert(new Set(rows.map((row) => `${row[0]}\u0000${row[3]}`)).size === rows.length, 'Duplicate level/group rows reached the queue.');

  const countsByLevel = Object.fromEntries(LEVELS.map((level) => {
    const levelRows = rows.filter((row) => row[0] === level);
    return [level, {
      totalQaInputRows: levelRows.length,
      historicalFullPopulationRows: levelRows.filter((row) => row[1] === 'historical-full-population').length,
      probabilityRows: levelRows.filter((row) => row[1] === 'probability').length,
      additionalTargetedRows: levelRows.filter((row) => row[1] === 'targeted').length,
      attention: attentionCounts(levelRows),
    }];
  }));
  for (const level of LEVELS) assert(countsByLevel[level].totalQaInputRows === EXPECTED_COUNTS[level], `${level}: count mismatch.`);

  const tsv = `${[HEADER, ...rows].map((row) => row.join('\t')).join('\n')}\n`;
  writeAtomic(OUTPUT_PATH, tsv);
  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'historical-a1-and-later-levels-prepared-for-ai-correspondence-qa',
    courseId: 'es-sk',
    ordering: 'Level A1-C1; within A1, immutable course order; within sampled levels, probability rows followed by non-overlapping targeted rows in their existing deterministic order.',
    schema: { columns: HEADER, columnCount: HEADER.length },
    attentionPolicy: {
      deterministic: true,
      precedence: ['shared', 'cognate', 'phrase', 'empty'],
      shared: 'Spanish term has multiple members or the proposed hint uses multi-member/override formatting.',
      cognate: 'A singleton Slovak hint exactly matches its Spanish term after Unicode diacritic stripping and lowercasing.',
      phrase: 'A singleton Slovak hint contains at least three whitespace-delimited words.',
      empty: 'No listed marker applies; normally an ordinary one- or two-word equivalent.',
    },
    totalQaInputRows: rows.length,
    countsByLevel,
    historicalOwnerVerdictsExcluded: { A1: 35, A2: 0, B1: 0, B2: 0, C1: 0 },
    samplingPolicy: {
      A1: 'Historical complete-concept correspondence-QA input after excluding the 35 earlier owner verdicts. The resulting 47 flags are now resolved and this population is no longer an A1 release gate.',
      A2ThroughC1: '300-row probability sample per level plus non-overlapping targeted divergence-gate rows.',
      targetedRowsExcludedFromProbabilityDenominator: true,
      criticalErrorMaximumRate: 0.02,
      materialErrorMaximumRate: 0.05,
    },
    a1OnlyReleasePath: {
      historicalA1RowsEnteredCorrespondenceQa: 1564,
      historicalOwnerVerdicts: 35,
      shareAlikeClearanceRequired: false,
      shareAlikeClearanceStatus: 'cleared-for-described-wordfold-use',
      rowsRequiredFromA2ThroughC1: 0,
      statement: 'The ELELex licensing gate and all 47 policy-required A1 verdicts are clear. The 70 unresolved A2-C1 flagged rows do not gate an A1-only release.',
    },
    sittings: sittingRanges(rows),
    sources: {
      a1OwnerAdjudications: { path: A1_OWNER_ADJUDICATIONS_PATH, sha256: sha256(a1OwnerAdjudicationsText) },
      catalogManifest: { path: CATALOG_MANIFEST_PATH, sha256: sha256(catalogManifestText) },
      laterQueues: later.sources,
      b1ContentAmendment: { path: AMENDMENT_PATH, sha256: sha256(later.amendmentText) },
    },
    output: { path: OUTPUT_PATH, sha256: sha256(tsv) },
    workflowRestriction: 'This ignored full-population QA input is an intermediate review artifact and must not be bundled.',
  };
  writeAtomic(MANIFEST_PATH, canonicalJson(manifest));
  return { outputPath: OUTPUT_PATH, manifestPath: MANIFEST_PATH, manifest };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = combineOwnerReview();
  console.log(canonicalJson({
    outputPath: result.outputPath,
    manifestPath: result.manifestPath,
    totalQaInputRows: result.manifest.totalQaInputRows,
    countsByLevel: result.manifest.countsByLevel,
  }));
}
