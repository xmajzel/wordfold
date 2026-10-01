import AsyncStorage from '@react-native-async-storage/async-storage';
import { isWordSuggestion, parseSuggestionInput, UUID } from '../../../supabase/functions/_shared/ai-word';
import type { SuggestionInput, WordSuggestion } from './client';

export type SavedRequest = { requestId: string; input: SuggestionInput; suggestion?: WordSuggestion };

export function suggestionStorageKey(userId: string, input: Pick<SuggestionInput, 'term' | 'sourceLanguageCode' | 'targetLanguageCode'>) {
  return `ai-suggestion-v1:${JSON.stringify([userId, input.sourceLanguageCode, input.targetLanguageCode, input.term.trim()])}`;
}

export async function loadSavedSuggestion(key: string, input: Pick<SuggestionInput, 'term' | 'sourceLanguageCode' | 'targetLanguageCode'>): Promise<SavedRequest | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as SavedRequest;
  if (!value || !UUID.test(value.requestId) || !parseSuggestionInput(value.input)
    || value.input.term !== input.term.trim()
    || value.input.sourceLanguageCode !== input.sourceLanguageCode
    || value.input.targetLanguageCode !== input.targetLanguageCode) return null;
  return { requestId: value.requestId, input: value.input,
    ...(isWordSuggestion(value.suggestion) ? { suggestion: value.suggestion } : {}) };
}
