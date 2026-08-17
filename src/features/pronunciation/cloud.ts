import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

import { getCefrEntry } from '@/data/cefr-catalog';

export const NEURAL_SYNTHESIS_VERSION = 'azure-public-preview-v1';
export const NEURAL_CONTENT_TYPE = 'audio/mpeg';
export const NEURAL_MAXIMUM_BYTES = 1_048_576;

export type NeuralPronunciationLocale = 'en-US' | 'en-GB';

export type NeuralPronunciationAsset = {
  id: string;
  requestKey: string;
  contentHash: string;
  sha256: string;
  byteLength: number;
  contentType: typeof NEURAL_CONTENT_TYPE;
  locale: NeuralPronunciationLocale;
  synthesisVersion: typeof NEURAL_SYNTHESIS_VERSION;
  publicUrl: string;
};

export type NeuralPronunciationResult =
  | { status: 'ready'; asset: NeuralPronunciationAsset }
  | { status: 'pending'; retryAfterSeconds: number };

export type NeuralEligibilityInput = {
  text: string;
  sourceLanguageCode: string;
  locale: string;
  catalogSenseId: string | null;
  featureEnabled?: boolean;
};

export type NeuralPronunciationErrorCode =
  | 'configuration'
  | 'session_expired'
  | 'limited'
  | 'unavailable'
  | 'invalid_response';

export class NeuralPronunciationError extends Error {
  constructor(public readonly code: NeuralPronunciationErrorCode) {
    const messages: Record<NeuralPronunciationErrorCode, string> = {
      configuration: 'Neural voice preview is not configured in this build.',
      session_expired: 'Your session expired. Sign in again to use neural voice preview.',
      limited: 'The neural voice preview limit has been reached. Please try again later.',
      unavailable: 'Neural voice preview is temporarily unavailable. Please try again.',
      invalid_response: 'The neural voice preview response could not be verified.',
    };
    super(messages[code]);
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function neuralPreviewFeatureEnabled() {
  return process.env.EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED === 'true';
}

export function getNeuralPronunciationEligibility(input: NeuralEligibilityInput): {
  catalogSenseId: string;
  locale: NeuralPronunciationLocale;
} | null {
  const enabled = input.featureEnabled ?? neuralPreviewFeatureEnabled();
  if (!enabled
    || input.sourceLanguageCode !== 'en'
    || (input.locale !== 'en-US' && input.locale !== 'en-GB')
    || !input.catalogSenseId) return null;
  const entry = getCefrEntry(input.catalogSenseId);
  if (!entry || entry.term !== input.text) return null;
  return { catalogSenseId: entry.catalogSenseId, locale: input.locale };
}

export function isExpectedPronunciationPublicUrl(urlValue: string, contentHash: string) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl || !SHA256_PATTERN.test(contentHash)) return false;
  try {
    const base = new URL(supabaseUrl);
    const url = new URL(urlValue);
    const expected = new URL(
      `/storage/v1/object/public/pron-public/${NEURAL_SYNTHESIS_VERSION}/${contentHash}.mp3`,
      base,
    );
    return url.origin === expected.origin
      && url.pathname === expected.pathname
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function parseNeuralPronunciationResponse(
  value: unknown,
  requestedLocale: NeuralPronunciationLocale,
): NeuralPronunciationResult {
  if (!isPlainObject(value) || typeof value.status !== 'string') {
    throw new NeuralPronunciationError('invalid_response');
  }
  if (value.status === 'pending') {
    if (!Number.isInteger(value.retryAfterSeconds)
      || (value.retryAfterSeconds as number) < 1
      || (value.retryAfterSeconds as number) > 30) {
      throw new NeuralPronunciationError('invalid_response');
    }
    return { status: 'pending', retryAfterSeconds: value.retryAfterSeconds as number };
  }
  if (value.status !== 'ready' || !isPlainObject(value.asset)) {
    throw new NeuralPronunciationError('invalid_response');
  }
  const asset = value.asset;
  if (typeof asset.id !== 'string' || !UUID_PATTERN.test(asset.id)
    || typeof asset.requestKey !== 'string' || !SHA256_PATTERN.test(asset.requestKey)
    || typeof asset.contentHash !== 'string' || asset.contentHash !== asset.requestKey
    || typeof asset.sha256 !== 'string' || !SHA256_PATTERN.test(asset.sha256)
    || !Number.isInteger(asset.byteLength) || (asset.byteLength as number) < 101
    || (asset.byteLength as number) > NEURAL_MAXIMUM_BYTES
    || asset.contentType !== NEURAL_CONTENT_TYPE
    || asset.locale !== requestedLocale
    || asset.synthesisVersion !== NEURAL_SYNTHESIS_VERSION
    || typeof asset.publicUrl !== 'string'
    || !isExpectedPronunciationPublicUrl(asset.publicUrl, asset.contentHash)) {
    throw new NeuralPronunciationError('invalid_response');
  }
  return { status: 'ready', asset: asset as NeuralPronunciationAsset };
}

type FunctionClient = Pick<SupabaseClient, 'functions'>;

export async function requestNeuralPronunciation(
  catalogSenseId: string,
  locale: NeuralPronunciationLocale,
  client?: FunctionClient | null,
): Promise<NeuralPronunciationResult> {
  const functionClient = client === undefined
    ? (await import('@/data/supabase/client')).supabase
    : client;
  if (!functionClient) throw new NeuralPronunciationError('configuration');
  let response;
  try {
    response = await functionClient.functions.invoke('pronunciation-public', {
      body: { catalogSenseId, locale },
    });
  } catch {
    throw new NeuralPronunciationError('unavailable');
  }
  if (response.error) {
    if (response.error instanceof FunctionsHttpError) {
      const status = response.error.context.status;
      if (status === 401) throw new NeuralPronunciationError('session_expired');
      if (status === 429) throw new NeuralPronunciationError('limited');
    }
    throw new NeuralPronunciationError('unavailable');
  }
  return parseNeuralPronunciationResponse(response.data, locale);
}
