import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';

export const SPANISH_DEFINITION_REVIEW_DISCLOSURE = 'Spanish definitions are generated and automatically verified against reference sources; they have not been reviewed by native Spanish speakers. Slovak hints are checked against linked lexical references where available and independently AI cross-reviewed; they have not been reviewed by native Slovak speakers. Flagged A1 hints carry AI-assisted, owner-accepted verdicts. Spanish–Slovak sense correspondence has not been verified by a native bilingual reviewer.';

export type SpanishCourseLevelState =
  | 'blocked-pending-owner-review'
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
  level: Exclude<CefrLevel, 'C2'>;
  partOfSpeech: string;
  courseOrder: number;
  sharedSlovakHint: string;
  members: SpanishCourseMember[];
  review: {
    spanish: string;
    slovakOwnerVerdict: string | null;
    slovakOwnerVerdictProvenance: 'historical-owner-accepted' | 'ai-assisted-owner-accepted' | null;
    slovakOwnerVerdictRequired: boolean;
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
    ownerVerdictRequiredConcepts: number;
    ownerResolvedRequiredConcepts: number;
    ownerPendingConcepts: number;
  };
  levels: Record<CefrLevel, SpanishCourseLevelState>;
  excludedConcepts?: { id: string; level: Exclude<CefrLevel, 'A1' | 'C2'>; reason: 'pending-owner-verdict' | 'stale-slovak-hint' }[];
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
  assert(asset.pronunciationEnabled === false, 'Spanish pronunciation must remain disabled.');
  assert(asset.levels.A1 === (asset.status === 'production' ? 'available' : 'blocked-pending-owner-review'), 'A1 availability does not match the asset status.');
  assert(asset.levels.C2 === 'unavailable-no-elelex-source-level', 'Spanish C2 must remain unavailable without a source level.');

  const conceptIds = new Set<string>();
  const memberIds = new Set<string>();
  const previousOrderByLevel = new Map<CefrLevel, number>();
  const excludedIds = new Set(asset.excludedConcepts?.map((concept) => concept.id));
  let termCount = 0;
  let reviewedCount = 0;
  let requiredCount = 0;
  let resolvedRequiredCount = 0;
  for (const concept of asset.concepts) {
    assert(!conceptIds.has(concept.id), `Duplicate Spanish concept ID: ${concept.id}`);
    assert(!excludedIds.has(concept.id), `${concept.id}: a pending review finding cannot be bundled.`);
    assert(concept.notHumanReview === true && ['A1', 'A2', 'B1', 'B2', 'C1'].includes(concept.level), `${concept.id}: invalid review or level metadata.`);
    assert(['available', 'blocked-pending-owner-review'].includes(asset.levels[concept.level]), `${concept.id}: content cannot belong to an unavailable level.`);
    assert(concept.courseOrder === (previousOrderByLevel.get(concept.level) ?? 0) + 1, `${concept.id}: course order must be contiguous within its level.`);
    assert(concept.members.length > 0, `${concept.id}: concept has no members.`);
    conceptIds.add(concept.id);
    previousOrderByLevel.set(concept.level, concept.courseOrder);
    if (concept.review.slovakOwnerVerdict) reviewedCount += 1;
    if (concept.review.slovakOwnerVerdictRequired) {
      requiredCount += 1;
      assert(concept.review.slovakOwnerVerdictProvenance === 'ai-assisted-owner-accepted',
        `${concept.id}: required Slovak verdict must retain AI-assisted provenance.`);
      if (concept.review.slovakOwnerVerdict) resolvedRequiredCount += 1;
    }
    for (const member of concept.members) {
      assert(!memberIds.has(member.entryId), `Duplicate Spanish member ID: ${member.entryId}`);
      assert(member.partOfSpeech === concept.partOfSpeech, `${member.entryId}: member POS differs from its concept.`);
      assert(Boolean(member.term.trim() && member.normalizedTerm.trim() && member.definition.trim() && member.example.trim() && member.slovakHint.trim()), `${member.entryId}: learner content is incomplete.`);
      memberIds.add(member.entryId);
      termCount += 1;
    }
  }
  for (const [level, state] of Object.entries(asset.levels)) {
    assert(state !== 'available' || previousOrderByLevel.has(level as CefrLevel), `${level}: an available level must contain concepts.`);
  }
  assert(asset.counts.concepts === asset.concepts.length, 'Spanish concept count does not match the manifest.');
  assert(asset.counts.terms === termCount, 'Spanish term count does not match the manifest.');
  assert(asset.counts.ownerReviewedConcepts === reviewedCount, 'Spanish owner-review count does not match the concepts.');
  assert(asset.counts.ownerVerdictRequiredConcepts === requiredCount, 'Spanish required-verdict count does not match the concepts.');
  assert(asset.counts.ownerResolvedRequiredConcepts === resolvedRequiredCount, 'Spanish resolved-verdict count does not match the concepts.');
  assert(asset.counts.ownerPendingConcepts === requiredCount - resolvedRequiredCount, 'Spanish pending-review count does not match required flagged concepts.');
  assert(asset.status !== 'production' || asset.counts.ownerPendingConcepts === 0, 'A production Spanish course requires a verdict for every flagged Slovak concept.');
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
    sourceVersion: `elelex-${concept.level.toLowerCase()}-v1`,
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
      return concept && asset.levels[concept.level] === 'available' ? presentation(concept, concept.members[0]) : null;
    },
    entriesForNormalizedTerm(normalizedTerm: string) {
      return (matchesByNormalizedTerm.get(normalizedTerm) ?? [])
        .filter(({ concept }) => asset.levels[concept.level] === 'available')
        .map(({ concept, member }) => presentation(concept, member));
    },
  };
}
