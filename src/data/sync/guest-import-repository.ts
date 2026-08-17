import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  GuestImportConflictResolution,
  GuestImportEntityType,
  GuestImportMapping,
  GuestImportPersistentState,
  GuestImportRecord,
} from './guest-import-types';

export interface GuestCollectionRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface GuestWordRow {
  id: string;
  collection_id: string;
  term: string;
  normalized_term: string;
  source_language_code: string;
  target_language_code: string;
  source_pronunciation_locale: string;
  target_pronunciation_locale: string;
  part_of_speech: string | null;
  definition: string;
  example: string | null;
  translation: string | null;
  catalog_sense_id: string | null;
  cefr_level: string | null;
  source: string;
  state: string;
  understood_streak: number;
  lapse_count: number;
  view_count: number;
  last_viewed_at: string | null;
  last_rated_at: string | null;
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuestLearningEventRow {
  id: number;
  word_id: string | null;
  type: string;
  value: string | null;
  occurred_at: string;
}

export interface GuestImportSnapshot {
  collections: GuestCollectionRow[];
  words: GuestWordRow[];
  events: GuestLearningEventRow[];
}

interface ImportRecordRow {
  account_id: string;
  state: GuestImportPersistentState;
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
  completed_at: string | null;
}

interface MappingRow {
  account_id: string;
  entity_type: GuestImportEntityType;
  local_id: string;
  remote_id: string;
  has_conflict: number;
  conflict_resolution: GuestImportConflictResolution | null;
  source_updated_at: string | null;
  created_at: string;
}

function toImportRecord(row: ImportRecordRow): GuestImportRecord {
  return {
    accountId: row.account_id,
    state: row.state,
    totals: { collections: row.collections_total, words: row.words_total, events: row.events_total },
    uploaded: { collections: row.collections_uploaded, words: row.words_uploaded, events: row.events_uploaded },
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function toMapping(row: MappingRow): GuestImportMapping {
  return {
    accountId: row.account_id,
    entityType: row.entity_type,
    localId: row.local_id,
    remoteId: row.remote_id,
    hasConflict: Boolean(row.has_conflict),
    conflictResolution: row.conflict_resolution,
    sourceUpdatedAt: row.source_updated_at,
    createdAt: row.created_at,
  };
}

export async function loadGuestImportSnapshot(database: SQLiteDatabase): Promise<GuestImportSnapshot> {
  const [collections, words, events] = await Promise.all([
    database.getAllAsync<GuestCollectionRow>('SELECT * FROM collections ORDER BY created_at, id'),
    database.getAllAsync<GuestWordRow>('SELECT * FROM words ORDER BY created_at, id'),
    database.getAllAsync<GuestLearningEventRow>('SELECT * FROM learning_events ORDER BY id'),
  ]);
  return { collections, words, events };
}

export async function getGuestImportRecord(database: SQLiteDatabase, accountId: string) {
  const row = await database.getFirstAsync<ImportRecordRow>(
    'SELECT * FROM sync_imports WHERE account_id = ?', accountId,
  );
  return row ? toImportRecord(row) : null;
}

export async function listGuestImportMappings(database: SQLiteDatabase, accountId: string) {
  const rows = await database.getAllAsync<MappingRow>(
    'SELECT * FROM sync_id_mappings WHERE account_id = ? ORDER BY entity_type, local_id', accountId,
  );
  return rows.map(toMapping);
}

export async function createGuestImportPlan(
  database: SQLiteDatabase,
  record: GuestImportRecord,
  mappings: GuestImportMapping[],
) {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await transaction.getFirstAsync<{ account_id: string }>(
      'SELECT account_id FROM sync_imports WHERE account_id = ?', record.accountId,
    );
    if (existing) return;
    await transaction.runAsync(
      `INSERT INTO sync_imports
        (account_id, state, collections_total, collections_uploaded, words_total, words_uploaded,
         events_total, events_uploaded, error_code, error_message, started_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.accountId, record.state, record.totals.collections, record.uploaded.collections,
      record.totals.words, record.uploaded.words, record.totals.events, record.uploaded.events,
      record.errorCode, record.errorMessage, record.startedAt, record.updatedAt, record.completedAt,
    );
    for (const mapping of mappings) {
      await transaction.runAsync(
        `INSERT INTO sync_id_mappings
          (account_id, entity_type, local_id, remote_id, has_conflict, conflict_resolution, source_updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        mapping.accountId, mapping.entityType, mapping.localId, mapping.remoteId,
        mapping.hasConflict ? 1 : 0, mapping.conflictResolution, mapping.sourceUpdatedAt, mapping.createdAt,
      );
    }
  });
}

export async function saveGuestImportRecord(database: SQLiteDatabase, record: GuestImportRecord) {
  await database.runAsync(
    `UPDATE sync_imports SET
       state = ?, collections_total = ?, collections_uploaded = ?, words_total = ?, words_uploaded = ?,
       events_total = ?, events_uploaded = ?, error_code = ?, error_message = ?, started_at = ?,
       updated_at = ?, completed_at = ?
     WHERE account_id = ?`,
    record.state, record.totals.collections, record.uploaded.collections,
    record.totals.words, record.uploaded.words, record.totals.events, record.uploaded.events,
    record.errorCode, record.errorMessage, record.startedAt, record.updatedAt, record.completedAt,
    record.accountId,
  );
}

export async function saveGuestImportConflict(
  database: SQLiteDatabase,
  accountId: string,
  localWordId: string,
  resolution: GuestImportConflictResolution,
) {
  await database.runAsync(
    `UPDATE sync_id_mappings SET conflict_resolution = ?
     WHERE account_id = ? AND entity_type = 'word' AND local_id = ?`,
    resolution, accountId, localWordId,
  );
}

export async function reassignGuestImportWordMapping(
  database: SQLiteDatabase,
  accountId: string,
  localWordId: string,
  remoteId: string,
  hasConflict: boolean,
) {
  await database.runAsync(
    `UPDATE sync_id_mappings
     SET remote_id = ?, has_conflict = ?, conflict_resolution = NULL
     WHERE account_id = ? AND entity_type = 'word' AND local_id = ?`,
    remoteId, hasConflict ? 1 : 0, accountId, localWordId,
  );
}

export async function markGuestImportMappingsAccepted(
  database: SQLiteDatabase,
  accountId: string,
  entityType: GuestImportEntityType,
  accepted: { localId: string; sourceUpdatedAt: string }[],
) {
  if (accepted.length === 0) return;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const item of accepted) {
      await transaction.runAsync(
        `UPDATE sync_id_mappings SET source_updated_at = ?
         WHERE account_id = ? AND entity_type = ? AND local_id = ?`,
        item.sourceUpdatedAt, accountId, entityType, item.localId,
      );
    }
  });
}
