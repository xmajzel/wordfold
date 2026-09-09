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

const level = process.argv[2]?.toUpperCase();
if (!['B2', 'C1'].includes(level)) throw new Error('Usage: prepare-spanish-post-adjudication-qa.mjs B2|C1');
const slug = level.toLowerCase();
const sidecarPath = resolve(`assets/catalog/spanish/${slug}-external-qa-adjudications.json`);
const sidecarText = readFileSync(sidecarPath);
const sidecar = JSON.parse(sidecarText);
const repairs = sidecar.entries.filter((entry) => entry.bucket === 'A');
if (repairs.length !== sidecar.counts.A) throw new Error(`${level}: bucket-A count mismatch.`);
const target = {
  schemaVersion: 1,
  notHumanReview: true,
  level,
  selectionKind: 'post-adjudication-bucket-a-external-verification-census',
  excludedFromProbabilityErrorDenominators: true,
  method: 'Every bucket-A replacement is rechecked against the unchanged pinned external reference. This census is excluded from probability estimates.',
  adjudicationSidecar: { path: sidecarPath, sha256: sha256(sidecarText) },
  entries: repairs.map((entry) => ({ entryId: entry.entryId, term: entry.term, partOfSpeech: entry.partOfSpeech, categories: ['post-correction'] })),
};
writeAtomic(resolve(`.artifacts/spanish-${slug}-post-correction-quality-qa/target.json`), canonicalJson(target));
console.log(canonicalJson({ level, repairs: repairs.length }));
