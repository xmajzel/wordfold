export const MISSING_COLLECTION_MAPPING_MESSAGE =
  'A queued word needs a collection mapping from this account’s completed device import. The change remains on this device for recovery.';

export function isSyncCollectionId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function requireSyncCollectionId(value: unknown): asserts value is string {
  if (!isSyncCollectionId(value)) {
    throw new Error('Choose a synchronized collection before saving this word.');
  }
}
