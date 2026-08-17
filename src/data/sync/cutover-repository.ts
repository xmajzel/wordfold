import type { SQLiteDatabase } from 'expo-sqlite';

import type { SyncCutoverPersistentState, SyncCutoverRecord } from './cutover-types';
import type { GuestImportMapping } from './guest-import-types';

interface SyncCutoverRow {
  account_id: string;
  state: SyncCutoverPersistentState;
  collections_total: number;
  collections_uploaded: number;
  words_total: number;
  words_uploaded: number;
  events_total: number;
  events_uploaded: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  updated_at: string;
  ready_at: string | null;
}

function toRecord(row: SyncCutoverRow): SyncCutoverRecord {
  return {
    accountId: row.account_id,
    state: row.state,
    totals: { collections: row.collections_total, words: row.words_total, events: row.events_total },
    uploaded: { collections: row.collections_uploaded, words: row.words_uploaded, events: row.events_uploaded },
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    readyAt: row.ready_at,
  };
}

export async function getSyncCutoverRecord(database: SQLiteDatabase, accountId: string) {
  const row = await database.getFirstAsync<SyncCutoverRow>(
    'SELECT * FROM sync_cutovers WHERE account_id = ?', accountId,
  );
  return row ? toRecord(row) : null;
}

export async function saveSyncCutoverRecord(database: SQLiteDatabase, record: SyncCutoverRecord) {
  await database.runAsync(
    `INSERT INTO sync_cutovers
      (account_id, state, collections_total, collections_uploaded, words_total, words_uploaded,
       events_total, events_uploaded, error_code, error_message, started_at, updated_at, ready_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       state = excluded.state,
       collections_total = excluded.collections_total,
       collections_uploaded = excluded.collections_uploaded,
       words_total = excluded.words_total,
       words_uploaded = excluded.words_uploaded,
       events_total = excluded.events_total,
       events_uploaded = excluded.events_uploaded,
       error_code = excluded.error_code,
       error_message = excluded.error_message,
       started_at = excluded.started_at,
       updated_at = excluded.updated_at,
       ready_at = excluded.ready_at`,
    record.accountId, record.state,
    record.totals.collections, record.uploaded.collections,
    record.totals.words, record.uploaded.words,
    record.totals.events, record.uploaded.events,
    record.errorCode, record.errorMessage, record.startedAt, record.updatedAt, record.readyAt,
  );
}

export async function appendSyncIdMappings(database: SQLiteDatabase, mappings: GuestImportMapping[]) {
  if (mappings.length === 0) return;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const mapping of mappings) {
      await transaction.runAsync(
        `INSERT OR IGNORE INTO sync_id_mappings
          (account_id, entity_type, local_id, remote_id, has_conflict, conflict_resolution, source_updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        mapping.accountId, mapping.entityType, mapping.localId, mapping.remoteId,
        mapping.hasConflict ? 1 : 0, mapping.conflictResolution, mapping.sourceUpdatedAt, mapping.createdAt,
      );
    }
  });
}

export async function acknowledgeCutoverRename(
  database: SQLiteDatabase,
  accountId: string,
  localWordId: string,
  sourceUpdatedAt: string,
) {
  await database.runAsync(
    `UPDATE sync_id_mappings
     SET source_updated_at = ?, has_conflict = 0, conflict_resolution = NULL
     WHERE account_id = ? AND entity_type = 'word' AND local_id = ?`,
    sourceUpdatedAt, accountId, localWordId,
  );
}
