import type { CourseId } from './courses';
import type { PronunciationVoicePreference } from './types';

export const neuralVoices = {
  'en-US': { voiceId: 'en-US-AvaNeural', label: 'Ava · US English', courseId: 'en-sk' },
  'en-GB': { voiceId: 'en-GB-RyanNeural', label: 'Ryan · UK English', courseId: 'en-sk' },
  'es-ES': { voiceId: 'es-ES-ElviraNeural', label: 'Elvira · Spain Spanish', courseId: 'es-sk' },
  'es-MX': { voiceId: 'es-MX-JorgeNeural', label: 'Jorge · Mexico Spanish', courseId: 'es-sk' },
} as const;

export type NeuralLocale = keyof typeof neuralVoices;
export function isNeuralLocale(value: unknown): value is NeuralLocale {
  return typeof value === 'string' && Object.hasOwn(neuralVoices, value);
}
export function preferenceLocale(value: unknown): NeuralLocale | null {
  if (typeof value !== 'string' || !value.startsWith('neural-')) return null;
  const locale = value.slice('neural-'.length);
  return isNeuralLocale(locale) ? locale : null;
}
export function voiceSupportsCourse(value: PronunciationVoicePreference, courseId: CourseId) {
  const locale = preferenceLocale(value);
  return value === 'device' || (locale !== null && neuralVoices[locale].courseId === courseId);
}
