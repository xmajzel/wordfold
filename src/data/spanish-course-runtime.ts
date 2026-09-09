import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';

export const SPANISH_DEFINITION_REVIEW_DISCLOSURE = 'Definitions are generated and automatically verified against reference sources. They have not been reviewed by native speakers.';

export type SpanishCourseLevelState =
  | 'blocked-pending-license-and-owner-review'
  | 'available'
  | 'not-generated'
  | 'unavailable-no-elelex-source-level';

export interface SpanishCourseMember {
  entryId: string;
  term: string;
  normalizedTerm: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  selectedSenseId: string;
  slovakHint: string;
  hintSource: string;
  courseOrder: number;
  provenanceAliases?: {
    retiredEntryId: string;
    sourceForms: string[];
    sourceRows: number[];
    omwLexicalEntryIds: string[];
    omwSenseAliases: string[];
  }[];
}

export interface SpanishCourseConcept {
  id: string;
  notHumanReview: true;
  level: 'A1';
  partOfSpeech: string;
  courseOrder: number;
  sharedSlovakHint: string;
  members: SpanishCourseMember[];
  review: {
    spanish: string;
    slovakOwnerVerdict: string | null;
  };
}

export interface SpanishCourseAsset {
  schemaVersion: 1;
  notHumanReview: true;
  status: 'non-distributable-staging' | 'production';
  distributionBlocker?: string;
  courseId: 'es-sk';
  sourceLanguageCode: 'es';
  targetLanguageCode: 'sk';
  title: string;
  reviewDisclosure: string;
  pronunciationEnabled: boolean;
  counts: {
    concepts: number;
    terms: number;
    ownerReviewedConcepts: number;
    ownerPendingConcepts: number;
  };
  levels: Record<CefrLevel, SpanishCourseLevelState>;
  concepts: SpanishCourseConcept[];
}

export interface SpanishRuntimeCatalogEntry extends CefrCatalogEntry {
  conceptId: string;
  memberEntryId: string;
  alternativeTerms: string[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function validateSpanishCourseAsset(asset: SpanishCourseAsset) {
  assert(asset.schemaVersion === 1 && asset.notHumanReview === true, 'Unsupported Spanish course asset.');
  assert(asset.courseId === 'es-sk' && asset.sourceLanguageCode === 'es' && asset.targetLanguageCode === 'sk', 'Spanish course identity must be es-sk.');
  assert(asset.status === 'non-distributable-staging' || asset.status === 'production', 'Invalid Spanish course status.');
  assert(asset.status !== 'production' || !asset.distributionBlocker, 'A production Spanish course cannot retain a distribution blocker.');
  assert(asset.reviewDisclosure === SPANISH_DEFINITION_REVIEW_DISCLOSURE, 'Spanish review disclosure must use the approved wording.');
  assert(asset.pronunciationEnabled === false, 'Spanish pronunciation must remain disabled for the initial A1 release.');
  assert(asset.levels.A1 === (asset.status === 'production' ? 'available' : 'blocked-pending-license-and-owner-review'), 'A1 availability does not match the asset status.');
  assert(asset.levels.C2 === 'unavailable-no-elelex-source-level', 'Spanish C2 must remain unavailable without a source level.');

  const conceptIds = new Set<string>();
  const memberIds = new Set<string>();
  let previousOrder = 0;
  let termCount = 0;
  let reviewedCount = 0;
  for (const concept of asset.concepts) {
    assert(!conceptIds.has(concept.id), `Duplicate Spanish concept ID: ${concept.id}`);
    assert(concept.notHumanReview === true && concept.level === 'A1', `${concept.id}: invalid review or level metadata.`);
    assert(concept.courseOrder === previousOrder + 1, `${concept.id}: course order must be contiguous.`);
    assert(concept.members.length > 0, `${concept.id}: concept has no members.`);
    conceptIds.add(concept.id);
    previousOrder = concept.courseOrder;
    if (concept.review.slovakOwnerVerdict) reviewedCount += 1;
    for (const member of concept.members) {
      assert(!memberIds.has(member.entryId), `Duplicate Spanish member ID: ${member.entryId}`);
      assert(member.partOfSpeech === concept.partOfSpeech, `${member.entryId}: member POS differs from its concept.`);
      assert(Boolean(member.term.trim() && member.normalizedTerm.trim() && member.definition.trim() && member.example.trim() && member.slovakHint.trim()), `${member.entryId}: learner content is incomplete.`);
      memberIds.add(member.entryId);
      termCount += 1;
    }
  }
  assert(asset.counts.concepts === asset.concepts.length, 'Spanish concept count does not match the manifest.');
  assert(asset.counts.terms === termCount, 'Spanish term count does not match the manifest.');
  assert(asset.counts.ownerReviewedConcepts === reviewedCount, 'Spanish owner-review count does not match the concepts.');
  assert(asset.counts.ownerPendingConcepts === asset.concepts.length - reviewedCount, 'Spanish pending-review count does not match the concepts.');
  assert(asset.status !== 'production' || asset.counts.ownerPendingConcepts === 0, 'A production Spanish course requires an owner verdict for every Slovak concept.');
}

function presentation(concept: SpanishCourseConcept, member: SpanishCourseMember): SpanishRuntimeCatalogEntry {
  return {
    id: member.entryId,
    conceptId: concept.id,
    memberEntryId: member.entryId,
    term: member.term,
    normalizedTerm: member.normalizedTerm,
    level: concept.level,
    partOfSpeech: member.partOfSpeech,
    definition: member.definition,
    example: member.example,
    translation: member.slovakHint,
    catalogSenseId: concept.id,
    source: 'wordfold-original-spanish',
    sourceVersion: 'elelex-a1-v1',
    sourcePartOfSpeech: [member.partOfSpeech],
    alternativeTerms: concept.members.filter((candidate) => candidate.entryId !== member.entryId).map((candidate) => candidate.term),
  };
}

export function createSpanishCourseRuntime(asset: SpanishCourseAsset) {
  validateSpanishCourseAsset(asset);
  const conceptById = new Map(asset.concepts.map((concept) => [concept.id, concept]));
  const matchesByNormalizedTerm = new Map<string, { concept: SpanishCourseConcept; member: SpanishCourseMember }[]>();
  for (const concept of asset.concepts) {
    for (const member of concept.members) {
      const matches = matchesByNormalizedTerm.get(member.normalizedTerm) ?? [];
      matches.push({ concept, member });
      matchesByNormalizedTerm.set(member.normalizedTerm, matches);
    }
  }
  return {
    levelState(level: CefrLevel) {
      return asset.levels[level];
    },
    entries(level: CefrLevel) {
      if (asset.levels[level] !== 'available') return [];
      return asset.concepts.filter((concept) => concept.level === level)
        .map((concept) => presentation(concept, concept.members[0]));
    },
    entry(catalogSenseId: string | null) {
      const concept = catalogSenseId ? conceptById.get(catalogSenseId) : undefined;
      return concept ? presentation(concept, concept.members[0]) : null;
    },
    entriesForNormalizedTerm(normalizedTerm: string) {
      if (asset.levels.A1 !== 'available') return [];
      return (matchesByNormalizedTerm.get(normalizedTerm) ?? [])
        .map(({ concept, member }) => presentation(concept, member));
    },
  };
}
