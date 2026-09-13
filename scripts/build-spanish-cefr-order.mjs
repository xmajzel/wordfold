import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeFileAtomic(path, value) {
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

function assignedLevelDocumentCount(entry) {
  const count = entry.levelAssignment?.documentCount?.[entry.level];
  if (!Number.isInteger(count) || count < 0) throw new Error(`${entry.id}: missing assigned-level ELELex document count.`);
  return count;
}

export function orderWithinLevels(entries, levels = LEVELS) {
  const levelIndex = new Map(levels.map((level, index) => [level, index]));
  return [...entries].sort((left, right) => {
    const byLevel = levelIndex.get(left.level) - levelIndex.get(right.level);
    const byDocuments = assignedLevelDocumentCount(right) - assignedLevelDocumentCount(left);
    const byTerm = left.normalizedTerm.localeCompare(right.normalizedTerm, 'es', { sensitivity: 'base' });
    const byPartOfSpeech = left.partOfSpeech.localeCompare(right.partOfSpeech, 'en');
    return byLevel || byDocuments || byTerm || byPartOfSpeech || left.id.localeCompare(right.id, 'en');
  });
}

export function buildCourseOrderSidecar(courseCatalog, sourceCourseCatalogSha256) {
  if (courseCatalog.schemaVersion !== 1 || courseCatalog.courseId !== 'es-sk' || !Array.isArray(courseCatalog.entries)) {
    throw new Error('Expected the frozen Spanish CEFR course catalog.');
  }
  const levels = courseCatalog.levels;
  if (JSON.stringify(levels) !== JSON.stringify(LEVELS)) throw new Error('Unexpected Spanish CEFR levels.');
  const ordered = orderWithinLevels(courseCatalog.entries, levels);
  return {
    schemaVersion: 1,
    notHumanReview: true,
    courseId: courseCatalog.courseId,
    sourceCourseCatalogSha256,
    policy: {
      role: 'Ordering only; this never changes an ELELex CEFR level assignment.',
      primary: 'Descending ELELex document count at the entry assigned level.',
      tieBreakers: ['normalized Spanish term', 'part of speech', 'stable entry ID'],
      limitation: 'ELELex document counts are an exposure-breadth sequencing signal, not calibrated CEFR sub-bands or a general corpus-frequency ranking.',
      subBands: false,
    },
    counts: courseCatalog.counts,
    levels: Object.fromEntries(levels.map((level) => {
      const entries = ordered.filter((entry) => entry.level === level);
      return [level, {
        entryCount: entries.length,
        orderedEntries: entries.map((entry, index) => ({
          entryId: entry.id,
          rank: index + 1,
          assignedLevelDocumentCount: assignedLevelDocumentCount(entry),
        })),
      }];
    })),
  };
}

export function runCourseOrderBuild(catalogPath, outputPath) {
  const catalogText = readFileSync(catalogPath);
  const catalog = JSON.parse(catalogText);
  const sidecar = buildCourseOrderSidecar(catalog, sha256(catalogText));
  writeFileAtomic(outputPath, canonicalJson(sidecar));
  return { outputPath, outputSha256: sha256(canonicalJson(sidecar)), sidecar };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const catalogPath = resolve(process.argv[2] ?? 'assets/catalog/spanish/cefr-course-catalog.json');
    const outputPath = resolve(process.argv[3] ?? 'assets/catalog/spanish/cefr-course-order.json');
    const result = runCourseOrderBuild(catalogPath, outputPath);
    console.log(`Wrote ${result.outputPath}`);
    console.log(`SHA-256: ${result.outputSha256}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
