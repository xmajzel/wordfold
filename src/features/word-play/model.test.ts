import type { Word } from '@/domain/types';
import { buildWordPlaySession, emptyWordPlayStats, summarizeWordPlay, wordPlayEventValue, type WordPlayEventRow } from './model';

export const gameWord = (index: number, overrides: Partial<Word> = {}): Word => ({
  id: `word-${index}`, collectionId: 'my-words', term: `word ${index}`, normalizedTerm: `word ${index}`,
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK',
  definition: `Meaning ${index}`, translation: `preklad ${index}`, partOfSpeech: 'noun', example: null,
  catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'learned', understoodStreak: 2, knownStreak: 3,
  lapseCount: 1, viewCount: 4, lastViewedAt: null, lastRatedAt: null, nextReviewAt: null,
  createdAt: '2026-09-01', updatedAt: '2026-09-01', ...overrides,
});

describe('Word play selection', () => {
  const words = Array.from({ length: 12 }, (_, index) => gameWord(index));
  it('requires ten learned words in the active course', () => {
    expect(buildWordPlaySession(words.slice(0, 9), 'en-sk', {})).toEqual([]);
    expect(buildWordPlaySession(words, 'es-sk', {})).toEqual([]);
    expect(buildWordPlaySession(words.map((word) => ({ ...word, state: 'understood' })), 'en-sk', {})).toEqual([]);
  });
  it('makes two matching boards, excludes recently played words and preserves input', () => {
    const stats = { 'word-0': { ...emptyWordPlayStats, lastPlayedAt: '2026-09-18', lastMode: 'recall' as const } };
    const rounds = buildWordPlaySession(words, 'en-sk', stats, () => 0.5);
    expect(rounds.map((round) => round.mode)).toEqual(['matching', 'matching']);
    expect(rounds.flatMap((round) => round.words)).toHaveLength(10);
    expect(rounds.flatMap((round) => round.words).some((word) => word.id === 'word-0')).toBe(false);
    expect(new Set(rounds.flatMap((round) => round.words.map((word) => word.id))).size).toBe(10);
    expect(words[0].id).toBe('word-0');
  });
  it('follows matching with recall, without showing the answer first', () => {
    const stats = { 'word-0': { ...emptyWordPlayStats, lastPlayedAt: '2026-09-18', lastMode: 'matching' as const } };
    expect(buildWordPlaySession(words, 'en-sk', stats).map((round) => round.mode)).toEqual(Array(10).fill('recall'));
  });
  it('falls back to recall for missing, long, multi-answer and duplicate hints', () => {
    const ambiguous = words.slice(0, 10).map((word) => ({ ...word, translation: 'rovnaký' }));
    ambiguous[0].translation = '';
    ambiguous[1].translation = 'a'.repeat(80);
    ambiguous[2].translation = 'one; two';
    expect(buildWordPlaySession(ambiguous, 'en-sk', {}).every((round) => round.mode === 'recall')).toBe(true);
  });
  it('does not put homographs on the same board', () => {
    const homographs = words.slice(0, 10).map((word) => ({ ...word, term: 'bank' }));
    expect(buildWordPlaySession(homographs, 'en-sk', {}).every((round) => round.mode === 'recall')).toBe(true);
  });
});

it('counts each session once, retains difficulty after success, and distinguishes a return to learning', () => {
  const value = wordPlayEventValue({ sessionId: 'session', mode: 'matching' });
  const event = (type: string, overrides: Partial<WordPlayEventRow> = {}): WordPlayEventRow => ({
    word_id: 'word-1', type, value, occurred_at: '2026-09-18T10:00:00.000Z', ...overrides,
  });
  expect(summarizeWordPlay([
    event('game_seen'), event('game_seen'), event('game_missed'), event('game_missed'), event('game_answered'),
    event('game_relearned'), event('game_relearned'), event('game_seen', { value: 'bad json' }),
    event('game_seen', { value: 'null' }), event('game_seen', { word_id: null }),
  ])['word-1']).toEqual({ gamesPlayed: 1, needsPractice: 1, returnedToLearning: 1,
    lastPlayedAt: '2026-09-18T10:00:00.000Z', lastMode: 'matching' });
  expect(summarizeWordPlay([event('game_seen')])['word-1'].needsPractice).toBe(0);
});

it('keeps a matching session in the rotation when its last exercise falls back to recall', () => {
  const stats = summarizeWordPlay([{
    word_id: 'word-0', type: 'game_seen', occurred_at: '2026-09-18',
    value: wordPlayEventValue({ sessionId: 'mixed', mode: 'recall', sessionMode: 'matching' }),
  }]);
  const words = Array.from({ length: 10 }, (_, index) => gameWord(index));
  expect(buildWordPlaySession(words, 'en-sk', stats).every((round) => round.mode === 'recall')).toBe(true);
});

it('selects only the requested scope and uses recall for fewer than five words', () => {
  const words = Array.from({ length: 10 }, (_, index) => gameWord(index, { collectionId: index === 0 ? 'travel' : 'other', cefrLevel: index < 3 ? 'A1' : 'B1' }));
  const single = buildWordPlaySession(words, 'en-sk', {}, Math.random, 'collection:travel');
  expect(single).toEqual([{ mode: 'recall', words: [words[0]] }]);
  expect(buildWordPlaySession(words, 'en-sk', {}, Math.random, 'A1').flatMap((round) => round.words).map((word) => word.id).sort()).toEqual(['word-0', 'word-1', 'word-2']);
  expect(buildWordPlaySession(words, 'en-sk', {}, Math.random, 'C2')).toEqual([]);
  expect(buildWordPlaySession(words, 'en-sk', {}, Math.random, 'collection:deleted')).toEqual([]);
});

it('allows short sessions after previously playing, even after words return to learning', () => {
  const words = [gameWord(0), gameWord(1, { state: 'understood' })];
  const stats = { 'word-1': { ...emptyWordPlayStats, gamesPlayed: 1 } };
  expect(buildWordPlaySession(words, 'en-sk', stats).flatMap((round) => round.words)).toEqual([words[0]]);
  expect(buildWordPlaySession(words, 'es-sk', stats)).toEqual([]);
});
