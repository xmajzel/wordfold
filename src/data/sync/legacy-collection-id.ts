import { openDatabaseAsync } from 'expo-sqlite';

import { isSyncCollectionId } from './collection-id';

export async function resolveImportedCollectionId(accountId: string, localId: string): Promise<string | null> {
  const database = await openDatabaseAsync('wordfold.sqlite');
  try {
    const mapping = await database.getFirstAsync<{ remote_id: string }>(
      `SELECT mapping.remote_id FROM sync_id_mappings AS mapping
       JOIN sync_imports AS imported ON imported.account_id = mapping.account_id
       WHERE mapping.account_id = ? AND mapping.entity_type = 'collection'
         AND mapping.local_id = ? AND mapping.source_updated_at IS NOT NULL
         AND imported.state = 'completed'`,
      accountId, localId,
    );
    return isSyncCollectionId(mapping?.remote_id) ? mapping.remote_id : null;
  } finally {
    await database.closeAsync();
  }
}
