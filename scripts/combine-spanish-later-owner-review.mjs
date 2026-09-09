import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, value);
  renameSync(temporaryPath, path);
}

const levels = ['B1', 'B2', 'C1'];
const outputDirectory = resolve('.artifacts/spanish-b1-c1-owner-review');
const amendmentPath = resolve('assets/catalog/spanish/b1-post-translation-content-corrections.json');
const amendmentText = readFileSync(amendmentPath, 'utf8');
const amendments = JSON.parse(amendmentText);
if (amendments.notHumanReview !== true || !Array.isArray(amendments.entries)) {
  throw new Error('Invalid B1 post-translation content-correction sidecar.');
}
const amendmentByGroupId = new Map(amendments.entries.map((entry) => [entry.groupId, entry]));
const header = ['level', 'queueType', 'reviewItemId', 'groupId', 'spanishTerm', 'pos', 'spanishDefinition', 'proposedSlovakHint', 'criticalError', 'materialError', 'verdict', 'notes'];
const rows = [];
const sources = [];
for (const level of levels) {
  const directory = resolve(`.artifacts/spanish-${level.toLowerCase()}-owner-review`);
  const manifestPath = resolve(directory, 'manifest.json');
  const manifestText = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestText);
  if (manifest.notHumanReview !== true || manifest.level !== level || manifest.probabilitySample.size !== 300) {
    throw new Error(`${level}: invalid sampled owner-review manifest.`);
  }
  for (const [queueType, filename] of [['probability', 'probability-sample-300.tsv'], ['targeted', 'targeted-shared-hint-findings.tsv']]) {
    const path = resolve(directory, filename);
    const text = readFileSync(path, 'utf8');
    const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
    const sourceHeader = lines.shift().split('\t');
    if (sourceHeader.join('\t') !== header.slice(2).join('\t')) throw new Error(`${level}/${filename}: unexpected TSV header.`);
    for (const line of lines) {
      const row = [level, queueType, ...line.split('\t')];
      const amendment = amendmentByGroupId.get(row[3]);
      if (amendment) row[6] = `${amendment.term}: ${amendment.replacementDefinition}`;
      rows.push(row);
    }
    sources.push({ level, queueType, path, sha256: sha256(text), rows: lines.length });
  }
}
const tsv = `${[header, ...rows].map((row) => row.join('\t')).join('\n')}\n`;
const outputPath = resolve(outputDirectory, 'owner-review-queue.tsv');
writeAtomic(outputPath, tsv);
const countsByLevel = Object.fromEntries(levels.map((level) => [level, {
  probabilityRows: rows.filter((row) => row[0] === level && row[1] === 'probability').length,
  additionalTargetedRows: rows.filter((row) => row[0] === level && row[1] === 'targeted').length,
}]));
const manifest = {
  schemaVersion: 1,
  notHumanReview: true,
  status: 'awaiting-native-owner-review',
  courseId: 'es-sk',
  levels,
  policy: {
    probabilityRowsPerLevel: 300,
    targetedRowsExcludedFromProbabilityDenominator: true,
    criticalErrorMaximumRate: 0.02,
    materialErrorMaximumRate: 0.05,
    escalation: 'If either bound is crossed within a level probability sample, expand that level sample or require 100% review.',
    productCopy: 'A1 Slovak hints reviewed by a native speaker; A2-C1 sampled.',
    a1SlovakOwnerDisagreementBaseline: 'pending-completion-of-full-A1-owner-review',
  },
  countsByLevel,
  totalRows: rows.length,
  sources,
  contentAmendments: {
    path: amendmentPath,
    sha256: sha256(amendmentText),
    appliedRows: rows.filter((row) => amendmentByGroupId.has(row[3])).length,
    preservesExistingSlovakHints: amendments.entries.every((entry) => entry.affectsSlovakHint === false),
  },
  output: { path: outputPath, sha256: sha256(tsv) },
};
writeAtomic(resolve(outputDirectory, 'manifest.json'), canonicalJson(manifest));
console.log(canonicalJson({ outputPath, sourceFiles: sources.length, totalRows: rows.length }));
