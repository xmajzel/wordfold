import {
  assertWordCapacity,
  FREE_WORD_LIMIT,
  getWordCapacity,
  WordCapacityExceededError,
} from './capacity';

describe('word capacity', () => {
  it('allows the hundredth free word', () => {
    expect(() => assertWordCapacity(99, 1, false)).not.toThrow();
  });

  it('blocks additions beyond the free allowance without partially accepting a batch', () => {
    expect(() => assertWordCapacity(95, 10, false)).toThrow(WordCapacityExceededError);
    try {
      assertWordCapacity(95, 10, false);
    } catch (error) {
      expect(error).toMatchObject({ currentCount: 95, requestedCount: 10, remaining: 5 });
    }
  });

  it('does not limit an unlocked library', () => {
    expect(() => assertWordCapacity(FREE_WORD_LIMIT, 1000, true)).not.toThrow();
    expect(getWordCapacity(145, true)).toMatchObject({ remaining: null, unlimited: true });
  });
});
