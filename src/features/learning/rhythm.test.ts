import { applyRating } from './algorithm';
import { parseLearningRhythm, serializeLearningRhythm } from './rhythm';
import type { LearningConfirmationCount, Word } from '@/domain/types';

const start = new Date('2026-09-17T12:00:00Z');
const fresh = { understoodStreak: 7, lapseCount: 2, knownStreak: 0, state: 'new' as const, nextReviewAt: null };

it.each([1, 2, 3] as LearningConfirmationCount[])('stops only on confirmation %s across separate due reviews', (threshold) => {
  let word: Pick<Word, 'understoodStreak' | 'lapseCount'> & Partial<Word> = fresh;
  let now = start;
  for (let count = 1; count <= threshold; count++) {
    const result = applyRating(word, 'learned', now, () => 0, threshold);
    expect(result.knownStreak).toBe(count);
    expect(result.understoodStreak).toBe(7);
    expect(result.state).toBe(count === threshold ? 'learned' : 'understood');
    expect(result.nextReviewAt === null).toBe(count === threshold);
    word = result;
    if (result.nextReviewAt) {
      expect(() => applyRating(word, 'learned', now, () => 0, threshold)).toThrow('not due');
      now = new Date(result.nextReviewAt);
    }
  }
});

it('resets only the confirmation streak on Keep learning and uses its existing schedule', () => {
  const result = applyRating({ ...fresh, knownStreak: 2 }, 'understood', start, () => 0);
  expect(result).toMatchObject({ knownStreak: 0, understoodStreak: 8, state: 'understood' });
  expect(result.nextReviewAt).toBe('2026-09-22T12:00:00.000Z');
  expect(applyRating({ ...fresh, knownStreak: 2 }, 'again', start).knownStreak).toBe(0);
});

it('keeps confirmations through missed days and uses a changed threshold on the next due rating', () => {
  const first = applyRating(fresh, 'learned', start, () => 0, 3);
  const muchLater = new Date('2026-10-30T12:00:00Z');
  expect(applyRating(first, 'learned', muchLater, () => 0, 2)).toMatchObject({ state: 'learned', knownStreak: 2 });
  expect(applyRating(first, 'learned', muchLater, () => 0, 3)).toMatchObject({ state: 'understood', knownStreak: 2 });
});

it('does not rate already-learned words or count legacy scheduling history as confirmations', () => {
  expect(() => applyRating({ ...fresh, state: 'learned' }, 'learned', start)).toThrow('not due');
  expect(applyRating({ understoodStreak: 20, lapseCount: 0 }, 'learned', start)).toMatchObject({ state: 'understood', knownStreak: 1 });
});

it('defaults missing or invalid preferences to three and requires a valid saved introduction', () => {
  for (const value of [null, '{', '{}', '{"confirmations":4,"introVersion":1}']) {
    expect(parseLearningRhythm(value)).toEqual({ confirmations: 3, introduced: false });
  }
  for (const count of [1, 2, 3] as const) {
    expect(parseLearningRhythm(serializeLearningRhythm(count))).toEqual({ confirmations: count, introduced: true });
  }
  expect(() => serializeLearningRhythm(4 as LearningConfirmationCount)).toThrow('Choose');
});
