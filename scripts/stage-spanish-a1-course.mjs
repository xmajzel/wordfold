import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildTranslationGroups, validateOutput } from './spanish-a1-slovak-translations.mjs';

const COURSE_CATALOG_SHA256 = '69fa0ad43812e0f548c3caf124a0eae295aeb904610f62965630e42362794e04';
const COURSE_ORDER_SHA256 = 'df00242fba3fe5815871095c0b784a239091c6c783894a84cf67535794552a28';
const EXPECTED_SOURCE_GROUPS = 1600;
const EXPECTED_SOURCE_ENTRIES = 1689;
const EXPECTED_STAGED_CONCEPTS = 1599;
const EXPECTED_STAGED_TERMS = 1687;
const OWNER_REVIEW_CHUNK_SIZE = 300;
const REVIEW_DISCLOSURE = 'Definitions are generated and automatically verified against reference sources. They have not been reviewed by native speakers.';

const paths = Object.freeze({
  learnerManifest: resolve('.artifacts/spanish-a1-learner-content/full/manifest.json'),
  releaseAdjudications: resolve('assets/catalog/spanish/a1-learner-content-adjudications.json'),
  crossReviewAdjudications: resolve('assets/catalog/spanish/a1-ai-cross-review-adjudications.json'),
  ownerAdjudications: resolve('assets/catalog/spanish/a1-slovak-owner-adjudications.json'),
  externalQaAdjudications: resolve('assets/catalog/spanish/external-qa-adjudications.json'),
  courseCatalog: resolve('assets/catalog/spanish/cefr-course-catalog.json'),
  courseOrder: resolve('assets/catalog/spanish/cefr-course-order.json'),
  catalogManifest: resolve('assets/catalog/spanish/cefr-catalog-manifest.json'),
  entryMerges: resolve('assets/catalog/spanish/course-entry-merges.json'),
  pilotManifest: resolve('.artifacts/spanish-a1-slovak-translations/pilot/manifest.json'),
  remainingManifest: resolve('.artifacts/spanish-a1-slovak-translations/remaining/manifest.json'),
  initialOwnerReviewManifest: resolve('.artifacts/spanish-a1-slovak-translations/pilot/owner-review-manifest.json'),
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

function assertIgnoredArtifactDirectory(outputDirectory) {
  const artifactsRoot = resolve('.artifacts');
  assert(outputDirectory.startsWith(`${artifactsRoot}${sep}`), 'ShareAlike blocker: staging output must stay under ignored .artifacts.');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readTranslationRecords(manifestPath) {
  const manifest = readJson(manifestPath);
  const records = [];
  for (const batch of manifest.batches) {
    assert(sha256File(batch.inputPath) === batch.inputSha256, `${batch.inputPath}: input hash changed.`);
    const input = readJson(batch.inputPath);
    const output = readJson(batch.outputPath);
    validateOutput(input, output);
    for (let index = 0; index < input.length; index += 1) {
      records.push({ input: input[index], output: output[index] });
    }
  }
  return { manifest, records };
}

function ownerVerdicts(owner) {
  return new Map(owner.entries.map((entry) => [entry.groupId, entry]));
}

function resolvedTranslation(record, ownerEntry) {
  const sharedHint = ownerEntry?.decision === 'sharedHintReplacement'
    ? ownerEntry.replacementSlovakHint
    : record.output.slovakHint;
  const memberOverrides = new Map(record.output.memberOverrides.map((entry) => [entry.entryId, {
    slovakHint: entry.slovakHint,
    source: 'generated-member-override',
    rationale: entry.rationale,
  }]));
  if (ownerEntry?.decision === 'memberOverride') {
    memberOverrides.set(ownerEntry.entryId, {
      slovakHint: ownerEntry.replacementSlovakHint,
      source: 'native-slovak-owner-member-override',
      rationale: ownerEntry.rationale,
    });
  }
  return { sharedHint, memberOverrides };
}

function priorOwnerReviewGroupIds() {
  const manifest = readJson(paths.initialOwnerReviewManifest);
  assert(manifest.selection.size === 30 && manifest.selection.groupIds.length === 30, 'Initial owner review packet is not the approved 30-group slice.');
  assert(sha256File(manifest.packet.path) === manifest.packet.sha256, 'Initial owner review TSV changed.');
  return new Set(manifest.selection.groupIds);
}

export function buildStagedSpanishA1() {
  assert(sha256File(paths.courseCatalog) === COURSE_CATALOG_SHA256, 'Frozen Spanish course catalog hash changed.');
  assert(sha256File(paths.courseOrder) === COURSE_ORDER_SHA256, 'Spanish course order hash changed.');
  const source = buildTranslationGroups(paths.learnerManifest, paths.releaseAdjudications, paths.crossReviewAdjudications);
  const externalQa = readJson(paths.externalQaAdjudications);
  assert(externalQa.notHumanReview === true && externalQa.totals.bucketA === 10
    && externalQa.totals.bucketB === 2 && externalQa.totals.bucketR === 51,
  'External-QA three-way adjudications changed.');
  const externalRepairById = new Map(externalQa.entries
    .filter((entry) => entry.level === 'A1' && entry.bucket === 'A')
    .map((entry) => [entry.entryId, entry]));
  assert(externalRepairById.size === 1, 'Expected one A1 external-QA content repair.');
  const pilot = readTranslationRecords(paths.pilotManifest);
  const remaining = readTranslationRecords(paths.remainingManifest);
  const records = [...pilot.records, ...remaining.records];
  assert(records.length === EXPECTED_SOURCE_GROUPS, 'Expected 1,600 translated source groups.');
  assert(records.reduce((sum, record) => sum + record.input.members.length, 0) === EXPECTED_SOURCE_ENTRIES, 'Expected 1,689 translated source entries.');
  const recordByGroupId = new Map(records.map((record) => [record.input.groupId, record]));
  assert(recordByGroupId.size === EXPECTED_SOURCE_GROUPS, 'Translation group IDs are duplicated.');

  const courseCatalog = readJson(paths.courseCatalog);
  const currentA1Entries = courseCatalog.entries.filter((entry) => entry.level === 'A1');
  assert(currentA1Entries.length === 1705, 'Expected the frozen 1,705-entry A1 membership.');
  const currentById = new Map(currentA1Entries.map((entry) => [entry.id, entry]));
  const courseOrder = readJson(paths.courseOrder);
  const rankByEntryId = new Map(courseOrder.levels.A1.orderedEntries.map((entry) => [entry.entryId, entry.rank]));
  assert(rankByEntryId.size === currentA1Entries.length, 'A1 course-order coverage changed.');
  const entryMerges = readJson(paths.entryMerges);
  assert(entryMerges.notHumanReview === true && entryMerges.merges.length === 1, 'Expected the approved solo entry merge.');
  const merge = entryMerges.merges[0];
  const retiredEntryIds = new Set(merge.retiredEntryIds);
  assert(merge.survivingEntryId === 'es-cefr:8b8ab9d45013c38a' && retiredEntryIds.has('es-cefr:c882e187b6181abf'), 'Unexpected course-entry merge.');

  const owner = readJson(paths.ownerAdjudications);
  assert(owner.notHumanReview === true && owner.coverage.productionConcepts === EXPECTED_STAGED_CONCEPTS, 'Owner adjudications do not target the current production population.');
  const ownerByGroupId = ownerVerdicts(owner);
  const initialReviewIds = priorOwnerReviewGroupIds();

  const concepts = source.groups.map((sourceGroup) => {
    const record = recordByGroupId.get(sourceGroup.groupId);
    assert(record, `${sourceGroup.groupId}: translation is missing.`);
    const members = sourceGroup.members.filter((member) => currentById.has(member.entryId) && !retiredEntryIds.has(member.entryId));
    if (members.length === 0) return null;
    const ownerEntry = ownerByGroupId.get(sourceGroup.groupId);
    const translation = resolvedTranslation(record, ownerEntry);
    const orderedMembers = members.map((member) => {
      const catalogEntry = currentById.get(member.entryId);
      const override = translation.memberOverrides.get(member.entryId);
      const externalRepair = externalRepairById.get(member.entryId);
      const provenanceAliases = member.entryId === merge.survivingEntryId ? [{
        retiredEntryId: merge.retiredEntryIds[0],
        sourceForms: merge.survivingProvenance.sourceForms,
        sourceRows: merge.survivingProvenance.sourceRows,
        omwLexicalEntryIds: merge.survivingProvenance.omwLexicalEntryIds,
        omwSenseAliases: merge.survivingProvenance.omwSenseAliases,
      }] : [];
      return {
        entryId: member.entryId,
        term: member.term,
        normalizedTerm: catalogEntry.normalizedTerm,
        partOfSpeech: member.partOfSpeech,
        definition: externalRepair?.replacementDefinition ?? member.definition,
        example: externalRepair?.replacementExample ?? member.example,
        selectedSenseId: member.selectedSenseId,
        slovakHint: override?.slovakHint ?? translation.sharedHint,
        hintSource: override?.source ?? (ownerEntry?.decision === 'sharedHintReplacement'
          ? 'native-slovak-owner-shared-replacement'
          : 'generated-shared-hint'),
        staleSlovakHint: Boolean(externalRepair?.staleSlovakHint),
        courseOrder: rankByEntryId.get(member.entryId),
        provenanceAliases,
      };
    }).sort((left, right) => left.courseOrder - right.courseOrder || left.entryId.localeCompare(right.entryId));
    const ownerVerdict = ownerEntry
      ? ownerEntry.decision
      : initialReviewIds.has(sourceGroup.groupId) ? 'acceptedSharedHint' : null;
    return {
      id: sourceGroup.groupId,
      notHumanReview: true,
      level: 'A1',
      partOfSpeech: sourceGroup.partOfSpeech,
      courseOrder: orderedMembers[0].courseOrder,
      sharedSlovakHint: translation.sharedHint,
      members: orderedMembers,
      review: {
        spanish: 'owner-approved-automated-reference-qa-plus-independent-ai-cross-review',
        slovakOwnerVerdict: ownerVerdict,
      },
    };
  }).filter(Boolean).sort((left, right) => left.courseOrder - right.courseOrder || left.id.localeCompare(right.id));

  concepts.forEach((concept, index) => { concept.courseOrder = index + 1; });
  assert(concepts.length === EXPECTED_STAGED_CONCEPTS, 'Expected 1,599 staged A1 concepts.');
  assert(concepts.reduce((sum, concept) => sum + concept.members.length, 0) === EXPECTED_STAGED_TERMS, 'Expected 1,687 staged A1 terms after the solo/sólo merge.');
  assert(!concepts.some((concept) => concept.members.some((member) => member.entryId === 'es-cefr:4816e47d42b7fc7e')), 'Excluded Mediterranean named instance reached staging.');
  const reviewedConcepts = concepts.filter((concept) => concept.review.slovakOwnerVerdict).length;
  assert(reviewedConcepts === owner.coverage.verdictsRecorded, 'Owner verdict count does not match the adjudication coverage.');
  assert(concepts.length - reviewedConcepts === owner.coverage.verdictsNotSupplied, 'Pending owner verdict count does not match the adjudication coverage.');

  const catalogManifest = readJson(paths.catalogManifest);
  assert(catalogManifest.productionReviewPolicy.requiredDisclosure === REVIEW_DISCLOSURE, 'Spanish review disclosure changed.');
  return {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'non-distributable-staging',
    distributionBlocker: 'ELELex ShareAlike position unresolved; this artifact must remain under ignored .artifacts and must not be bundled.',
    courseId: 'es-sk',
    sourceLanguageCode: 'es',
    targetLanguageCode: 'sk',
    title: 'Wordfold Spanish A1 non-distributable staging catalog',
    reviewDisclosure: REVIEW_DISCLOSURE,
    pronunciationEnabled: false,
    counts: {
      concepts: concepts.length,
      terms: concepts.reduce((sum, concept) => sum + concept.members.length, 0),
      ownerReviewedConcepts: reviewedConcepts,
      ownerPendingConcepts: concepts.length - reviewedConcepts,
    },
    levels: {
      A1: 'blocked-pending-license-and-owner-review',
      A2: 'not-generated',
      B1: 'not-generated',
      B2: 'not-generated',
      C1: 'not-generated',
      C2: 'unavailable-no-elelex-source-level',
    },
    concepts,
  };
}

function tsvCell(value) {
  const normalized = String(value).replace(/[\r\n\t]+/gu, ' ').trim();
  return /["\t\n]/u.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

function ownerVerdictCell(concept, ownerByGroupId) {
  if (!concept.review.slovakOwnerVerdict) return '';
  const entry = ownerByGroupId.get(concept.id);
  if (!entry) return 'accepted';
  if (entry.decision === 'memberOverride') return `accepted — ${entry.term} → ${entry.replacementSlovakHint}`;
  if (entry.decision === 'sharedHintReplacement') return `accepted — shared hint: ${entry.replacementSlovakHint}`;
  return 'accepted';
}

function conceptHintCell(concept) {
  const differences = concept.members.filter((member) => member.slovakHint !== concept.sharedSlovakHint);
  return differences.length === 0
    ? concept.sharedSlovakHint
    : `${concept.sharedSlovakHint}; ${differences.map((member) => `${member.term} → ${member.slovakHint}`).join('; ')}`;
}

export function prepareOwnerReview(outputDirectory) {
  assertIgnoredArtifactDirectory(outputDirectory);
  const catalog = buildStagedSpanishA1();
  const ownerByGroupId = ownerVerdicts(readJson(paths.ownerAdjudications));
  const chunks = [];
  for (let offset = 0; offset < catalog.concepts.length; offset += OWNER_REVIEW_CHUNK_SIZE) {
    const concepts = catalog.concepts.slice(offset, offset + OWNER_REVIEW_CHUNK_SIZE);
    const rows = [['Spanish term', 'POS', 'Spanish definition', 'Proposed Slovak hint', 'Owner verdict']];
    for (const concept of concepts) {
      rows.push([
        concept.members.map((member) => member.term).join(' / '),
        concept.partOfSpeech,
        [...new Set(concept.members.map((member) => member.definition))].join(' | '),
        conceptHintCell(concept),
        ownerVerdictCell(concept, ownerByGroupId),
      ]);
    }
    const text = `${rows.map((row) => row.map(tsvCell).join('\t')).join('\n')}\n`;
    const chunkNumber = chunks.length + 1;
    const path = resolve(outputDirectory, `spanish-a1-owner-review-${String(chunkNumber).padStart(2, '0')}.tsv`);
    writeFileAtomic(path, text);
    chunks.push({
      chunkNumber,
      conceptCount: concepts.length,
      firstCourseOrder: concepts[0].courseOrder,
      lastCourseOrder: concepts.at(-1).courseOrder,
      path,
      sha256: sha256(text),
    });
  }
  assert(chunks.length === 6 && chunks.at(-1).conceptCount === 99, 'Expected owner-review chunks of 300/300/300/300/300/99.');
  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'awaiting-native-slovak-owner-review',
    courseId: 'es-sk',
    level: 'A1',
    reviewerRole: 'native-Slovak-speaking owner',
    ordering: 'Level, then deterministic ELELex document-count course order; A1 is the only generated level.',
    format: 'TSV; one row per shared-sense concept after the header.',
    counts: {
      concepts: catalog.counts.concepts,
      terms: catalog.counts.terms,
      previouslyReviewedConcepts: catalog.counts.ownerReviewedConcepts,
      verdictsPending: catalog.counts.ownerPendingConcepts,
      chunks: chunks.length,
    },
    verdictInstructions: 'Keep the prefilled accepted verdicts unless correcting them. For blank rows, record accepted, a corrected shared hint, member-specific overrides, or drop with a concise rationale.',
    sourceHashes: sourceHashes(),
    chunks,
  };
  writeFileAtomic(resolve(outputDirectory, 'manifest.json'), canonicalJson(manifest));
  return manifest;
}

function sourceHashes() {
  return Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, {
    path: relative(resolve('.'), path),
    sha256: sha256File(path),
  }]));
}

export function stageCourse(outputDirectory) {
  assertIgnoredArtifactDirectory(outputDirectory);
  const catalog = buildStagedSpanishA1();
  const catalogText = canonicalJson(catalog);
  const catalogPath = resolve(outputDirectory, 'catalog.json');
  writeFileAtomic(catalogPath, catalogText);
  const manifest = {
    schemaVersion: 1,
    notHumanReview: true,
    status: 'blocked-non-distributable-staging',
    distributionAllowed: false,
    blockers: [
      'ELELex ShareAlike position unresolved.',
      `${catalog.counts.ownerPendingConcepts} Slovak concepts still require owner verdicts.`,
    ],
    catalog: { path: catalogPath, sha256: sha256(catalogText), counts: catalog.counts },
    sourceHashes: sourceHashes(),
  };
  writeFileAtomic(resolve(outputDirectory, 'manifest.json'), canonicalJson(manifest));
  return manifest;
}

function parseArgs(argv) {
  const command = argv[0];
  const defaultDirectory = command === 'owner-review'
    ? '.artifacts/spanish-a1-owner-review'
    : '.artifacts/spanish-a1-production-staging';
  let outputDirectory = resolve(defaultDirectory);
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir') outputDirectory = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  assert(['stage', 'owner-review', 'validate'].includes(command), 'Usage: stage-spanish-a1-course.mjs stage|owner-review|validate [--output-dir PATH]');
  return { command, outputDirectory };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = options.command === 'stage'
      ? stageCourse(options.outputDirectory)
      : options.command === 'owner-review'
        ? prepareOwnerReview(options.outputDirectory)
        : { status: 'valid', counts: buildStagedSpanishA1().counts };
    console.log(canonicalJson(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
