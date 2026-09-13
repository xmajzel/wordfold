import type { Word } from '@/domain/types';
import type { FeedbackWord } from '../../../supabase/functions/_shared/feedback';

export type FeedbackOrigin = { screen: string; word: FeedbackWord | null };
let current: { key: string; origin: FeedbackOrigin } | undefined;
let sequence = 0;

// Keep personal word text out of navigation URLs and browser history.
export function rememberFeedbackOrigin(screen: string, word?: Word) {
  const key = String(++sequence);
  current = { key, origin: { screen, word: word ? {
    id: word.id, term: word.term, definition: word.definition, translation: word.translation,
    example: word.example, catalogSenseId: word.catalogSenseId, source: word.source,
    sourceLanguageCode: word.sourceLanguageCode, targetLanguageCode: word.targetLanguageCode,
  } : null } };
  return key;
}

export function getFeedbackOrigin(key?: string): FeedbackOrigin {
  return current && current.key === key ? current.origin : { screen: 'feedback', word: null };
}
