import type { CefrCatalogEntry, Word } from '@/domain/types';

import { calculateCefrProgress } from './cefr-progress';

const entry = (
  catalogSenseId: string,
  normalizedTerm: string,
): Pick<CefrCatalogEntry, 'catalogSenseId' | 'normalizedTerm'> => ({
  catalogSenseId,
  normalizedTerm,
});

const word = (
  state: Word['state'],
  catalogSenseId: string | null,
  normalizedTerm: string,
): Pick<Word, 'catalogSenseId' | 'normalizedTerm' | 'state'> => ({
  catalogSenseId,
  normalizedTerm,
  state,
});

describe('CEFR progress', () => {
  it('separates known, learning, added, and untouched catalog words', () => {
    const entries = [
      entry('known-sense', 'known'),
      entry('understood-sense', 'understood'),
      entry('difficult-sense', 'difficult'),
      entry('new-sense', 'new'),
      entry('untouched-sense', 'untouched'),
    ];

    expect(calculateCefrProgress(entries, [
      word('learned', 'known-sense', 'known'),
      word('understood', 'understood-sense', 'understood'),
      word('cannot_remember', 'difficult-sense', 'difficult'),
      word('new', 'new-sense', 'new'),
    ])).toEqual({
      total: 5,
      known: 1,
      learning: 2,
      addedNotStarted: 1,
      notAdded: 1,
    });
  });

  it('falls back to normalized term for a manually added catalog word', () => {
    expect(calculateCefrProgress(
      [entry('catalog-sense', 'scope')],
      [word('learned', null, 'scope')],
    )).toEqual({
      total: 1,
      known: 1,
      learning: 0,
      addedNotStarted: 0,
      notAdded: 0,
    });
  });

  it('does not reuse a different catalog sense through the term fallback', () => {
    expect(calculateCefrProgress(
      [entry('wanted-sense', 'shared term')],
      [word('learned', 'different-sense', 'shared term')],
    )).toEqual({
      total: 1,
      known: 0,
      learning: 0,
      addedNotStarted: 0,
      notAdded: 1,
    });
  });

  it('does not count personal words that are outside the level catalog', () => {
    expect(calculateCefrProgress(
      [entry('catalog-sense', 'scope')],
      [word('learned', null, 'personal phrase')],
    )).toEqual({
      total: 1,
      known: 0,
      learning: 0,
      addedNotStarted: 0,
      notAdded: 1,
    });
  });
});
