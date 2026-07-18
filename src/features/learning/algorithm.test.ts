import type { Word } from '@/domain/types';

import { applyRating, buildLearningFeed, getAvailableLearningFilters, getNextReviewIntervalDays } from './algorithm';

const baseWord = (overrides: Partial<Word>): Word => ({
  id: 'word', collectionId: 'collection', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', partOfSpeech: 'noun',
  definition: 'The extent of something.', example: null, translation: null,
  catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'new', understoodStreak: 0,
  lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null,
  nextReviewAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
});

describe('learning algorithm', () => {
  const now = new Date('2026-06-21T12:00:00.000Z');

  it('schedules again for tomorrow and resets the streak', () => {
    expect(applyRating({ understoodStreak: 2, lapseCount: 1 }, 'again', now)).toEqual(
      expect.objectContaining({ state: 'cannot_remember', understoodStreak: 0, lapseCount: 2,
        nextReviewAt: '2026-06-22T12:00:00.000Z' }),
    );
  });

  it('uses the approved understood intervals', () => {
    const first = applyRating({ understoodStreak: 0, lapseCount: 0 }, 'understood', now);
    const fourth = applyRating({ understoodStreak: 3, lapseCount: 0 }, 'understood', now);
    expect(first.nextReviewAt).toBe('2026-06-24T12:00:00.000Z');
    expect(fourth.nextReviewAt).toBe('2026-07-21T12:00:00.000Z');
  });

  it('previews the same understood interval used by the scheduler', () => {
    expect(getNextReviewIntervalDays({ understoodStreak: 0 })).toBe(3);
    expect(getNextReviewIntervalDays({ understoodStreak: 1 })).toBe(7);
    expect(getNextReviewIntervalDays({ understoodStreak: 2 })).toBe(14);
    expect(getNextReviewIntervalDays({ understoodStreak: 3 })).toBe(30);
    expect(getNextReviewIntervalDays({ understoodStreak: 12 })).toBe(30);
  });

  it('interleaves two new words with a due review', () => {
    const words = [baseWord({ id: 'n1' }), baseWord({ id: 'n2' }), baseWord({ id: 'n3' }),
      baseWord({ id: 'r1', state: 'cannot_remember', nextReviewAt: '2026-06-20T00:00:00.000Z' })];
    expect(buildLearningFeed(words, now)[2].id).toBe('r1');
  });

  it('limits each daily feed to twelve new words', () => {
    const words = Array.from({ length: 20 }, (_, index) => baseWord({ id: `n${index}` }));

    expect(buildLearningFeed(words, now)).toHaveLength(12);
  });

  it('keeps every due review even when the new-word quota is full', () => {
    const words = [
      ...Array.from({ length: 20 }, (_, index) => baseWord({ id: `n${index}` })),
      ...Array.from({ length: 5 }, (_, index) => baseWord({
        id: `r${index}`,
        state: 'cannot_remember',
        nextReviewAt: '2026-06-20T00:00:00.000Z',
      })),
    ];

    const feed = buildLearningFeed(words, now);
    expect(feed.filter((word) => word.state === 'new')).toHaveLength(12);
    expect(feed.filter((word) => word.state === 'cannot_remember')).toHaveLength(5);
  });

  it('prioritizes viewed but unrated new words in the next session', () => {
    const unfinished = baseWord({
      id: 'unfinished',
      viewCount: 1,
      lastViewedAt: '2026-06-20T10:00:00.000Z',
    });
    const words = [
      ...Array.from({ length: 20 }, (_, index) => baseWord({ id: `n${index}` })),
      unfinished,
    ];

    expect(buildLearningFeed(words, now).map((word) => word.id)).toContain('unfinished');
  });

  it('filters the learning feed by CEFR level', () => {
    const words = [
      baseWord({ id: 'a1', cefrLevel: 'A1' }),
      baseWord({ id: 'b2', cefrLevel: 'B2' }),
      baseWord({ id: 'personal', cefrLevel: null }),
    ];

    expect(buildLearningFeed(words, now, 'A1').map((word) => word.id)).toEqual(['a1']);
    expect(buildLearningFeed(words, now, 'personal').map((word) => word.id)).toEqual(['personal']);
    expect(buildLearningFeed(words, now, 'all')).toHaveLength(3);
  });

  it('offers only learning filters that have words', () => {
    const words = [
      baseWord({ id: 'c1', cefrLevel: 'C1' }),
      baseWord({ id: 'personal', cefrLevel: null }),
    ];

    expect(getAvailableLearningFilters(words)).toEqual(['all', 'personal', 'C1']);
    expect(getAvailableLearningFilters([words[0]])).toEqual(['all', 'C1']);
    expect(getAvailableLearningFilters([])).toEqual(['all']);
  });
});
