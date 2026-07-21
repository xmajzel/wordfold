import { createAzureSpeechSynthesizer } from '../../../supabase/functions/pronunciation-public/azure';
import {
  CONTENT_TYPE,
  SYNTHESIS_VERSION,
  handlePronunciationRequest,
  type AssetRecord,
  type PronunciationDependencies,
  type PronunciationRepository,
  type PronunciationStorage,
} from '../../../supabase/functions/pronunciation-public/core';

declare const require: (id: string) => any;

const { createServer, request: nodeRequest } = require('node:http');

function mp3Bytes(): Uint8Array {
  const bytes = new Uint8Array(128);
  bytes.set([0x49, 0x44, 0x33]);
  return bytes;
}

function request(body: unknown): Request {
  return new Request('https://example.test/functions/v1/pronunciation-public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function harness(overrides: Partial<PronunciationDependencies> = {}) {
  let claimedAsset: AssetRecord | null = null;
  const repository: PronunciationRepository = {
    getCatalogInput: jest.fn(async (catalogSenseId) => ({ catalogSenseId, text: 'able' })),
    claim: jest.fn(async (input) => {
      claimedAsset = {
        id: 'asset-id',
        status: 'pending',
        claimed: true,
        leaseToken: 'lease-id',
        requestKey: input.requestKey,
        contentHash: input.requestKey,
        sha256: null,
        byteLength: null,
        objectKey: `${SYNTHESIS_VERSION}/${input.requestKey}.mp3`,
        locale: input.locale,
        synthesisVersion: SYNTHESIS_VERSION,
      };
      return claimedAsset;
    }),
    authorize: jest.fn(async () => ({ allowed: true, reason: null })),
    complete: jest.fn(async (_requestKey, _leaseToken, sha256, byteLength) => ({
      ...claimedAsset!,
      status: 'ready',
      claimed: false,
      leaseToken: null,
      sha256,
      byteLength,
    }) as AssetRecord),
    fail: jest.fn(async () => undefined),
  };
  const storage: PronunciationStorage = {
    putImmutable: jest.fn(async (_objectKey, bytes) => bytes),
    getPublicUrl: jest.fn((objectKey) => `https://cdn.example.test/${objectKey}`),
  };
  const dependencies: PronunciationDependencies = {
    userId: 'user-id',
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

describe('public pronunciation Edge Function core', () => {
  it('fails unauthenticated and arbitrary-text requests before provider access', async () => {
    const synthesize = jest.fn(async () => ({ bytes: mp3Bytes(), contentType: CONTENT_TYPE }));
    const { dependencies, repository } = harness({ userId: undefined, synthesize });
    const unauthenticated = await handlePronunciationRequest(
      request({ catalogSenseId: '00001740-a:able', locale: 'en-US' }),
      dependencies,
    );
    expect(unauthenticated.status).toBe(401);

    dependencies.userId = 'user-id';
    const arbitraryText = await handlePronunciationRequest(
      request({ catalogSenseId: '00001740-a:able', locale: 'en-US', text: 'secret word' }),
      dependencies,
    );
    expect(arbitraryText.status).toBe(400);
    expect(repository.getCatalogInput).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('hides unsupported locales and unknown catalog identities', async () => {
    const { dependencies, repository } = harness();
    const unsupported = await handlePronunciationRequest(
      request({ catalogSenseId: '00001740-a:able', locale: 'sk-SK' }),
      dependencies,
    );
    expect(unsupported.status).toBe(404);
    const inheritedProperty = await handlePronunciationRequest(
      request({ catalogSenseId: '00001740-a:able', locale: 'toString' }),
      dependencies,
    );
    expect(inheritedProperty.status).toBe(404);

    jest.mocked(repository.getCatalogInput).mockResolvedValueOnce(null);
    const missing = await handlePronunciationRequest(
      request({ catalogSenseId: 'missing', locale: 'en-US' }),
      dependencies,
    );
    expect(missing.status).toBe(404);
    expect(dependencies.synthesize).not.toHaveBeenCalled();
  });

  it('generates, validates, stores, and completes one immutable asset', async () => {
    const { dependencies, repository, storage } = harness();
    const response = await handlePronunciationRequest(
      request({ catalogSenseId: '00001740-a:able', locale: 'en-US' }),
      dependencies,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.asset.byteLength).toBe(128);
    expect(body.asset.publicUrl).toContain(SYNTHESIS_VERSION);
    expect(dependencies.synthesize).toHaveBeenCalledWith({
      text: 'able', locale: 'en-US', voiceId: 'en-US-AvaNeural',
    });
    expect(storage.putImmutable).toHaveBeenCalledTimes(1);
    expect(repository.complete).toHaveBeenCalledTimes(1);
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('returns pending without provider work when another caller owns the lease', async () => {
    const { dependencies, repository } = harness();
    jest.mocked(repository.claim).mockImplementationOnce(async (input) => ({
      id: 'asset-id',
      status: 'pending',
      claimed: false,
      leaseToken: null,
      requestKey: input.requestKey,
      contentHash: input.requestKey,
      sha256: null,
      byteLength: null,
      objectKey: `${SYNTHESIS_VERSION}/${input.requestKey}.mp3`,
      locale: input.locale,
      synthesisVersion: SYNTHESIS_VERSION,
    }));
    const response = await handlePronunciationRequest(
      request({ catalogSenseId: '00001740-a:able', locale: 'en-GB' }),
      dependencies,
    );
    expect(response.status).toBe(202);
    expect(response.headers.get('retry-after')).toBe('2');
    expect(dependencies.synthesize).not.toHaveBeenCalled();
    expect(repository.authorize).toHaveBeenCalledWith(expect.objectContaining({
      requestKind: 'pending', billedCharacters: 0,
    }));
  });

  it('fails a claimed asset before provider access when a budget gate denies it', async () => {
    const { dependencies, repository } = harness();
    jest.mocked(repository.authorize).mockResolvedValueOnce({
      allowed: false,
      reason: 'global_budget_limited',
    });
    const response = await handlePronunciationRequest(
      request({ catalogSenseId: '00001740-a:able', locale: 'en-US' }),
      dependencies,
    );
    expect(response.status).toBe(429);
    expect(dependencies.synthesize).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      expect.any(String), 'lease-id', 'budget_limited',
    );
  });

  it('rejects invalid provider audio and records only its safe failure code', async () => {
    const { dependencies, repository } = harness({
      synthesize: jest.fn(async () => ({
        bytes: new Uint8Array(128),
        contentType: 'text/plain',
      })),
    });
    const response = await handlePronunciationRequest(
      request({ catalogSenseId: '00001740-a:able', locale: 'en-US' }),
      dependencies,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: 'invalid_audio' } });
    expect(repository.fail).toHaveBeenCalledWith(
      expect.any(String), 'lease-id', 'invalid_audio',
    );
  });
});

describe('Azure pronunciation adapter', () => {
  it('fails closed when paid-tier provider configuration is incomplete', () => {
    expect(() => createAzureSpeechSynthesizer({
      key: '', region: 'westeurope', tier: 'S0',
    })).toThrow('provider_auth');
    expect(() => createAzureSpeechSynthesizer({
      key: 'test-key', region: 'westeurope', tier: 'F0',
    })).toThrow('provider_auth');
  });

  it('pins output settings and XML-escapes canonical input', async () => {
    const fetchImplementation = jest.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(mp3Bytes().buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': CONTENT_TYPE },
    }));
    const synthesize = createAzureSpeechSynthesizer({
      key: 'test-key',
      region: 'westeurope',
      tier: 'S0',
      fetchImplementation,
    });
    await synthesize({ text: `rock & roll <test>`, locale: 'en-GB', voiceId: 'en-GB-RyanNeural' });

    const [, init] = fetchImplementation.mock.calls[0];
    expect(init?.headers).toEqual(expect.objectContaining({
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
    }));
    expect(init?.body).toContain('rock &amp; roll &lt;test&gt;');
    expect(init?.body).toContain('en-GB-RyanNeural');
  });

  it('runs the full generation path against a local fake Azure endpoint', async () => {
    let receivedBody = '';
    const server = createServer((incoming: any, outgoing: any) => {
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => { receivedBody += chunk; });
      incoming.on('end', () => {
        outgoing.writeHead(200, { 'Content-Type': CONTENT_TYPE });
        outgoing.end(mp3Bytes());
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Fake Azure server did not bind.');
      const fetchImplementation = jest.fn((input: RequestInfo | URL, init?: RequestInit) => (
        new Promise<Response>((resolve, reject) => {
          const outgoing = nodeRequest(String(input), {
            method: init?.method,
            headers: init?.headers,
          }, (incoming: any) => {
            const chunks: Uint8Array[] = [];
            incoming.on('data', (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
            incoming.on('end', () => {
              const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
              const bytes = new Uint8Array(length);
              let offset = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
              }
              resolve(new Response(bytes.buffer, {
                status: incoming.statusCode,
                headers: { 'Content-Type': incoming.headers['content-type'] ?? '' },
              }));
            });
          });
          outgoing.on('error', reject);
          if (typeof init?.body === 'string') outgoing.write(init.body);
          outgoing.end();
        })
      ));
      const synthesize = createAzureSpeechSynthesizer({
        key: 'test-key',
        region: 'westeurope',
        tier: 'S0',
        endpoint: `http://127.0.0.1:${address.port}/cognitiveservices/v1`,
        fetchImplementation,
      });
      const { dependencies } = harness({ synthesize });
      const response = await handlePronunciationRequest(
        request({ catalogSenseId: '00001740-a:able', locale: 'en-US' }),
        dependencies,
      );

      expect({ status: response.status, body: await response.clone().json() }).toEqual({
        status: 200,
        body: expect.objectContaining({ status: 'ready' }),
      });
      expect(receivedBody).toContain('<voice name="en-US-AvaNeural">able</voice>');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => {
        if (error) reject(error); else resolve();
      }));
    }
  });

  it('does not expose provider response bodies on failure', async () => {
    const synthesize = createAzureSpeechSynthesizer({
      key: 'test-key',
      region: 'westeurope',
      tier: 'S0',
      fetchImplementation: jest.fn(async () => new Response('sensitive provider detail', { status: 500 })),
    });
    await expect(synthesize({ text: 'able', locale: 'en-US', voiceId: 'en-US-AvaNeural' }))
      .rejects.toMatchObject({ message: 'provider_unavailable' });
  });
});
