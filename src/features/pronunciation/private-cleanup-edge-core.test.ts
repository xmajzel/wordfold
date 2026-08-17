import {
  PRIVATE_CLEANUP_BATCH_LIMIT,
  PRIVATE_CLEANUP_LEASE_SECONDS,
  handlePrivatePronunciationCleanup,
  type PrivateCleanupAsset,
  type PrivateCleanupDependencies,
  type PrivateCleanupRepository,
  type PrivateCleanupStorage,
} from '../../../supabase/functions/pronunciation-private-cleanup/core';
import {
  PRIVATE_SYNTHESIS_VERSION,
} from '../../../supabase/functions/pronunciation-private/core';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const CLEANUP_TOKEN = '00000000-0000-4000-8000-0000000000c1';

function asset(index: number, overrides: Partial<PrivateCleanupAsset> = {}): PrivateCleanupAsset {
  const requestKey = index.toString(16).padStart(64, '0');
  return {
    id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    ownerUserId: OWNER,
    requestKey,
    objectKey: `${OWNER}/${PRIVATE_SYNTHESIS_VERSION}/${requestKey}.mp3`,
    synthesisVersion: PRIVATE_SYNTHESIS_VERSION,
    ...overrides,
  };
}

function request(method = 'POST') {
  return new Request('https://example.test/functions/v1/pronunciation-private-cleanup', {
    method,
  });
}

function harness(
  assets: PrivateCleanupAsset[] = [],
  overrides: Partial<PrivateCleanupDependencies> = {},
) {
  const repository: PrivateCleanupRepository = {
    claimExpired: jest.fn(async () => ({ cleanupToken: CLEANUP_TOKEN, assets })),
    finalize: jest.fn(async (assetIds) => assetIds.length),
    release: jest.fn(async (assetIds) => assetIds.length),
    pruneRequests: jest.fn(async () => 3),
  };
  const storage: PrivateCleanupStorage = {
    remove: jest.fn(async () => undefined),
  };
  const dependencies: PrivateCleanupDependencies = {
    repository,
    storage,
    ...overrides,
  };
  return { dependencies, repository, storage };
}

describe('private pronunciation cleanup Edge Function core', () => {
  it('accepts POST only and performs no cleanup for other methods', async () => {
    const { dependencies, repository } = harness([asset(1)]);
    const response = await handlePrivatePronunciationCleanup(request('GET'), dependencies);

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: { code: 'method_not_allowed' } });
    expect(repository.claimExpired).not.toHaveBeenCalled();
  });

  it('deletes claimed Storage objects before finalizing their metadata', async () => {
    const assets = [asset(1), asset(2)];
    const { dependencies, repository, storage } = harness(assets);
    const response = await handlePrivatePronunciationCleanup(request(), dependencies);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 2,
      deleted: 2,
      failed: 0,
      auditRowsPruned: 3,
      hasMore: false,
    });
    expect(repository.claimExpired).toHaveBeenCalledWith(
      PRIVATE_CLEANUP_BATCH_LIMIT,
      PRIVATE_CLEANUP_LEASE_SECONDS,
    );
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(repository.finalize).toHaveBeenCalledWith(
      assets.map(({ id }) => id),
      CLEANUP_TOKEN,
    );
    expect(repository.release).not.toHaveBeenCalled();
  });

  it('finalizes successes, releases failures, and reports a retryable failure', async () => {
    const assets = [asset(1), asset(2)];
    const { dependencies, repository, storage } = harness(assets);
    jest.mocked(storage.remove).mockImplementation(async (objectKey) => {
      if (objectKey === assets[1].objectKey) throw new Error('private provider detail');
    });

    const response = await handlePrivatePronunciationCleanup(request(), dependencies);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      claimed: 2,
      deleted: 1,
      failed: 1,
      auditRowsPruned: 3,
      hasMore: false,
    });
    expect(repository.finalize).toHaveBeenCalledWith([assets[0].id], CLEANUP_TOKEN);
    expect(repository.release).toHaveBeenCalledWith([assets[1].id], CLEANUP_TOKEN);
  });

  it('does not remove an unexpected object path and exposes no private identifiers', async () => {
    const unsafe = asset(1, { objectKey: `${OWNER}/another-version/unsafe.mp3` });
    const { dependencies, repository, storage } = harness([unsafe]);
    const response = await handlePrivatePronunciationCleanup(request(), dependencies);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      claimed: 1,
      deleted: 0,
      failed: 1,
      auditRowsPruned: 3,
      hasMore: false,
    });
    expect(JSON.stringify(body)).not.toContain(OWNER);
    expect(JSON.stringify(body)).not.toContain('unsafe');
    expect(storage.remove).not.toHaveBeenCalled();
    expect(repository.release).toHaveBeenCalledWith([unsafe.id], CLEANUP_TOKEN);
  });

  it('handles an empty run and prunes old request audits', async () => {
    const { dependencies, repository, storage } = harness();
    const response = await handlePrivatePronunciationCleanup(request(), dependencies);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 0,
      deleted: 0,
      failed: 0,
      auditRowsPruned: 3,
      hasMore: false,
    });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(repository.finalize).not.toHaveBeenCalled();
    expect(repository.release).not.toHaveBeenCalled();
    expect(repository.pruneRequests).toHaveBeenCalledWith(1000);
  });

  it('fails closed when finalization does not match every deleted object', async () => {
    const claimed = asset(1);
    const { dependencies, repository } = harness([claimed]);
    jest.mocked(repository.finalize).mockResolvedValueOnce(0);

    const response = await handlePrivatePronunciationCleanup(request(), dependencies);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'cleanup_unavailable' } });
    expect(repository.release).not.toHaveBeenCalled();
  });

  it('fails closed when a failed object cleanup lease is not released', async () => {
    const claimed = asset(1);
    const { dependencies, repository, storage } = harness([claimed]);
    jest.mocked(storage.remove).mockRejectedValueOnce(new Error('storage unavailable'));
    jest.mocked(repository.release).mockResolvedValueOnce(0);

    const response = await handlePrivatePronunciationCleanup(request(), dependencies);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'cleanup_unavailable' } });
    expect(repository.finalize).not.toHaveBeenCalled();
  });
});
