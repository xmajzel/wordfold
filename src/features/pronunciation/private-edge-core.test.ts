import {
  CONTENT_TYPE,
  SafePronunciationError,
} from '../../../supabase/functions/pronunciation-public/core';
import { createPrivateAzureSpeechSynthesizer } from '../../../supabase/functions/pronunciation-private/azure';
import {
  PRIVATE_SIGNED_URL_SECONDS,
  PRIVATE_SYNTHESIS_VERSION,
  PRIVATE_VOICES,
  createPrivateRequestKey,
  handlePrivatePronunciationRequest,
  type PrivateAssetRecord,
  type PrivatePronunciationDependencies,
  type PrivatePronunciationRepository,
  type PrivatePronunciationStorage,
} from '../../../supabase/functions/pronunciation-private/core';

const OWNER_A = '00000000-0000-4000-8000-0000000000a1';
const OWNER_B = '00000000-0000-4000-8000-0000000000b2';

function mp3Bytes(): Uint8Array {
  const bytes = new Uint8Array(128);
  bytes.set([0x49, 0x44, 0x33]);
  return bytes;
}

function request(body?: unknown, method = 'POST', headers?: HeadersInit): Request {
  return new Request('https://example.test/functions/v1/pronunciation-private', {
    method,
    headers: method === 'POST'
      ? { 'Content-Type': 'application/json', ...headers }
      : headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function harness(overrides: Partial<PrivatePronunciationDependencies> = {}) {
  let claimedAsset: PrivateAssetRecord | null = null;
  const repository: PrivatePronunciationRepository = {
    claim: jest.fn(async (input) => {
      claimedAsset = {
        id: 'asset-id',
        ownerUserId: input.ownerUserId,
        status: 'pending',
        claimed: true,
        leaseToken: 'lease-id',
        requestKey: input.requestKey,
        contentHash: input.requestKey,
        sha256: null,
        byteLength: null,
        objectKey: `${input.ownerUserId}/${PRIVATE_SYNTHESIS_VERSION}/${input.requestKey}.mp3`,
        locale: input.locale,
        synthesisVersion: PRIVATE_SYNTHESIS_VERSION,
      };
      return claimedAsset;
    }),
    authorize: jest.fn(async () => ({ allowed: true, reason: null })),
    complete: jest.fn(async (_ownerUserId, _requestKey, _leaseToken, sha256, byteLength) => ({
      ...claimedAsset!,
      status: 'ready',
      claimed: false,
      leaseToken: null,
      sha256,
      byteLength,
    }) as PrivateAssetRecord),
    fail: jest.fn(async () => undefined),
    listOwnerObjectKeys: jest.fn(async () => []),
    deleteOwnerMetadata: jest.fn(async () => undefined),
  };
  const storage: PrivatePronunciationStorage = {
    putImmutable: jest.fn(async (_objectKey, bytes) => bytes),
    createSignedUrl: jest.fn(async (objectKey) => (
      `https://project.supabase.co/storage/v1/object/sign/pron-private/${objectKey}?token=signed`
    )),
    remove: jest.fn(async () => undefined),
  };
  const dependencies: PrivatePronunciationDependencies = {
    userId: OWNER_A,
    limits: {
      userHourlyRequests: 20,
      userDailyCharacters: 1000,
      globalDailyCharacters: 10_000,
    },
    repository,
    storage,
    synthesize: jest.fn(async () => ({ bytes: mp3Bytes(), contentType: CONTENT_TYPE })),
    ...overrides,
  };
  return { dependencies, repository, storage };
}

describe('private pronunciation Edge Function core', () => {
  it('requires authentication and rejects unsupported methods before other work', async () => {
    const { dependencies, repository } = harness({ userId: undefined });
    const unauthenticated = await handlePrivatePronunciationRequest(
      request({ text: 'hello', locale: 'en-US' }),
      dependencies,
    );
    expect(unauthenticated.status).toBe(401);

    dependencies.userId = OWNER_A;
    const wrongMethod = await handlePrivatePronunciationRequest(
      request(undefined, 'PATCH'),
      dependencies,
    );
    expect(wrongMethod.status).toBe(405);
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it.each([
    [{ text: ' hello', locale: 'en-US' }, 400],
    [{ text: 'hello\nworld', locale: 'en-US' }, 400],
    [{ text: 'x'.repeat(201), locale: 'en-US' }, 400],
    [{ text: 'hello', locale: 'de-DE' }, 404],
    [{ text: 'hello', locale: 'en-US', catalogSenseId: 'public' }, 400],
  ])('rejects invalid or unsupported private input %#', async (body, status) => {
    const { dependencies } = harness();
    const response = await handlePrivatePronunciationRequest(request(body), dependencies);
    expect(response.status).toBe(status);
    expect(dependencies.synthesize).not.toHaveBeenCalled();
  });

  it.each([
    ['en-US', 'en-US-AvaNeural'],
    ['en-GB', 'en-GB-RyanNeural'],
    ['sk-SK', 'sk-SK-ViktoriaNeural'],
  ] as const)('generates %s with its pinned private voice without persisting raw text', async (
    locale,
    voiceId,
  ) => {
    const { dependencies, repository, storage } = harness();
    const response = await handlePrivatePronunciationRequest(
      request({ text: 'Súkromné slovo', locale }),
      dependencies,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'ready',
      asset: expect.objectContaining({
        byteLength: 128,
        locale,
        synthesisVersion: PRIVATE_SYNTHESIS_VERSION,
        expiresInSeconds: PRIVATE_SIGNED_URL_SECONDS,
        signedUrl: expect.stringContaining('/pron-private/'),
      }),
    });
    expect(dependencies.synthesize).toHaveBeenCalledWith({
      text: 'Súkromné slovo', locale, voiceId,
    });
    expect(repository.claim).toHaveBeenCalledWith(expect.not.objectContaining({ text: expect.anything() }));
    expect(repository.authorize).toHaveBeenCalledWith(expect.not.objectContaining({ text: expect.anything() }));
    expect(storage.createSignedUrl).toHaveBeenCalledWith(
      expect.stringContaining(`${OWNER_A}/${PRIVATE_SYNTHESIS_VERSION}/`),
      PRIVATE_SIGNED_URL_SECONDS,
    );
  });

  it('namespaces identical synthesis input by account before any lookup', async () => {
    const first = await createPrivateRequestKey(OWNER_A, 'private phrase', 'en-US');
    const second = await createPrivateRequestKey(OWNER_B, 'private phrase', 'en-US');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns a new short-lived URL for a ready account-local cache hit', async () => {
    const { dependencies, repository, storage } = harness();
    jest.mocked(repository.claim).mockImplementationOnce(async (input) => ({
      id: 'asset-id',
      ownerUserId: input.ownerUserId,
      status: 'ready',
      claimed: false,
      leaseToken: null,
      requestKey: input.requestKey,
      contentHash: input.requestKey,
      sha256: 'a'.repeat(64),
      byteLength: 128,
      objectKey: `${input.ownerUserId}/${PRIVATE_SYNTHESIS_VERSION}/${input.requestKey}.mp3`,
      locale: input.locale,
      synthesisVersion: PRIVATE_SYNTHESIS_VERSION,
    }));

    const response = await handlePrivatePronunciationRequest(
      request({ text: 'hello', locale: 'en-US' }),
      dependencies,
    );
    expect(response.status).toBe(200);
    expect(dependencies.synthesize).not.toHaveBeenCalled();
    expect(storage.putImmutable).not.toHaveBeenCalled();
    expect(repository.authorize).toHaveBeenCalledWith(expect.objectContaining({
      requestKind: 'cache_hit', billedCharacters: 0,
    }));
  });

  it('returns pending without provider work and fails closed at the shared budget gate', async () => {
    const pendingHarness = harness();
    jest.mocked(pendingHarness.repository.claim).mockImplementationOnce(async (input) => ({
      id: 'asset-id',
      ownerUserId: input.ownerUserId,
      status: 'pending',
      claimed: false,
      leaseToken: null,
      requestKey: input.requestKey,
      contentHash: input.requestKey,
      sha256: null,
      byteLength: null,
      objectKey: `${input.ownerUserId}/${PRIVATE_SYNTHESIS_VERSION}/${input.requestKey}.mp3`,
      locale: input.locale,
      synthesisVersion: PRIVATE_SYNTHESIS_VERSION,
    }));
    const pending = await handlePrivatePronunciationRequest(
      request({ text: 'hello', locale: 'en-GB' }),
      pendingHarness.dependencies,
    );
    expect(pending.status).toBe(202);
    expect(pendingHarness.dependencies.synthesize).not.toHaveBeenCalled();

    const deniedHarness = harness();
    jest.mocked(deniedHarness.repository.authorize).mockResolvedValueOnce({
      allowed: false,
      reason: 'global_budget_limited',
    });
    const denied = await handlePrivatePronunciationRequest(
      request({ text: 'hello', locale: 'en-US' }),
      deniedHarness.dependencies,
    );
    expect(denied.status).toBe(429);
    expect(deniedHarness.dependencies.synthesize).not.toHaveBeenCalled();
    expect(deniedHarness.repository.fail).toHaveBeenCalledWith(
      OWNER_A, expect.any(String), 'lease-id', 'budget_limited',
    );
  });

  it('returns pending while an expired asset is being deleted', async () => {
    const { dependencies, repository, storage } = harness();
    jest.mocked(repository.claim).mockImplementationOnce(async (input) => ({
      id: 'asset-id',
      ownerUserId: input.ownerUserId,
      status: 'deleting',
      claimed: false,
      leaseToken: null,
      requestKey: input.requestKey,
      contentHash: input.requestKey,
      sha256: 'a'.repeat(64),
      byteLength: 128,
      objectKey: `${input.ownerUserId}/${PRIVATE_SYNTHESIS_VERSION}/${input.requestKey}.mp3`,
      locale: input.locale,
      synthesisVersion: PRIVATE_SYNTHESIS_VERSION,
    }));

    const response = await handlePrivatePronunciationRequest(
      request({ text: 'hello', locale: 'en-US' }),
      dependencies,
    );

    expect(response.status).toBe(202);
    expect(repository.authorize).toHaveBeenCalledWith(expect.objectContaining({
      requestKind: 'pending',
      billedCharacters: 0,
    }));
    expect(dependencies.synthesize).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it('removes only validated current-owner objects before deleting metadata', async () => {
    const { dependencies, repository, storage } = harness();
    const keys = [
      `${OWNER_A}/${PRIVATE_SYNTHESIS_VERSION}/${'a'.repeat(64)}.mp3`,
      `${OWNER_A}/${PRIVATE_SYNTHESIS_VERSION}/${'b'.repeat(64)}.mp3`,
    ];
    jest.mocked(repository.listOwnerObjectKeys).mockResolvedValueOnce(keys);
    const response = await handlePrivatePronunciationRequest(
      request(undefined, 'DELETE'),
      dependencies,
    );
    expect(response.status).toBe(204);
    expect(storage.remove).toHaveBeenCalledWith(keys);
    expect(repository.deleteOwnerMetadata).toHaveBeenCalledWith(OWNER_A);

    jest.mocked(repository.listOwnerObjectKeys).mockResolvedValueOnce([
      `${OWNER_B}/${PRIVATE_SYNTHESIS_VERSION}/${'c'.repeat(64)}.mp3`,
    ]);
    const unsafe = await handlePrivatePronunciationRequest(
      request(undefined, 'DELETE'),
      dependencies,
    );
    expect(unsafe.status).toBe(503);
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it('records only a safe provider failure code', async () => {
    const { dependencies, repository } = harness({
      synthesize: jest.fn(async () => {
        throw new SafePronunciationError('provider_unavailable', 502);
      }),
    });
    const response = await handlePrivatePronunciationRequest(
      request({ text: 'private provider detail', locale: 'en-US' }),
      dependencies,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: 'provider_unavailable' } });
    expect(repository.fail).toHaveBeenCalledWith(
      OWNER_A, expect.any(String), 'lease-id', 'provider_unavailable',
    );
  });
});

describe('private Azure pronunciation adapter', () => {
  it('pins the Slovak voice request and XML-escapes private text', async () => {
    const fetchImplementation = jest.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(mp3Bytes().buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': CONTENT_TYPE },
    }));
    const synthesize = createPrivateAzureSpeechSynthesizer({
      key: 'test-key',
      region: 'westeurope',
      tier: 'S0',
      fetchImplementation,
    });
    await synthesize({
      text: `súkromné & <slovo>`,
      locale: 'sk-SK',
      voiceId: PRIVATE_VOICES['sk-SK'],
    });
    const [, init] = fetchImplementation.mock.calls[0];
    expect(init?.body).toContain('súkromné &amp; &lt;slovo&gt;');
    expect(init?.body).toContain('sk-SK-ViktoriaNeural');
  });
});
