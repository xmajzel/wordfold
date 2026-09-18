import type { LearningConfirmationCount } from '@/domain/types';

export const DEFAULT_CONFIRMATIONS: LearningConfirmationCount = 3;
export const RHYTHM_INTRO_VERSION = 1;
export const RHYTHM_STORAGE_KEY = 'learning_rhythm';

export function isConfirmationCount(value: unknown): value is LearningConfirmationCount {
  return value === 1 || value === 2 || value === 3;
}

export function parseLearningRhythm(raw?: string | null) {
  try {
    const value = JSON.parse(raw ?? 'null');
    return {
      confirmations: isConfirmationCount(value?.confirmations) ? value.confirmations : DEFAULT_CONFIRMATIONS,
      introduced: isConfirmationCount(value?.confirmations) && value?.introVersion === RHYTHM_INTRO_VERSION,
    };
  } catch {
    return { confirmations: DEFAULT_CONFIRMATIONS, introduced: false };
  }
}

export function serializeLearningRhythm(confirmations: LearningConfirmationCount) {
  if (!isConfirmationCount(confirmations)) throw new Error('Choose 1, 2, or 3 confirmations.');
  return JSON.stringify({ confirmations, introVersion: RHYTHM_INTRO_VERSION });
}
