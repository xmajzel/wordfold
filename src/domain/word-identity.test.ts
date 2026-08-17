import type { Word } from './types';
import { potentialWordDuplicates } from './word-identity';

const baseWord = {
  id: 'english-gift', collectionId: 'my-words', term: 'Gift', normalizedTerm: 'gift',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk',
  sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK',
  partOfSpeech: 'noun', definition: 'A present.', example: null, translation: 'dar',
  catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'new',
  understoodStreak: 0, lapseCount: 0, viewCount: 0, lastViewedAt: null,
  lastRatedAt: null, nextReviewAt: null, createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
} satisfies Word;

describe('potentialWordDuplicates', () => {
  it('warns only for the same source language and normalized term', () => {
    expect(potentialWordDuplicates([baseWord], 'en', 'gift')).toEqual([baseWord]);
    expect(potentialWordDuplicates([baseWord], 'de', 'gift')).toEqual([]);
  });

  it('can exclude the word currently being edited', () => {
    expect(potentialWordDuplicates([baseWord], 'en', 'gift', baseWord.id)).toEqual([]);
  });
});
