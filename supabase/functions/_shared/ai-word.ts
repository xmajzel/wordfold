export const AI_LANGUAGES: Record<string, string> = { en: 'English', es: 'Spanish', de: 'German', el: 'Greek', sk: 'Slovak' };
export type WordSuggestion = { definition: string; translation: string; example: string; partOfSpeech: string };
export type SuggestionInput = { term: string; context: string; sourceLanguageCode: string; targetLanguageCode: string };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parseSuggestionInput(value: unknown): SuggestionInput | null {
  if (!object(value)) return null;
  const { term, context, sourceLanguageCode, targetLanguageCode } = value;
  if (typeof term !== 'string' || !term.trim() || term.trim().length > 100
    || typeof context !== 'string' || context.length > 1000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(term + context)
    || typeof sourceLanguageCode !== 'string' || !Object.hasOwn(AI_LANGUAGES, sourceLanguageCode)
    || typeof targetLanguageCode !== 'string' || !Object.hasOwn(AI_LANGUAGES, targetLanguageCode)) return null;
  return { term: term.trim(), context: context.trim(), sourceLanguageCode, targetLanguageCode };
}
export function isWordSuggestion(value: unknown): value is WordSuggestion {
  if (!object(value)) return false;
  return Object.entries({ definition: 500, translation: 200, example: 500, partOfSpeech: 60 })
    .every(([key, maximum]) => typeof value[key] === 'string' && Boolean(value[key].trim()) && value[key].length <= maximum);
}
