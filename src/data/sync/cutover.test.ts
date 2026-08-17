import type { SQLiteDatabase } from 'expo-sqlite';

import type { SyncCutoverRecord } from './cutover-types';
import type { GuestImportRemote } from './guest-import-remote';
import type { GuestImportSnapshot } from './guest-import-repository';
import type { GuestImportMapping, GuestImportRecord } from './guest-import-types';
import { SyncCutoverService } from './cutover';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'new-uuid') }));

let mockCutover: SyncCutoverRecord | null;
let mockImport: GuestImportRecord | null;
let mockSnapshot: GuestImportSnapshot;
let mockMappings: GuestImportMapping[];

const mockSaveCutover = jest.fn(async (_database, record: SyncCutoverRecord) => { mockCutover = record; });
const mockAppendMappings = jest.fn(async (_database, mappings: GuestImportMapping[]) => {
  for (const mapping of mappings) {
    if (!mockMappings.some((item) => item.entityType === mapping.entityType && item.localId === mapping.localId)) {
      mockMappings.push(mapping);
    }
  }
});
const mockMarkAccepted = jest.fn(async (_database, _accountId, entityType, accepted) => {
  for (const item of accepted) {
    mockMappings = mockMappings.map((mapping) => mapping.entityType === entityType && mapping.localId === item.localId
      ? { ...mapping, sourceUpdatedAt: item.sourceUpdatedAt }
      : mapping);
  }
});

jest.mock('./cutover-repository', () => ({
  acknowledgeCutoverRename: jest.fn(async () => undefined),
  appendSyncIdMappings: (database: SQLiteDatabase, mappings: GuestImportMapping[]) => (
    mockAppendMappings(database, mappings)
  ),
  getSyncCutoverRecord: jest.fn(async () => mockCutover),
  saveSyncCutoverRecord: (database: SQLiteDatabase, record: SyncCutoverRecord) => (
    mockSaveCutover(database, record)
  ),
}));

jest.mock('./guest-import-repository', () => ({
  getGuestImportRecord: jest.fn(async () => mockImport),
  listGuestImportMappings: jest.fn(async () => mockMappings),
  loadGuestImportSnapshot: jest.fn(async () => mockSnapshot),
  markGuestImportMappingsAccepted: (
    database: SQLiteDatabase,
    accountId: string,
    entityType: GuestImportMapping['entityType'],
    accepted: { localId: string; sourceUpdatedAt: string }[],
  ) => mockMarkAccepted(database, accountId, entityType, accepted),
  reassignGuestImportWordMapping: jest.fn(async () => undefined),
  saveGuestImportConflict: jest.fn(async () => undefined),
}));

const collection = {
  id: 'local-collection', name: 'My words', color: '#4F4DBB',
  created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
};
const word = {
  id: 'local-word', collection_id: 'local-collection', term: 'Scope', normalized_term: 'scope',
  source_language_code: 'en', target_language_code: 'sk', source_pronunciation_locale: 'en-US', target_pronunciation_locale: 'sk-SK', part_of_speech: 'noun',
  definition: 'Device definition', example: null, translation: 'rozsah', catalog_sense_id: null,
  cefr_level: null, source: 'manual', state: 'new', understood_streak: 0, lapse_count: 0,
  view_count: 0, last_viewed_at: null, last_rated_at: null, next_review_at: null,
  created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z',
};

function mapping(entityType: GuestImportMapping['entityType'], localId: string, remoteId: string, sourceUpdatedAt: string | null) {
  return {
    accountId: 'user-1', entityType, localId, remoteId,
    hasConflict: false, conflictResolution: null, sourceUpdatedAt,
    createdAt: '2026-07-20T00:00:00.000Z',
  } satisfies GuestImportMapping;
}

function completedImport(): GuestImportRecord {
  return {
    accountId: 'user-1', state: 'completed',
    totals: { collections: 1, words: 1, events: 0 },
    uploaded: { collections: 1, words: 1, events: 0 },
    errorCode: null, errorMessage: null,
    startedAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
    completedAt: '2026-07-20T00:00:00.000Z',
  };
}

function remote() {
  return {
    listActiveWords: jest.fn(async (_signal?: AbortSignal) => []),
    upsertCollections: jest.fn(async (_rows, _signal?: AbortSignal) => undefined),
    upsertWords: jest.fn(async (_rows, _signal?: AbortSignal) => undefined),
    updateWord: jest.fn(async (_id, _userId, _row, _signal?: AbortSignal) => undefined),
    insertEvents: jest.fn(async (_rows, _signal?: AbortSignal) => undefined),
    tombstoneWord: jest.fn(async (_id, _signal?: AbortSignal) => undefined),
  } as unknown as jest.Mocked<GuestImportRemote>;
}

describe('SyncCutoverService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCutover = null;
    mockImport = completedImport();
    mockSnapshot = { collections: [collection], words: [word], events: [] };
    mockMappings = [
      mapping('collection', collection.id, 'remote-collection', collection.updated_at),
      mapping('word', word.id, 'remote-word', word.updated_at),
    ];
  });

  it('does not cut over unconfirmed guest vocabulary', async () => {
    mockImport = null;
    const backend = remote();
    const service = new SyncCutoverService({} as SQLiteDatabase, backend, { getAll: jest.fn() });

    const view = await service.run('user-1');

    expect(view.phase).toBe('waiting_import');
    expect(backend.listActiveWords).not.toHaveBeenCalled();
  });

  it('marks a fresh device with no guest vocabulary ready without remote writes', async () => {
    mockImport = null;
    mockSnapshot = { collections: [
      { ...collection, id: 'my-words' },
    ], words: [], events: [] };
    mockMappings = [];
    const backend = remote();
    const service = new SyncCutoverService({} as SQLiteDatabase, backend, { getAll: jest.fn(async () => []) });

    const view = await service.run('user-1');

    expect(view.phase).toBe('ready');
    expect(backend.upsertCollections).not.toHaveBeenCalled();
  });

  it('uploads a changed mapped word and verifies it before becoming ready', async () => {
    mockMappings[1] = { ...mockMappings[1], sourceUpdatedAt: '2026-07-01T00:00:00.000Z' };
    const backend = remote();
    backend.listActiveWords.mockResolvedValue([{
      id: 'remote-word', normalizedTerm: 'scope', term: 'Scope', definition: 'Old account definition',
    }]);
    const powerSync = { getAll: jest.fn(async (_sql: string, ids?: unknown[]) => (ids ?? []).map((id) => ({ id }))) };
    const service = new SyncCutoverService({} as SQLiteDatabase, backend, powerSync as never);

    const view = await service.run('user-1');

    expect(backend.upsertWords).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'remote-word', definition: 'Device definition' }),
    ], expect.any(AbortSignal));
    expect(mockMarkAccepted).toHaveBeenCalledWith(
      expect.anything(), 'user-1', 'word', [{ localId: 'local-word', sourceUpdatedAt: word.updated_at }],
    );
    expect(view.phase).toBe('ready');
  });

  it('uploads a new word separately when the same normalized term exists in the account', async () => {
    mockSnapshot.words = [{ ...word, id: 'new-local-word' }];
    mockMappings = [mapping('collection', collection.id, 'remote-collection', collection.updated_at)];
    const backend = remote();
    backend.listActiveWords.mockResolvedValue([{
      id: 'account-word', normalizedTerm: 'scope', term: 'Scope', definition: 'Account definition',
    }]);
    const powerSync = { getAll: jest.fn(async (_sql: string, ids?: unknown[]) => (ids ?? []).map((id) => ({ id }))) };
    const service = new SyncCutoverService({} as SQLiteDatabase, backend, powerSync as never, {
      createUuid: () => 'generated-id',
    });

    const view = await service.run('user-1');

    expect(view.phase).toBe('ready');
    expect(view.conflicts).toEqual([]);
    expect(backend.upsertWords).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'generated-id', normalized_term: 'scope' }),
    ], expect.any(AbortSignal));
  });

  it('tombstones a mapped word deleted after the imported snapshot', async () => {
    mockSnapshot.words = [];
    const backend = remote();
    const powerSync = { getAll: jest.fn(async (_sql: string, ids?: unknown[]) => (ids ?? []).map((id) => ({ id }))) };
    const service = new SyncCutoverService({} as SQLiteDatabase, backend, powerSync as never);

    const view = await service.run('user-1');

    expect(backend.tombstoneWord).toHaveBeenCalledWith('remote-word', expect.any(AbortSignal));
    expect(mockMarkAccepted).toHaveBeenCalledWith(
      expect.anything(), 'user-1', 'word', [{ localId: 'local-word', sourceUpdatedAt: '__deleted__' }],
    );
    expect(view.phase).toBe('ready');
  });
});
