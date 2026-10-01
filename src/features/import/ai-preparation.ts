import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AiError, generateSuggestion, type SuggestionInput } from '@/features/ai/client';
import { loadSavedSuggestion, suggestionStorageKey } from '@/features/ai/saved-suggestion';
import type { ReviewDraft } from './review-queue';

export function reviewSuggestionInput(row: ReviewDraft, sourceLanguageCode: string, targetLanguageCode: string): SuggestionInput {
  return { term: row.term.trim(), sourceLanguageCode, targetLanguageCode,
    context: [row.definition && `Definition: ${row.definition}`, row.translation && `Translation: ${row.translation}`,
      row.example && `Example: ${row.example}`].filter(Boolean).join('\n').slice(0, 1000) };
}

// Use the same saved drafts as single-word review, so preparation never applies a suggestion.
export async function prepareReviewSuggestions({ userId, inputs, signal, onPrepared }: {
  userId: string; inputs: SuggestionInput[]; signal: AbortSignal; onPrepared(): void;
}) {
  for (const input of inputs) {
    if (signal.aborted) return;
    const key = suggestionStorageKey(userId, input);
    const saved = await loadSavedSuggestion(key, input);
    if (signal.aborted) return;
    if (saved?.suggestion) { onPrepared(); continue; }
    const request = saved ?? { requestId: Crypto.randomUUID(), input };
    // Save the recovery ID before any credit can be reserved.
    await AsyncStorage.setItem(key, JSON.stringify(request));
    if (signal.aborted) return;
    try {
      const result = await generateSuggestion(request.requestId, request.input);
      if (result.status === 'completed') {
        // Retain the result even when the screen closes during this request.
        await AsyncStorage.setItem(key, JSON.stringify({ ...request, suggestion: result.suggestion }));
        if (!signal.aborted) onPrepared();
      } else if (result.status === 'failed') {
        await AsyncStorage.removeItem(key);
        throw new Error(`No suggestion was generated for “${input.term}”. Your credit was returned. Retry or continue reviewing.`);
      } else {
        throw new Error(`The suggestion for “${input.term}” is still being prepared. Retry shortly at no extra credit, or continue reviewing.`);
      }
    } catch (error) {
      if (error instanceof AiError && ['no_credits', 'limited', 'invalid_input', 'request_conflict'].includes(error.code)) {
        await AsyncStorage.removeItem(key);
      }
      throw error;
    }
  }
}
