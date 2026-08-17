import {
  PRIVATE_NEURAL_SIGNED_URL_SECONDS,
  PRIVATE_NEURAL_SYNTHESIS_VERSION,
  PrivateNeuralPronunciationError,
  deletePrivateNeuralPronunciation,
  getPrivateNeuralPronunciationEligibility,
  isExpectedPrivatePronunciationSignedUrl,
  parsePrivateNeuralPronunciationResponse,
  requestPrivateNeuralPronunciation,
} from './private-cloud';

const userId = '00000000-0000-4000-8000-0000000000a1';
const contentHash = 'a'.repeat(64);
const signedUrl = `https://project.supabase.co/storage/v1/object/sign/pron-private/${userId}/`
  + `${PRIVATE_NEURAL_SYNTHESIS_VERSION}/${contentHash}.mp3?token=signed-token`;
const asset = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  requestKey: contentHash,
  contentHash,
  sha256: 'b'.repeat(64),
  byteLength: 12_345,
  contentType: 'audio/mpeg',
  locale: 'sk-SK',
  synthesisVersion: PRIVATE_NEURAL_SYNTHESIS_VERSION,
  signedUrl,
  expiresInSeconds: PRIVATE_NEURAL_SIGNED_URL_SECONDS,
};

describe('private neural pronunciation cloud contract', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  });

  it('allows only exact private input for the supported language and locale', () => {
    const eligible = {
      text: 'súkromné slovo',
      sourceLanguageCode: 'sk',
      locale: 'sk-SK',
      catalogSenseId: null,
      featureEnabled: true,
    };
    expect(getPrivateNeuralPronunciationEligibility(eligible)).toEqual({
      text: 'súkromné slovo', locale: 'sk-SK',
    });
    expect(getPrivateNeuralPronunciationEligibility({ ...eligible, text: ' súkromné slovo' }))
      .toBeNull();
    expect(getPrivateNeuralPronunciationEligibility({ ...eligible, locale: 'en-US' })).toBeNull();
    expect(getPrivateNeuralPronunciationEligibility({ ...eligible, catalogSenseId: 'catalog' }))
      .toBeNull();
    expect(getPrivateNeuralPronunciationEligibility({ ...eligible, featureEnabled: false }))
      .toBeNull();
  });

  it('accepts only the current account path and one short-lived signed token', () => {
    expect(parsePrivateNeuralPronunciationResponse(
      { status: 'ready', asset },
      'sk-SK',
      userId,
    )).toEqual({ status: 'ready', asset });
    expect(isExpectedPrivatePronunciationSignedUrl(signedUrl, userId, contentHash)).toBe(true);
    expect(isExpectedPrivatePronunciationSignedUrl(
      signedUrl.replace(userId, '00000000-0000-4000-8000-0000000000b2'),
      userId,
      contentHash,
    )).toBe(false);
    expect(() => parsePrivateNeuralPronunciationResponse(
      { status: 'ready', asset: { ...asset, signedUrl: `${signedUrl}&download=1` } },
      'sk-SK',
      userId,
    )).toThrow(PrivateNeuralPronunciationError);
  });

  it('invokes the authenticated private endpoint with only exact text and locale', async () => {
    const invoke = jest.fn(async () => ({
      data: { status: 'ready', asset },
      error: null,
    }));
    const client = { functions: { invoke } } as never;

    await expect(requestPrivateNeuralPronunciation(
      'súkromné slovo',
      'sk-SK',
      userId,
      client,
    )).resolves.toEqual({ status: 'ready', asset });
    expect(invoke).toHaveBeenCalledWith('pronunciation-private', {
      body: { text: 'súkromné slovo', locale: 'sk-SK' },
    });
  });

  it('uses DELETE without a synthesis body for opt-out', async () => {
    const invoke = jest.fn(async () => ({ data: null, error: null }));
    const client = { functions: { invoke } } as never;

    await expect(deletePrivateNeuralPronunciation(client)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('pronunciation-private', { method: 'DELETE' });
  });
});
