import { getCefrEntries } from './cefr-catalog';

jest.mock('../../assets/catalog/cefr-catalog.json', () => ({
  schemaVersion: 1,
  title: 'Test catalog',
  levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  counts: { A1: 5, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
  entries: [
    {
      id: 'valid', term: 'Valid', normalizedTerm: 'valid', level: 'A1', catalogSenseId: 'valid-sense',
      partOfSpeech: 'adjective', definition: 'Base.', example: 'Base example.', translation: 'pôvodný', source: 'test',
    },
    {
      id: 'review', term: 'Review', normalizedTerm: 'review', level: 'A1', catalogSenseId: 'review-sense',
      partOfSpeech: 'noun', definition: 'Base.', example: 'Base example.', translation: 'kontrola', source: 'test',
    },
    {
      id: 'low', term: 'Low', normalizedTerm: 'low', level: 'A1', catalogSenseId: 'low-sense',
      partOfSpeech: 'adjective', definition: 'Base.', example: 'Base example.', translation: 'nízky', source: 'test',
    },
    {
      id: 'mismatch', term: 'Mismatch', normalizedTerm: 'mismatch', level: 'A1', catalogSenseId: 'mismatch-sense',
      partOfSpeech: 'noun', definition: 'Base.', example: 'Base example.', translation: 'nezhoda', source: 'test',
    },
    {
      id: 'empty', term: 'Empty', normalizedTerm: 'empty', level: 'A1', catalogSenseId: 'empty-sense',
      partOfSpeech: 'adjective', definition: 'Base.', example: 'Base example.', translation: 'prázdny', source: 'test',
    },
  ],
}));

jest.mock('../../assets/catalog/cefr-learner-definitions.json', () => ({ schemaVersion: 1, entries: {} }));

jest.mock('../../assets/catalog/cefr-learner-translations-sk.json', () => ({
  schemaVersion: 1,
  entries: {
    valid: {
      entryId: 'valid', normalizedTerm: 'valid', translation: 'platný', confidence: 'high', needsReview: false, reviewNote: '',
    },
    review: {
      entryId: 'review', normalizedTerm: 'review', translation: 'recenzia', confidence: 'medium', needsReview: true, reviewNote: 'Ambiguous.',
    },
    low: {
      entryId: 'low', normalizedTerm: 'low', translation: 'nízko', confidence: 'low', needsReview: true, reviewNote: 'Ambiguous.',
    },
    mismatch: {
      entryId: 'wrong-id', normalizedTerm: 'mismatch', translation: 'nesúlad', confidence: 'high', needsReview: false, reviewNote: '',
    },
    empty: {
      entryId: 'empty', normalizedTerm: 'empty', translation: '', confidence: 'high', needsReview: false, reviewNote: '',
    },
  },
}));

describe('CEFR learner Slovak translation overlay', () => {
  it('uses only reviewed translations with matching catalog identity', () => {
    const translations = Object.fromEntries(getCefrEntries('A1').map((entry) => [entry.id, entry.translation]));

    expect(translations).toEqual({
      valid: 'platný',
      review: 'kontrola',
      low: 'nízky',
      mismatch: 'nezhoda',
      empty: 'prázdny',
    });
  });
});
