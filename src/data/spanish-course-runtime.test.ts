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
    ...(status === 'production' ? {} : { distributionBlocker: 'ShareAlike unresolved.' }),
    courseId: 'es-sk',
    sourceLanguageCode: 'es',
    targetLanguageCode: 'sk',
    title: 'Spanish A1',
    reviewDisclosure: SPANISH_DEFINITION_REVIEW_DISCLOSURE,
    pronunciationEnabled: false,
    counts: { concepts: 2, terms: 3, ownerReviewedConcepts: 2, ownerPendingConcepts: 0 },
    levels: {
      A1: status === 'production' ? 'available' : 'blocked-pending-license-and-owner-review',
      A2: 'not-generated', B1: 'not-generated', B2: 'not-generated', C1: 'not-generated',
      C2: 'unavailable-no-elelex-source-level',
    },
    concepts: [
      {
        id: 'es-sk:a1:i1', notHumanReview: true, level: 'A1', partOfSpeech: 'noun', courseOrder: 1,
        sharedSlovakHint: 'auto', review: { spanish: 'automated', slovakOwnerVerdict: 'acceptedSharedHint' },
        members: [
          { entryId: 'carro', term: 'carro', normalizedTerm: 'carro', partOfSpeech: 'noun', definition: 'Vehículo para personas.', example: 'Voy en carro.', selectedSenseId: 'sense-carro', slovakHint: 'auto', hintSource: 'generated', courseOrder: 1 },
          { entryId: 'coche', term: 'coche', normalizedTerm: 'coche', partOfSpeech: 'noun', definition: 'Vehículo de motor.', example: 'Voy en coche.', selectedSenseId: 'sense-coche', slovakHint: 'auto', hintSource: 'generated', courseOrder: 2 },
        ],
      },
      {
        id: 'es-sk:a1:i2', notHumanReview: true, level: 'A1', partOfSpeech: 'noun', courseOrder: 2,
        sharedSlovakHint: 'vták', review: { spanish: 'automated', slovakOwnerVerdict: 'acceptedSharedHint' },
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
  expect(runtime.levelState('A1')).toBe('blocked-pending-license-and-owner-review');
  expect(runtime.entries('A1')).toEqual([]);
  expect(runtime.entriesForNormalizedTerm('coche')).toEqual([]);
});

test('rejects production assets that retain a distribution blocker', () => {
  const asset = { ...fixture(), distributionBlocker: 'ShareAlike unresolved.' };
  expect(() => validateSpanishCourseAsset(asset)).toThrow('cannot retain a distribution blocker');
});

test('rejects production assets before every Slovak concept has an owner verdict', () => {
  const asset = fixture();
  asset.concepts[1].review.slovakOwnerVerdict = null;
  asset.counts.ownerReviewedConcepts = 1;
  asset.counts.ownerPendingConcepts = 1;
  expect(() => validateSpanishCourseAsset(asset)).toThrow('requires an owner verdict for every Slovak concept');
});

test('rejects unapproved disclosure copy and enabled pronunciation', () => {
  expect(() => validateSpanishCourseAsset({ ...fixture(), reviewDisclosure: 'Automatically reviewed.' }))
    .toThrow('must use the approved wording');
  expect(() => validateSpanishCourseAsset({ ...fixture(), pronunciationEnabled: true }))
    .toThrow('must remain disabled');
});
