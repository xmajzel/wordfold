import {
  CONTENT_TYPE,
  MAX_AUDIO_BYTES,
  MODEL_TIER,
  OUTPUT_FORMAT,
  PROVIDER,
  SafePronunciationError,
  sha256Hex,
  validateMp3,
  type BudgetLimits,
  type BudgetResult,
  type FailureCode,
  type SynthesisResult,
} from '../pronunciation-public/core.ts';

export const PRIVATE_SYNTHESIS_VERSION = 'azure-private-preview-v1';
export const MAX_PRIVATE_REQUEST_BYTES = 1_024;
export const PRIVATE_SIGNED_URL_SECONDS = 60;

export const PRIVATE_VOICES = {
  'en-US': 'en-US-AvaNeural',
  'en-GB': 'en-GB-RyanNeural',
  'sk-SK': 'sk-SK-ViktoriaNeural',
} as const;

export type PrivatePronunciationLocale = keyof typeof PRIVATE_VOICES;

export type PrivateAssetRecord = {
  id: string;
  ownerUserId: string;
  status: 'pending' | 'ready' | 'failed';
  claimed: boolean;
  leaseToken: string | null;
  requestKey: string;
  contentHash: string;
  sha256: string | null;
  byteLength: number | null;
  objectKey: string;
  locale: PrivatePronunciationLocale;
  synthesisVersion: typeof PRIVATE_SYNTHESIS_VERSION;
};

type ClaimInput = {
  ownerUserId: string;
  locale: PrivatePronunciationLocale;
  voiceId: string;
  requestKey: string;
};

type BudgetInput = {
  userId: string;
  locale: PrivatePronunciationLocale;
  requestKey: string;
  requestKind: 'cache_hit' | 'pending' | 'generation';
  billedCharacters: number;
  limits: BudgetLimits;
};

export type PrivatePronunciationRepository = {
  claim(input: ClaimInput): Promise<PrivateAssetRecord>;
  authorize(input: BudgetInput): Promise<BudgetResult>;
  complete(
    ownerUserId: string,
    requestKey: string,
    leaseToken: string,
    sha256: string,
    byteLength: number,
  ): Promise<PrivateAssetRecord>;
  fail(
    ownerUserId: string,
    requestKey: string,
    leaseToken: string,
    failureCode: FailureCode,
  ): Promise<void>;
  listOwnerObjectKeys(ownerUserId: string): Promise<string[]>;
  deleteOwnerMetadata(ownerUserId: string): Promise<void>;
};

export type PrivatePronunciationStorage = {
  putImmutable(objectKey: string, bytes: Uint8Array): Promise<Uint8Array>;
  createSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
  remove(objectKeys: string[]): Promise<void>;
};

export type PrivatePronunciationDependencies = {
  userId?: string;
  limits: BudgetLimits;
  repository: PrivatePronunciationRepository;
  storage: PrivatePronunciationStorage;
  synthesize(input: {
    text: string;
    locale: PrivatePronunciationLocale;
    voiceId: string;
  }): Promise<SynthesisResult>;
};

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      ...headers,
    },
  });
}

function errorResponse(code: string, status: number): Response {
  return json({ error: { code } }, status);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocale(value: unknown): value is PrivatePronunciationLocale {
  return typeof value === 'string' && Object.hasOwn(PRIVATE_VOICES, value);
}

async function parsePostRequest(request: Request): Promise<{
  text: string;
  locale: PrivatePronunciationLocale;
} | Response> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return errorResponse('invalid_request', 400);
  }
  const contentLengthHeader = request.headers.get('content-length');
  const declaredLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (declaredLength !== null
    && (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_PRIVATE_REQUEST_BYTES)) {
    return errorResponse('invalid_request', 400);
  }

  let raw: string;
  let body: unknown;
  try {
    raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PRIVATE_REQUEST_BYTES) {
      return errorResponse('invalid_request', 400);
    }
    body = JSON.parse(raw);
  } catch {
    return errorResponse('invalid_request', 400);
  }

  if (!isPlainObject(body) || Object.keys(body).sort().join(',') !== 'locale,text') {
    return errorResponse('invalid_request', 400);
  }
  const { text, locale } = body;
  if (typeof text !== 'string'
    || text.length < 1
    || text.length > 200
    || text !== text.trim()
    || /[\u0000-\u001f\u007f]/.test(text)) {
    return errorResponse('invalid_request', 400);
  }
  if (!isLocale(locale)) return errorResponse('not_found', 404);
  return { text, locale };
}

export async function createPrivateRequestKey(
  ownerUserId: string,
  text: string,
  locale: PrivatePronunciationLocale,
  voiceId = PRIVATE_VOICES[locale],
): Promise<string> {
  return sha256Hex(JSON.stringify({
    ownerUserId,
    synthesisVersion: PRIVATE_SYNTHESIS_VERSION,
    text,
    locale,
    provider: PROVIDER,
    voiceId,
    modelTier: MODEL_TIER,
    outputFormat: OUTPUT_FORMAT,
  }));
}

function expectedObjectKey(ownerUserId: string, requestKey: string) {
  return `${ownerUserId}/${PRIVATE_SYNTHESIS_VERSION}/${requestKey}.mp3`;
}

function validateAssetIdentity(
  asset: PrivateAssetRecord,
  ownerUserId: string,
  requestKey: string,
  locale: PrivatePronunciationLocale,
) {
  if (asset.ownerUserId !== ownerUserId
    || asset.requestKey !== requestKey
    || asset.contentHash !== requestKey
    || asset.objectKey !== expectedObjectKey(ownerUserId, requestKey)
    || asset.locale !== locale
    || asset.synthesisVersion !== PRIVATE_SYNTHESIS_VERSION) {
    throw new SafePronunciationError('internal', 500);
  }
}

async function readyResponse(
  asset: PrivateAssetRecord,
  storage: PrivatePronunciationStorage,
): Promise<Response> {
  if (!asset.sha256 || !asset.byteLength || asset.status !== 'ready') {
    throw new SafePronunciationError('internal', 500);
  }
  const signedUrl = await storage.createSignedUrl(asset.objectKey, PRIVATE_SIGNED_URL_SECONDS);
  return json({
    status: 'ready',
    asset: {
      id: asset.id,
      requestKey: asset.requestKey,
      contentHash: asset.contentHash,
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      contentType: CONTENT_TYPE,
      locale: asset.locale,
      synthesisVersion: asset.synthesisVersion,
      signedUrl,
      expiresInSeconds: PRIVATE_SIGNED_URL_SECONDS,
    },
  }, 200);
}

async function bestEffortFail(
  repository: PrivatePronunciationRepository,
  ownerUserId: string,
  requestKey: string,
  leaseToken: string,
  code: FailureCode,
) {
  try {
    await repository.fail(ownerUserId, requestKey, leaseToken, code);
  } catch {
    // A lost/expired lease is safe: another caller owns recovery.
  }
}

async function deleteOwnerPronunciation(
  ownerUserId: string,
  dependencies: PrivatePronunciationDependencies,
) {
  try {
    const objectKeys = await dependencies.repository.listOwnerObjectKeys(ownerUserId);
    const prefix = `${ownerUserId}/${PRIVATE_SYNTHESIS_VERSION}/`;
    if (objectKeys.some((objectKey) => !objectKey.startsWith(prefix))) {
      throw new SafePronunciationError('internal', 500);
    }
    await dependencies.storage.remove(objectKeys);
    await dependencies.repository.deleteOwnerMetadata(ownerUserId);
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return errorResponse('unavailable', 503);
  }
}

export async function handlePrivatePronunciationRequest(
  request: Request,
  dependencies: PrivatePronunciationDependencies,
): Promise<Response> {
  if (!dependencies.userId) return errorResponse('unauthorized', 401);
  if (request.method === 'DELETE') {
    return deleteOwnerPronunciation(dependencies.userId, dependencies);
  }
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const parsed = await parsePostRequest(request);
  if (parsed instanceof Response) return parsed;

  const ownerUserId = dependencies.userId;
  let activeLease: { requestKey: string; leaseToken: string } | null = null;
  try {
    const voiceId = PRIVATE_VOICES[parsed.locale];
    const requestKey = await createPrivateRequestKey(
      ownerUserId,
      parsed.text,
      parsed.locale,
      voiceId,
    );
    const asset = await dependencies.repository.claim({
      ownerUserId,
      locale: parsed.locale,
      voiceId,
      requestKey,
    });
    validateAssetIdentity(asset, ownerUserId, requestKey, parsed.locale);

    const requestKind = asset.status === 'ready'
      ? 'cache_hit'
      : asset.claimed ? 'generation' : 'pending';
    const budget = await dependencies.repository.authorize({
      userId: ownerUserId,
      locale: parsed.locale,
      requestKey,
      requestKind,
      billedCharacters: requestKind === 'generation' ? parsed.text.length : 0,
      limits: dependencies.limits,
    });
    if (!budget.allowed) {
      if (asset.claimed && asset.leaseToken) {
        await bestEffortFail(
          dependencies.repository,
          ownerUserId,
          requestKey,
          asset.leaseToken,
          'budget_limited',
        );
      }
      return errorResponse('budget_limited', 429);
    }

    if (asset.status === 'ready') return readyResponse(asset, dependencies.storage);
    if (!asset.claimed) {
      return json({ status: 'pending', retryAfterSeconds: 2 }, 202, { 'Retry-After': '2' });
    }
    if (!asset.leaseToken) throw new SafePronunciationError('internal', 500);
    activeLease = { requestKey, leaseToken: asset.leaseToken };

    const synthesized = await dependencies.synthesize({
      text: parsed.text,
      locale: parsed.locale,
      voiceId,
    });
    const validated = await validateMp3(synthesized);
    if (validated.bytes.byteLength > MAX_AUDIO_BYTES) {
      throw new SafePronunciationError('invalid_audio', 502);
    }
    const storedBytes = await dependencies.storage.putImmutable(asset.objectKey, validated.bytes);
    const stored = await validateMp3({ bytes: storedBytes, contentType: CONTENT_TYPE });
    if (stored.sha256 !== validated.sha256) {
      throw new SafePronunciationError('storage_failed', 502);
    }
    const completed = await dependencies.repository.complete(
      ownerUserId,
      requestKey,
      asset.leaseToken,
      stored.sha256,
      stored.bytes.byteLength,
    );
    activeLease = null;
    validateAssetIdentity(completed, ownerUserId, requestKey, parsed.locale);
    return readyResponse(completed, dependencies.storage);
  } catch (error) {
    const safe = error instanceof SafePronunciationError
      ? error
      : new SafePronunciationError('internal', 500);
    if (activeLease) {
      await bestEffortFail(
        dependencies.repository,
        ownerUserId,
        activeLease.requestKey,
        activeLease.leaseToken,
        safe.code,
      );
    }
    return errorResponse(safe.code, safe.status);
  }
}
