import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createGuestImportPlan,
  loadGuestImportSnapshot,
  saveGuestImportConflict,
} from './guest-import-repository';
import type { GuestImportMapping, GuestImportRecord } from './guest-import-types';

function database() {
  const value = {
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
  } as unknown as SQLiteDatabase;
  value.withExclusiveTransactionAsync = jest.fn(async (callback) => callback(value));
  return value;
}

const record: GuestImportRecord = {
  accountId: 'user-1', state: 'prepared',
  totals: { collections: 1, words: 1, events: 1 },
  uploaded: { collections: 0, words: 0, events: 0 },
  errorCode: null, errorMessage: null,
  startedAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z', completedAt: null,
};
const mapping: GuestImportMapping = {
  accountId: 'user-1', entityType: 'word', localId: 'word-local', remoteId: 'word-uuid',
  hasConflict: false, conflictResolution: null, sourceUpdatedAt: null, createdAt: '2026-07-20T00:00:00.000Z',
};

describe('guest import repository', () => {
  it('reads the guest snapshot in deterministic order', async () => {
    const db = database();

    await loadGuestImportSnapshot(db);

    expect(db.getAllAsync).toHaveBeenNthCalledWith(1, 'SELECT * FROM collections ORDER BY created_at, id');
    expect(db.getAllAsync).toHaveBeenNthCalledWith(2, 'SELECT * FROM words ORDER BY created_at, id');
    expect(db.getAllAsync).toHaveBeenNthCalledWith(3, 'SELECT * FROM learning_events ORDER BY id');
  });

  it('persists the checkpoint before its stable mappings in one transaction', async () => {
    const db = database();

    await createGuestImportPlan(db, record, [mapping]);

    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO sync_imports'),
      'user-1', 'prepared', 1, 0, 1, 0, 1, 0, null, null,
      record.startedAt, record.updatedAt, null,
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO sync_id_mappings'),
      'user-1', 'word', 'word-local', 'word-uuid', 0, null, null, mapping.createdAt,
    );
  });

  it('stores an explicit conflict resolution for the account and local word', async () => {
    const db = database();

    await saveGuestImportConflict(db, 'user-1', 'word-local', 'use_device');

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('conflict_resolution = ?'),
      'use_device', 'user-1', 'word-local',
    );
  });
});
