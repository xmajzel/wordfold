import { buildSentenceGap, normalizeSentenceAnswer } from './sentence';

it('blanks one standalone word, preserving sentence punctuation and case', () => {
  expect(buildSentenceGap({ term: 'quiet', example: 'Quiet rooms help me think.' })).toEqual({ before: '', answer: 'Quiet', after: ' rooms help me think.' });
  expect(buildSentenceGap({ term: 'café', example: 'Voy al café.' })?.answer).toBe('café');
  expect(buildSentenceGap({ term: 'ice cream', example: 'I like ice  cream.' })?.answer).toBe('ice  cream');
  expect(buildSentenceGap({ term: 'c++', example: 'I use C++ today.' })?.answer).toBe('C++');
});

it.each([
  ['cat', 'The cathedral is old.'], ['run', 'She runs daily.'], ['cat', 'Cat meets cat.'],
  ['can', "I can't go."], ['well', 'A well-known story.'], ['a', 'á'], ['quiet', null], ['quiet', 'quiet'],
])('rejects unsafe or absent matches: %s / %s', (term, example) => {
  expect(buildSentenceGap({ term: term!, example })).toBeNull();
});

it('normalizes case and whitespace while preserving meaningful accents', () => {
  expect(normalizeSentenceAnswer('  ICE   Cream ')).toBe('ice cream');
  expect(normalizeSentenceAnswer('CAFE\u0301')).toBe('café');
  expect(normalizeSentenceAnswer('año')).not.toBe(normalizeSentenceAnswer('ano'));
});
