import {
  createSpanishCourseRuntime,
  SPANISH_DEFINITION_REVIEW_DISCLOSURE,
  type SpanishCourseAsset,
  validateSpanishCourseAsset,
} from './spanish-course-runtime';

function fixture(status: SpanishCourseAsset['status'] = 'production'): SpanishCourseAsset {
  return {
    schemaVersion: 1,
    notHumanReview: true,
    status,
    ...(status === 'production' ? {} : { distributionBlocker: 'A1 Slovak owner review incomplete.' }),
    courseId: 'es-sk',
    sourceLanguageCode: 'es',
    targetLanguageCode: 'sk',
    title: 'Spanish A1',
    reviewDisclosure: SPANISH_DEFINITION_REVIEW_DISCLOSURE,
    pronunciationEnabled: false,
    counts: {
      concepts: 2,
      terms: 3,
      ownerReviewedConcepts: 2,
      ownerVerdictRequiredConcepts: 2,
      ownerResolvedRequiredConcepts: 2,
      ownerPendingConcepts: 0,
    },
    levels: {
      A1: status === 'production' ? 'available' : 'blocked-pending-owner-review',
      A2: 'not-generated', B1: 'not-generated', B2: 'not-generated', C1: 'not-generated',
      C2: 'unavailable-no-elelex-source-level',
    },
    concepts: [
      {
        id: 'es-sk:a1:i1', notHumanReview: true, level: 'A1', partOfSpeech: 'noun', courseOrder: 1,
        sharedSlovakHint: 'auto', review: {
          spanish: 'automated', slovakOwnerVerdict: 'accepted-proposed-correction',
          slovakOwnerVerdictProvenance: 'ai-assisted-owner-accepted', slovakOwnerVerdictRequired: true,
        },
        members: [
          { entryId: 'carro', term: 'carro', normalizedTerm: 'carro', partOfSpeech: 'noun', definition: 'Vehículo para personas.', example: 'Voy en carro.', selectedSenseId: 'sense-carro', slovakHint: 'auto', hintSource: 'generated', courseOrder: 1 },
          { entryId: 'coche', term: 'coche', normalizedTerm: 'coche', partOfSpeech: 'noun', definition: 'Vehículo de motor.', example: 'Voy en coche.', selectedSenseId: 'sense-coche', slovakHint: 'auto', hintSource: 'generated', courseOrder: 2 },
        ],
      },
      {
        id: 'es-sk:a1:i2', notHumanReview: true, level: 'A1', partOfSpeech: 'noun', courseOrder: 2,
        sharedSlovakHint: 'vták', review: {
          spanish: 'automated', slovakOwnerVerdict: 'accepted-proposed-correction',
          slovakOwnerVerdictProvenance: 'ai-assisted-owner-accepted', slovakOwnerVerdictRequired: true,
        },
        members: [
          { entryId: 'ave', term: 'ave', normalizedTerm: 'ave', partOfSpeech: 'noun', definition: 'Animal con plumas.', example: 'Veo un ave.', selectedSenseId: 'sense-ave', slovakHint: 'vták', hintSource: 'generated', courseOrder: 3 },
        ],
      },
    ],
  };
}

test('uses one catalog identity for shared members while preserving searched presentation', () => {
  const runtime = createSpanishCourseRuntime(fixture());
  expect(runtime.entries('A1')).toHaveLength(2);
  expect(runtime.entriesForNormalizedTerm('coche')).toEqual([
    expect.objectContaining({ term: 'coche', catalogSenseId: 'es-sk:a1:i1', alternativeTerms: ['carro'], translation: 'auto' }),
  ]);
  expect(runtime.entriesForNormalizedTerm('carro')[0].catalogSenseId).toBe(runtime.entriesForNormalizedTerm('coche')[0].catalogSenseId);
});

test('keeps all entries inaccessible while a staged asset is distribution-blocked', () => {
  const runtime = createSpanishCourseRuntime(fixture('non-distributable-staging'));
  expect(runtime.levelState('A1')).toBe('blocked-pending-owner-review');
  expect(runtime.entries('A1')).toEqual([]);
  expect(runtime.entriesForNormalizedTerm('coche')).toEqual([]);
  expect(runtime.entry('es-sk:a1:i1')).toBeNull();
});

test('supports later levels with their own order, lookup and source metadata', () => {
  const asset = fixture();
  asset.concepts[1].level = 'B2';
  asset.concepts[1].courseOrder = 1;
  asset.levels.B2 = 'available';
  const runtime = createSpanishCourseRuntime(asset);
  expect(runtime.entries('A1')).toHaveLength(1);
  expect(runtime.entries('B2')).toHaveLength(1);
  expect(runtime.entriesForNormalizedTerm('ave')[0]).toMatchObject({ level: 'B2', sourceVersion: 'elelex-b2-v1' });
  expect(runtime.entry('es-sk:a1:i2')).toMatchObject({ level: 'B2', term: 'ave' });
});

test('rejects empty available levels and concepts with pending verdicts', () => {
  const asset = fixture();
  asset.levels.A2 = 'available';
  expect(() => validateSpanishCourseAsset(asset)).toThrow('an available level must contain concepts');
  asset.levels.A2 = 'not-generated';
  asset.excludedConcepts = [{ id: asset.concepts[0].id, level: 'A2', reason: 'pending-owner-verdict' }];
  expect(() => validateSpanishCourseAsset(asset)).toThrow('a pending review finding cannot be bundled');
});

test('rejects production assets that retain a distribution blocker', () => {
  const asset = { ...fixture(), distributionBlocker: 'A1 Slovak owner review incomplete.' };
  expect(() => validateSpanishCourseAsset(asset)).toThrow('cannot retain a distribution blocker');
});

test('rejects production assets before every flagged Slovak concept has an owner verdict', () => {
  const asset = fixture();
  asset.concepts[1].review.slovakOwnerVerdict = null;
  asset.counts.ownerReviewedConcepts = 1;
  asset.counts.ownerResolvedRequiredConcepts = 1;
  asset.counts.ownerPendingConcepts = 1;
  expect(() => validateSpanishCourseAsset(asset)).toThrow('requires a verdict for every flagged Slovak concept');
});

test('rejects a required verdict that loses AI-assisted provenance', () => {
  const asset = fixture();
  asset.concepts[0].review.slovakOwnerVerdictProvenance = 'historical-owner-accepted';
  expect(() => validateSpanishCourseAsset(asset)).toThrow('must retain AI-assisted provenance');
});

test('rejects unapproved disclosure copy and accepts the approved pronunciation capability', () => {
  expect(() => validateSpanishCourseAsset({ ...fixture(), reviewDisclosure: 'Automatically reviewed.' }))
    .toThrow('must use the approved wording');
  expect(() => validateSpanishCourseAsset({ ...fixture(), pronunciationEnabled: true }))
    .not.toThrow();
});

test('requires a reviewed C2 release and retains its distinct source and learner metadata', () => {
  const asset = fixture();
  const concept = asset.concepts[1];
  concept.level = 'C2';
  concept.courseOrder = 1;
  asset.levels.C2 = 'available';
  expect(() => validateSpanishCourseAsset(asset)).toThrow('release manifest');
  asset.c2Release = {
    schemaVersion: 1, entryCount: 1, notHumanApproval: true, placementStatus: 'provisional', curriculumCoverage: 'partial',
    entriesSha256: 'a'.repeat(64), spanishReviewSha256: 'b'.repeat(64), slovakReviewSha256: 'c'.repeat(64),
  };
  expect(() => validateSpanishCourseAsset(asset)).toThrow('both language reviews');
  concept.review.spanish = 'independent-ai-review';
  concept.review.slovak = 'independent-ai-review';
  expect(() => validateSpanishCourseAsset(asset)).toThrow('own source');
  concept.sourceVersion = 'wordfold-spanish-c2-test';
  concept.levelEvidence = 'Provisional PCIC-referenced placement';
  concept.members[0].gender = 'feminine';
  concept.members[0].alternativeForms = [];
  const runtime = createSpanishCourseRuntime(asset);
  expect(runtime.entries('C2')).toHaveLength(1);
  expect(runtime.entry(concept.id)).toMatchObject({
    level: 'C2', sourceVersion: 'wordfold-spanish-c2-test', gender: 'feminine', alternativeForms: [],
    levelEvidence: 'Provisional PCIC-referenced placement', translation: 'vták',
  });
  asset.c2Release.entryCount = 2;
  expect(() => validateSpanishCourseAsset(asset)).toThrow('count is stale');
});
