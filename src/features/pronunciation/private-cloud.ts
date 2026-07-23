import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

export const PRIVATE_NEURAL_SYNTHESIS_VERSION = 'azure-private-preview-v1';
export const PRIVATE_NEURAL_CONTENT_TYPE = 'audio/mpeg';
export const PRIVATE_NEURAL_MAXIMUM_BYTES = 1_048_576;
export const PRIVATE_NEURAL_SIGNED_URL_SECONDS = 60;

export type PrivateNeuralPronunciationLocale = 'en-US' | 'en-GB' | 'sk-SK';

export type PrivateNeuralPronunciationAssetMetadata = {
  id: string;
  requestKey: string;
  contentHash: string;
  sha256: string;
  byteLength: number;
  contentType: typeof PRIVATE_NEURAL_CONTENT_TYPE;
  locale: PrivateNeuralPronunciationLocale;
  synthesisVersion: typeof PRIVATE_NEURAL_SYNTHESIS_VERSION;
};

export type PrivateNeuralPronunciationAsset = PrivateNeuralPronunciationAssetMetadata & {
  signedUrl: string;
  expiresInSeconds: typeof PRIVATE_NEURAL_SIGNED_URL_SECONDS;
};

export type PrivateNeuralPronunciationResult =
  | { status: 'ready'; asset: PrivateNeuralPronunciationAsset }
  | { status: 'pending'; retryAfterSeconds: number };

export type PrivateNeuralEligibilityInput = {
  text: string;
  sourceLanguageCode: string;
  locale: string;
  catalogSenseId: string | null;
  featureEnabled?: boolean;
};

export type PrivateNeuralPronunciationErrorCode =
  | 'configuration'
  | 'session_expired'
  | 'limited'
  | 'unavailable'
  | 'invalid_response';

export class PrivateNeuralPronunciationError extends Error {
  constructor(public readonly code: PrivateNeuralPronunciationErrorCode) {
    const messages: Record<PrivateNeuralPronunciationErrorCode, string> = {
      configuration: 'Cloud neural pronunciation is not configured in this build.',
      session_expired: 'Your session expired. Sign in again to use cloud neural pronunciation.',
      limited: 'The cloud neural pronunciation limit has been reached. Please try again later.',
      unavailable: 'Cloud neural pronunciation is temporarily unavailable. Please try again.',
      invalid_response: 'The cloud neural pronunciation response could not be verified.',
    };
    super(messages[code]);
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrivateLocale(value: string): value is PrivateNeuralPronunciationLocale {
  return value === 'en-US' || value === 'en-GB' || value === 'sk-SK';
}

function localeMatchesLanguage(locale: PrivateNeuralPronunciationLocale, languageCode: string) {
  return locale === 'sk-SK' ? languageCode === 'sk' : languageCode === 'en';
}

export function privateNeuralPreviewFeatureEnabled() {
  return process.env.EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED === 'true';
}

export function getPrivateNeuralPronunciationEligibility(
  input: PrivateNeuralEligibilityInput,
): { text: string; locale: PrivateNeuralPronunciationLocale } | null {
  const enabled = input.featureEnabled ?? privateNeuralPreviewFeatureEnabled();
  if (!enabled
    || input.catalogSenseId !== null
    || !isPrivateLocale(input.locale)
    || !localeMatchesLanguage(input.locale, input.sourceLanguageCode)
    || typeof input.text !== 'string'
    || input.text.length < 1
    || input.text.length > 200
    || input.text !== input.text.trim()
    || /[\u0000-\u001f\u007f]/.test(input.text)) return null;
  return { text: input.text, locale: input.locale };
}

export function parsePrivateNeuralAssetMetadata(
  value: unknown,
  requestedLocale: PrivateNeuralPronunciationLocale,
): PrivateNeuralPronunciationAssetMetadata {
  if (!isPlainObject(value)
    || typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)
    || typeof value.requestKey !== 'string' || !SHA256_PATTERN.test(value.requestKey)
    || typeof value.contentHash !== 'string' || value.contentHash !== value.requestKey
    || typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)
    || !Number.isInteger(value.byteLength) || (value.byteLength as number) < 101
    || (value.byteLength as number) > PRIVATE_NEURAL_MAXIMUM_BYTES
    || value.contentType !== PRIVATE_NEURAL_CONTENT_TYPE
    || value.locale !== requestedLocale
    || value.synthesisVersion !== PRIVATE_NEURAL_SYNTHESIS_VERSION) {
    throw new PrivateNeuralPronunciationError('invalid_response');
  }
  return value as unknown as PrivateNeuralPronunciationAssetMetadata;
}

export function isExpectedPrivatePronunciationSignedUrl(
  urlValue: string,
  userId: string,
  contentHash: string,
) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl || !UUID_PATTERN.test(userId) || !SHA256_PATTERN.test(contentHash)) return false;
  try {
    const base = new URL(supabaseUrl);
    const url = new URL(urlValue);
    const expectedPath = `/storage/v1/object/sign/pron-private/${userId}/`
      + `${PRIVATE_NEURAL_SYNTHESIS_VERSION}/${contentHash}.mp3`;
    const searchKeys = [...url.searchParams.keys()];
    return url.origin === base.origin
      && url.pathname === expectedPath
      && !url.username
      && !url.password
      && !url.hash
      && searchKeys.length === 1
      && searchKeys[0] === 'token'
      && Boolean(url.searchParams.get('token'));
  } catch {
    return false;
  }
}

export function parsePrivateNeuralPronunciationResponse(
  value: unknown,
  requestedLocale: PrivateNeuralPronunciationLocale,
  userId: string,
): PrivateNeuralPronunciationResult {
  if (!isPlainObject(value) || typeof value.status !== 'string') {
    throw new PrivateNeuralPronunciationError('invalid_response');
  }
  if (value.status === 'pending') {
    if (!Number.isInteger(value.retryAfterSeconds)
      || (value.retryAfterSeconds as number) < 1
      || (value.retryAfterSeconds as number) > 30) {
      throw new PrivateNeuralPronunciationError('invalid_response');
    }
    return { status: 'pending', retryAfterSeconds: value.retryAfterSeconds as number };
  }
  if (value.status !== 'ready' || !isPlainObject(value.asset)) {
    throw new PrivateNeuralPronunciationError('invalid_response');
  }
  const metadata = parsePrivateNeuralAssetMetadata(value.asset, requestedLocale);
  if (typeof value.asset.signedUrl !== 'string'
    || !isExpectedPrivatePronunciationSignedUrl(
      value.asset.signedUrl,
      userId,
      metadata.contentHash,
    )
    || value.asset.expiresInSeconds !== PRIVATE_NEURAL_SIGNED_URL_SECONDS) {
    throw new PrivateNeuralPronunciationError('invalid_response');
  }
  return {
    status: 'ready',
    asset: {
      ...metadata,
      signedUrl: value.asset.signedUrl,
      expiresInSeconds: PRIVATE_NEURAL_SIGNED_URL_SECONDS,
    },
  };
}

type FunctionClient = Pick<SupabaseClient, 'functions'>;

async function functionClient(client?: FunctionClient | null) {
  return client === undefined
    ? (await import('@/data/supabase/client')).supabase
    : client;
}

function mapFunctionError(error: unknown): never {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    if (status === 401) throw new PrivateNeuralPronunciationError('session_expired');
    if (status === 429) throw new PrivateNeuralPronunciationError('limited');
  }
  throw new PrivateNeuralPronunciationError('unavailable');
}

export async function requestPrivateNeuralPronunciation(
  text: string,
  locale: PrivateNeuralPronunciationLocale,
  userId: string,
  client?: FunctionClient | null,
): Promise<PrivateNeuralPronunciationResult> {
  const clientValue = await functionClient(client);
  if (!clientValue) throw new PrivateNeuralPronunciationError('configuration');
  let response;
  try {
    response = await clientValue.functions.invoke('pronunciation-private', {
      body: { text, locale },
    });
  } catch {
    throw new PrivateNeuralPronunciationError('unavailable');
  }
  if (response.error) mapFunctionError(response.error);
  return parsePrivateNeuralPronunciationResponse(response.data, locale, userId);
}

export async function deletePrivateNeuralPronunciation(
  client?: FunctionClient | null,
): Promise<void> {
  const clientValue = await functionClient(client);
  if (!clientValue) throw new PrivateNeuralPronunciationError('configuration');
  let response;
  try {
    response = await clientValue.functions.invoke('pronunciation-private', {
      method: 'DELETE',
    });
  } catch {
    throw new PrivateNeuralPronunciationError('unavailable');
  }
  if (response.error) mapFunctionError(response.error);
}
