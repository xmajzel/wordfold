import type { Word } from './types';

export function potentialWordDuplicates(
  words: Word[],
  sourceLanguageCode: string,
  normalizedTerm: string,
  excludedWordId?: string,
) {
  return words.filter((word) => (
    word.id !== excludedWordId
    && word.sourceLanguageCode === sourceLanguageCode
    && word.normalizedTerm === normalizedTerm
  ));
}
