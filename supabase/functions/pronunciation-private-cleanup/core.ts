export const PRIVATE_CLEANUP_BATCH_LIMIT = 100;
export const PRIVATE_CLEANUP_LEASE_SECONDS = 600;
export const PRIVATE_CLEANUP_STORAGE_CONCURRENCY = 8;

export type PrivateCleanupAsset = {
  id: string;
  ownerUserId: string;
  requestKey: string;
  objectKey: string;
  synthesisVersion: string;
};

export type PrivateCleanupClaim = {
  cleanupToken: string;
  assets: PrivateCleanupAsset[];
};

export type PrivateCleanupRepository = {
  claimExpired(limit: number, leaseSeconds: number): Promise<PrivateCleanupClaim>;
  finalize(assetIds: string[], cleanupToken: string): Promise<number>;
  release(assetIds: string[], cleanupToken: string): Promise<number>;
  pruneRequests(limit: number): Promise<number>;
};

export type PrivateCleanupStorage = {
  remove(objectKey: string): Promise<void>;
};

export type PrivateCleanupDependencies = {
  batchLimit?: number;
  repository: PrivateCleanupRepository;
  storage: PrivateCleanupStorage;
};

function response(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function validCleanupAsset(asset: PrivateCleanupAsset): boolean {
  return asset.id.length > 0
    && asset.ownerUserId.length > 0
    && /^[a-f0-9]{64}$/.test(asset.requestKey)
    && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(asset.synthesisVersion)
    && asset.objectKey
      === `${asset.ownerUserId}/${asset.synthesisVersion}/${asset.requestKey}.mp3`;
}

async function removeAssets(
  assets: PrivateCleanupAsset[],
  storage: PrivateCleanupStorage,
): Promise<{ deletedIds: string[]; failedIds: string[] }> {
  const deletedIds: string[] = [];
  const failedIds: string[] = [];
  const seenIds = new Set<string>();
  const seenObjectKeys = new Set<string>();
  let cursor = 0;

  async function worker() {
    while (cursor < assets.length) {
      const asset = assets[cursor];
      cursor += 1;
      if (!validCleanupAsset(asset)
        || seenIds.has(asset.id)
        || seenObjectKeys.has(asset.objectKey)) {
        failedIds.push(asset.id);
        continue;
      }
      seenIds.add(asset.id);
      seenObjectKeys.add(asset.objectKey);
      try {
        await storage.remove(asset.objectKey);
        deletedIds.push(asset.id);
      } catch {
        failedIds.push(asset.id);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PRIVATE_CLEANUP_STORAGE_CONCURRENCY, assets.length) },
      () => worker(),
    ),
  );
  return { deletedIds, failedIds };
}

export async function handlePrivatePronunciationCleanup(
  request: Request,
  dependencies: PrivateCleanupDependencies,
): Promise<Response> {
  if (request.method !== 'POST') {
    return response({ error: { code: 'method_not_allowed' } }, 405);
  }

  const batchLimit = dependencies.batchLimit ?? PRIVATE_CLEANUP_BATCH_LIMIT;
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > PRIVATE_CLEANUP_BATCH_LIMIT) {
    return response({ error: { code: 'configuration_error' } }, 503);
  }

  try {
    const claim = await dependencies.repository.claimExpired(
      batchLimit,
      PRIVATE_CLEANUP_LEASE_SECONDS,
    );
    if (!claim.cleanupToken || !Array.isArray(claim.assets) || claim.assets.length > batchLimit) {
      throw new Error('Invalid private pronunciation cleanup claim');
    }

    const { deletedIds, failedIds } = await removeAssets(claim.assets, dependencies.storage);
    if (deletedIds.length > 0) {
      const finalized = await dependencies.repository.finalize(
        deletedIds,
        claim.cleanupToken,
      );
      if (finalized !== deletedIds.length) {
        throw new Error('Incomplete private pronunciation cleanup finalization');
      }
    }
    if (failedIds.length > 0) {
      const released = await dependencies.repository.release(failedIds, claim.cleanupToken);
      if (released !== failedIds.length) {
        throw new Error('Incomplete private pronunciation cleanup release');
      }
    }
    const auditRowsPruned = await dependencies.repository.pruneRequests(1000);
    const result = {
      claimed: claim.assets.length,
      deleted: deletedIds.length,
      failed: failedIds.length,
      auditRowsPruned,
      hasMore: claim.assets.length === batchLimit,
    };
    return response(result, failedIds.length > 0 ? 503 : 200);
  } catch {
    return response({ error: { code: 'cleanup_unavailable' } }, 503);
  }
}
