import WordfoldTranslate from '../../../modules/wordfold-translate';

export type OnDeviceTranslationSourceLanguage = 'en' | 'es';
export type OnDeviceTranslationTargetLanguage = 'sk';

export interface OnDeviceTranslationPair {
  sourceLanguageCode: string;
  targetLanguageCode: string;
}

export interface OnDeviceTranslationOptions {
  signal?: AbortSignal;
}

const supportedPairs = new Set(['en:sk', 'es:sk']);

export class TranslationCancelledError extends Error {
  constructor() {
    super('Translation was cancelled.');
    this.name = 'TranslationCancelledError';
  }
}

export function isOnDeviceTranslationPairSupported(
  sourceLanguageCode: string,
  targetLanguageCode: string,
): boolean {
  return supportedPairs.has(`${sourceLanguageCode}:${targetLanguageCode}`);
}

function pairLabel(sourceLanguageCode: string, targetLanguageCode: string) {
  return `${sourceLanguageCode} → ${targetLanguageCode}`;
}

function describeTranslationError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : null;
  if (code === 'E_MODEL_DOWNLOAD') {
    return new Error('The translation model could not be downloaded. Connect to Wi-Fi and try again.');
  }
  if (code === 'E_LANGUAGE') {
    return new Error('This on-device language pair is not supported.');
  }
  if (code === 'E_TRANSLATION') {
    return new Error('On-device translation failed. If this is the first use, connect to Wi-Fi so the language model can finish downloading.');
  }
  if (error instanceof Error) return error;
  return new Error('On-device translation failed. Please try again.');
}

function rejectWhenAborted(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new TranslationCancelledError()), { once: true });
  });
}

export async function translateOnDevice(
  text: string,
  pair: OnDeviceTranslationPair,
  options: OnDeviceTranslationOptions = {},
) {
  const normalizedText = text.trim();
  if (!normalizedText) throw new Error('Enter a word or phrase to translate.');
  if (!isOnDeviceTranslationPairSupported(pair.sourceLanguageCode, pair.targetLanguageCode)) {
    throw new Error(`On-device translation does not support ${pairLabel(pair.sourceLanguageCode, pair.targetLanguageCode)}.`);
  }
  if (options.signal?.aborted) throw new TranslationCancelledError();
  if (!WordfoldTranslate?.translate) {
    throw new Error('On-device translation needs a Wordfold development build.');
  }

  try {
    const translation = WordfoldTranslate.translate(
      normalizedText,
      pair.sourceLanguageCode,
      pair.targetLanguageCode,
    );
    const result = options.signal
      ? await Promise.race([translation, rejectWhenAborted(options.signal)])
      : await translation;
    if (options.signal?.aborted) throw new TranslationCancelledError();
    if (!result.trim()) throw new Error('Translation returned no text.');
    return result.trim();
  } catch (error) {
    if (error instanceof TranslationCancelledError) throw error;
    throw describeTranslationError(error);
  }
}

export function translateEnglishToSlovak(text: string, options?: OnDeviceTranslationOptions) {
  return translateOnDevice(text, {
    sourceLanguageCode: 'en',
    targetLanguageCode: 'sk',
  }, options);
}

export function translateSpanishToSlovak(text: string, options?: OnDeviceTranslationOptions) {
  return translateOnDevice(text, {
    sourceLanguageCode: 'es',
    targetLanguageCode: 'sk',
  }, options);
}
