import type { SQLiteDatabase } from 'expo-sqlite';

import type { GuestImportRemote } from './guest-import-remote';
import type { GuestImportMapping, GuestImportRecord } from './guest-import-types';
import type { GuestImportSnapshot } from './guest-import-repository';
import { GuestImportService } from './guest-import';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'crypto-uuid') }));

let mockRecord: GuestImportRecord | null;
let mockMappings: GuestImportMapping[];
let mockSnapshot: GuestImportSnapshot;

const mockCreatePlan = jest.fn(async (_database, record: GuestImportRecord, mappings: GuestImportMapping[]) => {
  if (!mockRecord) {
    mockRecord = record;
    mockMappings = mappings;
  }
});
const mockSaveRecord = jest.fn(async (_database, record: GuestImportRecord) => { mockRecord = record; });
const mockSaveConflict = jest.fn(async (_database, _accountId, localId: string, resolution) => {
  mockMappings = mockMappings.map((mapping) => mapping.localId === localId
    ? { ...mapping, conflictResolution: resolution }
    : mapping);
});
const mockReassignWordMapping = jest.fn(async (
  _database, _accountId, localId: string, remoteId: string, hasConflict: boolean,
) => {
  mockMappings = mockMappings.map((item) => item.localId === localId
    ? { ...item, remoteId, hasConflict, conflictResolution: null }
    : item);
});

jest.mock('./guest-import-repository', () => ({
  createGuestImportPlan: (database: SQLiteDatabase, record: GuestImportRecord, mappings: GuestImportMapping[]) => (
    mockCreatePlan(database, record, mappings)
  ),
  getGuestImportRecord: jest.fn(async () => mockRecord),
  listGuestImportMappings: jest.fn(async () => mockMappings),
  loadGuestImportSnapshot: jest.fn(async () => mockSnapshot),
  markGuestImportMappingsAccepted: jest.fn(async () => undefined),
  reassignGuestImportWordMapping: (
    database: SQLiteDatabase, accountId: string, localId: string, remoteId: string, hasConflict: boolean,
  ) => mockReassignWordMapping(database, accountId, localId, remoteId, hasConflict),
  saveGuestImportConflict: (database: SQLiteDatabase, accountId: string, localId: string, resolution: string) => (
    mockSaveConflict(database, accountId, localId, resolution)
  ),
  saveGuestImportRecord: (database: SQLiteDatabase, record: GuestImportRecord) => mockSaveRecord(database, record),
}));

const collection = {
  id: 'my-words', name: 'My words', color: '#4F4DBB',
  created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
};
const word = {
  id: 'word-local', collection_id: 'my-words', term: 'Scope', normalized_term: 'scope',
  source_language_code: 'en', target_language_code: 'sk', source_pronunciation_locale: 'en-US', target_pronunciation_locale: 'sk-SK', part_of_speech: 'noun',
  definition: 'Device definition', example: null, translation: 'rozsah', catalog_sense_id: null,
  cefr_level: null, source: 'manual', state: 'understood', understood_streak: 2,
  lapse_count: 0, view_count: 3, last_viewed_at: '2026-07-02T00:00:00.000Z',
  last_rated_at: '2026-07-02T00:00:00.000Z', next_review_at: '2026-07-03T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z',
};
const event = {
  id: 1, word_id: 'word-local', type: 'rating', value: 'understood',
  occurred_at: '2026-07-02T00:00:00.000Z',
};

function record(state: GuestImportRecord['state'] = 'prepared'): GuestImportRecord {
  return {
    accountId: 'user-1', state,
    totals: { collections: 1, words: 1, events: 1 },
    uploaded: { collections: 0, words: 0, events: 0 },
    errorCode: null, errorMessage: null,
    startedAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z', completedAt: null,
  };
}

function mapping(entityType: GuestImportMapping['entityType'], localId: string, remoteId: string): GuestImportMapping {
  return {
    accountId: 'user-1', entityType, localId, remoteId,
    hasConflict: false, conflictResolution: null, sourceUpdatedAt: null, createdAt: '2026-07-20T00:00:00.000Z',
  };
}

function remote() {
  const events: string[] = [];
  const value = {
    listActiveWords: jest.fn(async () => []),
    upsertCollections: jest.fn(async (_rows, _signal) => { events.push('collections'); }),
    upsertWords: jest.fn(async (_rows, _signal) => { events.push('words'); }),
    updateWord: jest.fn(async (_id, _userId, _row, _signal) => { events.push('word update'); }),
    insertEvents: jest.fn(async (_rows, _signal) => { events.push('events'); }),
  } as unknown as jest.Mocked<GuestImportRemote>;
  return { value, events };
}

describe('GuestImportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecord = null;
    mockMappings = [];
    mockSnapshot = { collections: [collection], words: [word], events: [event] };
  });

  it('persists a stable plan with a distinct id when the account has the same normalized term', async () => {
    const backend = remote();
    backend.value.listActiveWords.mockResolvedValue([{
      id: 'remote-existing', normalizedTerm: 'scope', term: 'Scope', definition: 'Account definition',
    }]);
    const uuids = ['collection-uuid', 'word-uuid', 'event-uuid'];
    const service = new GuestImportService({} as SQLiteDatabase, backend.value, { getAll: jest.fn() }, {
      createUuid: () => uuids.shift()!,
      now: () => new Date('2026-07-20T00:00:00.000Z'),
    });

    const view = await service.prepare('user-1');

    expect(view.phase).toBe('prepared');
    expect(view.conflicts).toEqual([]);
    expect(mockMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'collection', remoteId: 'collection-uuid' }),
      expect.objectContaining({ entityType: 'word', remoteId: 'word-uuid', hasConflict: false }),
      expect.objectContaining({ entityType: 'learning_event', remoteId: 'event-uuid' }),
    ]));
    expect(backend.value.listActiveWords).not.toHaveBeenCalled();
  });

  it('uploads collections, words, and events in dependency order before completing', async () => {
    mockRecord = record();
    mockMappings = [
      mapping('collection', 'my-words', 'collection-uuid'),
      mapping('word', 'word-local', 'word-uuid'),
      mapping('learning_event', '1', 'event-uuid'),
    ];
    const backend = remote();
    const powerSync = { getAll: jest.fn(async (_sql: string, ids?: unknown[]) => (ids ?? []).map((id) => ({ id }))) };
    const service = new GuestImportService({} as SQLiteDatabase, backend.value, powerSync as never, {
      now: () => new Date('2026-07-20T00:00:00.000Z'),
    });

    const view = await service.run('user-1');

    expect(backend.events).toEqual(['collections', 'words', 'events']);
    expect(backend.value.upsertWords).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'word-uuid', collection_id: 'collection-uuid', user_id: 'user-1' }),
    ], expect.any(AbortSignal));
    expect(backend.value.insertEvents).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'event-uuid', word_id: 'word-uuid', user_id: 'user-1' }),
    ], expect.any(AbortSignal));
    expect(view.phase).toBe('completed');
  });

  it('keeps an account conflict without importing that device word or its history', async () => {
    mockRecord = record();
    mockMappings = [
      mapping('collection', 'my-words', 'collection-uuid'),
      { ...mapping('word', 'word-local', 'remote-existing'), conflictResolution: 'keep_account' },
      mapping('learning_event', '1', 'event-uuid'),
    ];
    const backend = remote();
    const powerSync = { getAll: jest.fn(async (_sql: string, ids?: unknown[]) => (ids ?? []).map((id) => ({ id }))) };
    const service = new GuestImportService({} as SQLiteDatabase, backend.value, powerSync as never);

    await service.run('user-1');

    expect(backend.value.updateWord).not.toHaveBeenCalled();
    expect(backend.value.upsertWords).toHaveBeenCalledWith([], expect.any(AbortSignal));
    expect(backend.value.insertEvents).toHaveBeenCalledWith([], expect.any(AbortSignal));
    expect(powerSync.getAll.mock.calls.some(([sql]) => String(sql).includes('learning_events'))).toBe(false);
  });

  it('keeps verification timeout resumable instead of reporting completion', async () => {
    mockRecord = record();
    mockMappings = [mapping('collection', 'my-words', 'collection-uuid')];
    mockSnapshot = { collections: [collection], words: [], events: [] };
    mockRecord.totals = { collections: 1, words: 0, events: 0 };
    const backend = remote();
    const service = new GuestImportService({} as SQLiteDatabase, backend.value, {
      getAll: jest.fn(async () => []),
    }, { verifyTimeoutMs: 0, verifyPollMs: 0 });

    const view = await service.run('user-1');

    expect(view.phase).toBe('verifying');
    expect(view.message).toContain('verification timed out');
    expect(mockRecord?.completedAt).toBeNull();
  });

  it('imports a distinct word when the account changes after preparation', async () => {
    mockRecord = record();
    mockMappings = [
      mapping('collection', 'my-words', 'collection-uuid'),
      mapping('word', 'word-local', 'word-uuid'),
      mapping('learning_event', '1', 'event-uuid'),
    ];
    const backend = remote();
    backend.value.listActiveWords.mockResolvedValue([{
      id: 'new-account-word', normalizedTerm: 'scope', term: 'Scope', definition: 'New account definition',
    }]);
    const powerSync = { getAll: jest.fn(async (_sql: string, ids?: unknown[]) => (ids ?? []).map((id) => ({ id }))) };
    const service = new GuestImportService({} as SQLiteDatabase, backend.value, powerSync as never);

    const view = await service.run('user-1');

    expect(view.phase).toBe('completed');
    expect(backend.value.upsertWords).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'word-uuid', normalized_term: 'scope' }),
    ], expect.any(AbortSignal));
    expect(backend.value.listActiveWords).not.toHaveBeenCalled();
    expect(mockReassignWordMapping).not.toHaveBeenCalled();
  });

  it('persists a resumable error when upload cannot reach the account', async () => {
    mockRecord = record();
    mockMappings = [mapping('collection', 'my-words', 'collection-uuid')];
    mockSnapshot = { collections: [collection], words: [], events: [] };
    mockRecord.totals = { collections: 1, words: 0, events: 0 };
    const backend = remote();
    backend.value.upsertCollections.mockRejectedValue(new TypeError('Network request failed'));
    const service = new GuestImportService({} as SQLiteDatabase, backend.value, { getAll: jest.fn() });

    const view = await service.run('user-1');

    expect(view.phase).toBe('error');
    expect(view.message).toContain('network is unavailable');
    expect(mockRecord).toEqual(expect.objectContaining({ state: 'error', errorCode: 'network_unavailable' }));
    expect(backend.value.listActiveWords).not.toHaveBeenCalled();
  });
});
