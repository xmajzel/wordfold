import type { Word } from '@/domain/types';
import {
  buildTodayWordWidgetTimeline,
  getStoredTodayWordWidgetProps,
  getTodayWordWidgetProps,
  storeTodayWordWidgetTimeline,
} from './today-word';

function word(index: number, overrides: Partial<Word> = {}): Word {
  return {
    id: `word-${index}`, collectionId: 'my-words', term: `word ${index}`, normalizedTerm: `word ${index}`,
    sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK', partOfSpeech: 'noun',
    definition: `Definition ${index}`, example: null, translation: null, catalogSenseId: null, cefrLevel: null,
    source: 'manual', state: 'new', understoodStreak: 0, lapseCount: 0, viewCount: 0,
    lastViewedAt: null, lastRatedAt: null, nextReviewAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('today word widget data', () => {
  const now = new Date('2026-06-12T09:30:00.000Z');

  it('uses the first reminder candidate and creates its word deep link', () => {
    const words = [word(1), word(2)];
    const expected = getTodayWordWidgetProps(words, now);

    expect(expected.status).toBe('word');
    expect(expected.deepLink).toBe(`wordfold://word/${expected.wordId}`);
    expect(words.map((item) => item.id)).toContain(expected.wordId);
  });

  it('advances after the displayed new word is rated', () => {
    const words = [word(1), word(2)];
    const first = getTodayWordWidgetProps(words, now);
    const ratedWords = words.map((item) => item.id === first.wordId ? word(Number(item.id.slice(5)), {
      state: 'understood',
      viewCount: 1,
      lastRatedAt: now.toISOString(),
      nextReviewAt: '2026-06-15T09:30:00.000Z',
    }) : item);

    expect(getTodayWordWidgetProps(ratedWords, now).wordId).not.toBe(first.wordId);
  });

  it('returns the completion state when every word is learned', () => {
    expect(getTodayWordWidgetProps([word(1, { state: 'learned' })], now)).toEqual({
      status: 'empty',
      wordId: '',
      term: 'All words learned',
      definition: 'Add or reset a word in Wordfold.',
      deepLink: 'wordfold://',
    });
  });

  it('builds current and local-midnight entries and selects the active stored entry', () => {
    const timeline = buildTodayWordWidgetTimeline([word(1)], now, 2);
    const stored = storeTodayWordWidgetTimeline(timeline);

    expect(timeline).toHaveLength(3);
    expect(timeline[0].date).toEqual(now);
    expect(timeline.slice(1).every((entry) => (
      entry.date.getHours() === 0
      && entry.date.getMinutes() === 0
      && entry.date.getSeconds() === 0
      && entry.date.getMilliseconds() === 0
    ))).toBe(true);
    expect(getStoredTodayWordWidgetProps(stored, stored[1].timestamp)).toEqual(stored[1].props);
  });
});
