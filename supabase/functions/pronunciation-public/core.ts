export const CONTENT_TYPE = 'audio/mpeg';
export const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
export const MODEL_TIER = 'Standard Neural S0';
export const PROVIDER = 'azure';
export const SYNTHESIS_VERSION = 'azure-public-preview-v1';
export const MAX_AUDIO_BYTES = 1_048_576;
export const MAX_REQUEST_BYTES = 1_024;

export const VOICES = {
  'en-US': 'en-US-AvaNeural',
  'en-GB': 'en-GB-RyanNeural',
} as const;

export type PronunciationLocale = keyof typeof VOICES;
export type FailureCode =
  | 'budget_limited'
  | 'provider_auth'
  | 'provider_rejected'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'invalid_audio'
  | 'storage_failed'
  | 'internal';

export type CatalogInput = {
  catalogSenseId: string;
  text: string;
};

export type AssetRecord = {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  claimed: boolean;
  leaseToken: string | null;
  requestKey: string;
  contentHash: string;
  sha256: string | null;
  byteLength: number | null;
  objectKey: string;
  locale: PronunciationLocale;
  synthesisVersion: string;
};

export type BudgetResult = {
  allowed: boolean;
  reason: 'rate_limited' | 'user_budget_limited' | 'global_budget_limited' | null;
};

export type BudgetLimits = {
  userHourlyRequests: number;
  userDailyCharacters: number;
  globalDailyCharacters: number;
};

type ClaimInput = {
  catalogSenseId: string;
  locale: PronunciationLocale;
  voiceId: string;
  requestKey: string;
};

type BudgetInput = {
  userId: string;
  catalogSenseId: string;
  locale: PronunciationLocale;
  requestKey: string;
  requestKind: 'cache_hit' | 'pending' | 'generation';
  billedCharacters: number;
  limits: BudgetLimits;
};

export type PronunciationRepository = {
  getCatalogInput(catalogSenseId: string): Promise<CatalogInput | null>;
  claim(input: ClaimInput): Promise<AssetRecord>;
  authorize(input: BudgetInput): Promise<BudgetResult>;
  complete(requestKey: string, leaseToken: string, sha256: string, byteLength: number): Promise<AssetRecord>;
  fail(requestKey: string, leaseToken: string, failureCode: FailureCode): Promise<void>;
};

export type PronunciationStorage = {
  putImmutable(objectKey: string, bytes: Uint8Array): Promise<Uint8Array>;
  getPublicUrl(objectKey: string): string;
};

export type SynthesisResult = {
  bytes: Uint8Array;
  contentType: string;
};

export type PronunciationDependencies = {
  userId?: string;
  limits: BudgetLimits;
  repository: PronunciationRepository;
  storage: PronunciationStorage;
  synthesize(input: {
    text: string;
    locale: PronunciationLocale;
    voiceId: string;
  }): Promise<SynthesisResult>;
};

export class SafePronunciationError extends Error {
  constructor(
    public readonly code: FailureCode,
    public readonly status: number,
  ) {
    super(code);
  }
}

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

async function parseRequest(request: Request): Promise<{
  catalogSenseId: string;
  locale: PronunciationLocale;
} | Response> {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 405);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return errorResponse('invalid_request', 400);
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return errorResponse('invalid_request', 400);
  }

  let raw: string;
  let body: unknown;
  try {
    raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return errorResponse('invalid_request', 400);
    }
    body = JSON.parse(raw);
  } catch {
    return errorResponse('invalid_request', 400);
  }

  if (!isPlainObject(body) || Object.keys(body).sort().join(',') !== 'catalogSenseId,locale') {
    return errorResponse('invalid_request', 400);
  }
  const { catalogSenseId, locale } = body;
  if (typeof catalogSenseId !== 'string'
    || catalogSenseId.length < 1
    || catalogSenseId.length > 256
    || catalogSenseId !== catalogSenseId.trim()
    || /[\u0000-\u001f\u007f]/.test(catalogSenseId)
    || typeof locale !== 'string') {
    return errorResponse('invalid_request', 400);
  }
  if (!Object.hasOwn(VOICES, locale)) {
    return errorResponse('not_found', 404);
  }
  return { catalogSenseId, locale: locale as PronunciationLocale };
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', input.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createRequestKey(
  text: string,
  locale: PronunciationLocale,
  voiceId = VOICES[locale],
): Promise<string> {
  return sha256Hex(JSON.stringify({
    synthesisVersion: SYNTHESIS_VERSION,
    text,
    locale,
    provider: PROVIDER,
    voiceId,
    modelTier: MODEL_TIER,
    outputFormat: OUTPUT_FORMAT,
  }));
}

export async function validateMp3(result: SynthesisResult): Promise<{
  bytes: Uint8Array;
  sha256: string;
}> {
  const contentType = result.contentType.split(';', 1)[0].trim().toLowerCase();
  const { bytes } = result;
  const hasId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const hasFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (contentType !== CONTENT_TYPE
    || bytes.byteLength < 101
    || bytes.byteLength > MAX_AUDIO_BYTES
    || (!hasId3 && !hasFrameSync)) {
    throw new SafePronunciationError('invalid_audio', 502);
  }
  return { bytes, sha256: await sha256Hex(bytes) };
}

function readyResponse(asset: AssetRecord, storage: PronunciationStorage): Response {
  if (!asset.sha256 || !asset.byteLength || asset.status !== 'ready') {
    throw new SafePronunciationError('internal', 500);
  }
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
      publicUrl: storage.getPublicUrl(asset.objectKey),
    },
  }, 200);
}

async function bestEffortFail(
  repository: PronunciationRepository,
  requestKey: string,
  leaseToken: string,
  code: FailureCode,
): Promise<void> {
  try {
    await repository.fail(requestKey, leaseToken, code);
  } catch {
    // A lost/expired lease is safe: another caller owns recovery.
  }
}

export async function handlePronunciationRequest(
  request: Request,
  dependencies: PronunciationDependencies,
): Promise<Response> {
  if (!dependencies.userId) return errorResponse('unauthorized', 401);
  const parsed = await parseRequest(request);
  if (parsed instanceof Response) return parsed;

  let activeLease: { requestKey: string; leaseToken: string } | null = null;
  try {
    const canonical = await dependencies.repository.getCatalogInput(parsed.catalogSenseId);
    if (!canonical || canonical.catalogSenseId !== parsed.catalogSenseId) {
      return errorResponse('not_found', 404);
    }
    if (canonical.text.length < 1 || canonical.text.length > 200 || canonical.text !== canonical.text.trim()) {
      throw new SafePronunciationError('internal', 500);
    }

    const voiceId = VOICES[parsed.locale];
    const requestKey = await createRequestKey(canonical.text, parsed.locale, voiceId);
    const asset = await dependencies.repository.claim({
      catalogSenseId: canonical.catalogSenseId,
      locale: parsed.locale,
      voiceId,
      requestKey,
    });
    if (asset.requestKey !== requestKey
      || asset.contentHash !== requestKey
      || asset.locale !== parsed.locale
      || asset.synthesisVersion !== SYNTHESIS_VERSION) {
      throw new SafePronunciationError('internal', 500);
    }

    const requestKind = asset.status === 'ready'
      ? 'cache_hit'
      : asset.claimed ? 'generation' : 'pending';
    const budget = await dependencies.repository.authorize({
      userId: dependencies.userId,
      catalogSenseId: canonical.catalogSenseId,
      locale: parsed.locale,
      requestKey,
      requestKind,
      billedCharacters: requestKind === 'generation' ? canonical.text.length : 0,
      limits: dependencies.limits,
    });
    if (!budget.allowed) {
      if (asset.claimed && asset.leaseToken) {
        await bestEffortFail(dependencies.repository, requestKey, asset.leaseToken, 'budget_limited');
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
      text: canonical.text,
      locale: parsed.locale,
      voiceId,
    });
    const validated = await validateMp3(synthesized);
    const storedBytes = await dependencies.storage.putImmutable(asset.objectKey, validated.bytes);
    const stored = await validateMp3({ bytes: storedBytes, contentType: CONTENT_TYPE });
    if (stored.sha256 !== validated.sha256) {
      throw new SafePronunciationError('storage_failed', 502);
    }
    const completed = await dependencies.repository.complete(
      requestKey,
      asset.leaseToken,
      stored.sha256,
      stored.bytes.byteLength,
    );
    activeLease = null;
    return readyResponse(completed, dependencies.storage);
  } catch (error) {
    const safe = error instanceof SafePronunciationError
      ? error
      : new SafePronunciationError('internal', 500);
    if (activeLease) {
      await bestEffortFail(dependencies.repository, activeLease.requestKey, activeLease.leaseToken, safe.code);
    }
    return errorResponse(safe.code, safe.status);
  }
}
