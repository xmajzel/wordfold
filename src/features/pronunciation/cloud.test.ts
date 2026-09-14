import { getCourseCatalogEntries } from '@/data/course-catalog';
import {
  getNeuralPronunciationEligibility,
  isExpectedPronunciationPublicUrl,
  NeuralPronunciationError,
  parseNeuralPronunciationResponse,
  requestNeuralPronunciation,
} from './cloud';

const contentHash = 'a'.repeat(64);
const asset = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  requestKey: contentHash,
  contentHash,
  sha256: 'b'.repeat(64),
  byteLength: 12_345,
  contentType: 'audio/mpeg',
  locale: 'en-US',
  synthesisVersion: 'azure-public-preview-v1',
  publicUrl: `https://project.supabase.co/storage/v1/object/public/pron-public/azure-public-preview-v1/${contentHash}.mp3`,
};

describe('neural pronunciation cloud contract', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  });

  it('allows only an exact, enabled English catalog term and locale', () => {
    const eligible = {
      text: 'scope', sourceLanguageCode: 'en', locale: 'en-US',
      catalogSenseId: 'wordfold:scope:business', featureEnabled: true,
    };

    expect(getNeuralPronunciationEligibility(eligible)).toEqual({
      catalogSenseId: 'wordfold:scope:business', locale: 'en-US',
    });
    expect(getNeuralPronunciationEligibility({ ...eligible, text: 'Scope' })).toBeNull();
    expect(getNeuralPronunciationEligibility({ ...eligible, locale: 'es-ES' })).toBeNull();
    expect(getNeuralPronunciationEligibility({ ...eligible, sourceLanguageCode: 'es' })).toBeNull();
    expect(getNeuralPronunciationEligibility({ ...eligible, featureEnabled: false })).toBeNull();
    expect(getNeuralPronunciationEligibility({ ...eligible, catalogSenseId: null })).toBeNull();
  });

  it('accepts the strict ready and pending response shapes', () => {
    expect(parseNeuralPronunciationResponse({ status: 'ready', asset }, 'en-US')).toEqual({
      status: 'ready', asset,
    });
    expect(parseNeuralPronunciationResponse(
      { status: 'pending', retryAfterSeconds: 3 }, 'en-US',
    )).toEqual({ status: 'pending', retryAfterSeconds: 3 });
  });

  it('rejects altered metadata and URLs outside the configured public bucket path', () => {
    expect(() => parseNeuralPronunciationResponse(
      { status: 'ready', asset: { ...asset, locale: 'en-GB' } }, 'en-US',
    )).toThrow(NeuralPronunciationError);
    expect(() => parseNeuralPronunciationResponse(
      { status: 'ready', asset: { ...asset, publicUrl: `${asset.publicUrl}?token=secret` } }, 'en-US',
    )).toThrow(NeuralPronunciationError);
    expect(isExpectedPronunciationPublicUrl(
      `https://attacker.test/storage/v1/object/public/pron-public/azure-public-preview-v1/${contentHash}.mp3`,
      contentHash,
    )).toBe(false);
  });

  it('invokes only the authenticated catalog function input and parses its response', async () => {
    const invoke = jest.fn(async () => ({ data: { status: 'ready', asset }, error: null }));
    const client = { functions: { invoke } } as never;

    await expect(requestNeuralPronunciation(
      'wordfold:scope:business', 'en-US', client,
    )).resolves.toEqual({ status: 'ready', asset });
    expect(invoke).toHaveBeenCalledWith('pronunciation-public', {
      body: { catalogSenseId: 'wordfold:scope:business', locale: 'en-US' },
    });
  });
});

it.each(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const)('supports the canonical Spanish %s term in both Spanish regions only', level => {
  const entry = getCourseCatalogEntries('es-sk', level)[0];
  expect(entry).toBeDefined();
  for (const locale of ['es-ES', 'es-MX']) {
    const input = { text: entry.term, catalogSenseId: entry.catalogSenseId, sourceLanguageCode: 'es', locale, featureEnabled: true };
    expect(getNeuralPronunciationEligibility(input)).toEqual({ catalogSenseId: entry.catalogSenseId, locale });
    expect(getNeuralPronunciationEligibility({ ...input, text: entry.term + ' alterado' })).toBeNull();
    expect(getNeuralPronunciationEligibility({ ...input, locale: 'en-US' })).toBeNull();
  }
});
