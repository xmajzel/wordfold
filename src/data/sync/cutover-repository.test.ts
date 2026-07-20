import type { SQLiteDatabase } from 'expo-sqlite';

import {
  acknowledgeCutoverRename,
  appendSyncIdMappings,
  getSyncCutoverRecord,
  saveSyncCutoverRecord,
} from './cutover-repository';
import type { SyncCutoverRecord } from './cutover-types';

function database() {
  const value = {
    getFirstAsync: jest.fn(async () => null),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
  } as unknown as SQLiteDatabase;
  value.withExclusiveTransactionAsync = jest.fn(async (callback) => callback(value));
  return value;
}

const record: SyncCutoverRecord = {
  accountId: 'user-1', state: 'checking',
  totals: { collections: 1, words: 2, events: 3 },
  uploaded: { collections: 0, words: 0, events: 0 },
  errorCode: null, errorMessage: null,
  startedAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', readyAt: null,
};

describe('cutover repository', () => {
  it('persists resumable cutover counts per account', async () => {
    const db = database();

    await saveSyncCutoverRecord(db, record);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sync_cutovers'),
      'user-1', 'checking', 1, 0, 2, 0, 3, 0, null, null,
      record.startedAt, record.updatedAt, null,
    );
  });

  it('maps a stored row back to the cutover contract', async () => {
    const db = database();
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce({
      account_id: 'user-1', state: 'ready',
      collections_total: 1, collections_uploaded: 1,
      words_total: 2, words_uploaded: 2,
      events_total: 3, events_uploaded: 3,
      error_code: null, error_message: null,
      started_at: record.startedAt, updated_at: record.updatedAt, ready_at: record.updatedAt,
    });

    await expect(getSyncCutoverRecord(db, 'user-1')).resolves.toEqual(expect.objectContaining({
      accountId: 'user-1', state: 'ready', totals: { collections: 1, words: 2, events: 3 },
    }));
  });

  it('appends stable mappings without replacing an existing UUID', async () => {
    const db = database();

    await appendSyncIdMappings(db, [{
      accountId: 'user-1', entityType: 'word', localId: 'local-word', remoteId: 'remote-word',
      hasConflict: false, conflictResolution: null, sourceUpdatedAt: null, createdAt: record.updatedAt,
    }]);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO sync_id_mappings'),
      'user-1', 'word', 'local-word', 'remote-word', 0, null, null, record.updatedAt,
    );
  });

  it('acknowledges a rejected rename without permanently excluding future edits', async () => {
    const db = database();

    await acknowledgeCutoverRename(db, 'user-1', 'local-word', '2026-07-20T11:00:00.000Z');

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('conflict_resolution = NULL'),
      '2026-07-20T11:00:00.000Z', 'user-1', 'local-word',
    );
  });
});
