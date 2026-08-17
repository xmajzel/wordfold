import type { RatingUpdate } from '@/features/learning/algorithm';

import {
  addSyncWord,
  deleteSyncWord,
  listSyncWords,
  recordSyncView,
  saveSyncRating,
  type SyncRepositoryDatabase,
} from './repository';

const mockRandomUUID = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));

function database(rows: unknown[] = []) {
  const transaction = { execute: jest.fn(async () => undefined) };
  return {
    database: {
      getAll: jest.fn(async () => rows),
      execute: jest.fn(async () => undefined),
      writeTransaction: jest.fn(async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as SyncRepositoryDatabase,
    transaction,
  };
}

const newWord = {
  collectionId: 'collection-1', term: ' Able ', normalizedTerm: 'able', definition: ' capable ',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk',
  sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK',
};

describe('PowerSync vocabulary repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomUUID.mockReturnValue('generated-id');
  });

  it('only lists active words', async () => {
    const context = database([]);
    await listSyncWords(context.database);
    expect(context.database.getAll).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'));
  });

  it('creates complete UUID-keyed words locally', async () => {
    const context = database();
    await expect(addSyncWord(context.database, 'user-1', newWord)).resolves.toBe('generated-id');
    expect(context.database.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO words'), expect.arrayContaining([
      'generated-id', 'user-1', 'collection-1', 'Able', 'able', 'en', 'sk',
      'en-US', 'sk-SK',
    ]));
  });

  it('stores a rating state and event in one transaction', async () => {
    const context = database();
    const update: RatingUpdate = {
      state: 'understood', understoodStreak: 1, lapseCount: 0,
      lastRatedAt: '2026-07-20T12:00:00.000Z', nextReviewAt: '2026-07-21T12:00:00.000Z',
    };

    await saveSyncRating(context.database, 'user-1', 'word-1', 'understood', update);

    expect(context.database.writeTransaction).toHaveBeenCalledTimes(1);
    expect(context.transaction.execute).toHaveBeenCalledTimes(2);
    expect((context.transaction.execute.mock.calls as unknown[][])[1][0]).toContain('INSERT INTO learning_events');
  });

  it('stores a view counter and event in one transaction', async () => {
    const context = database();
    await recordSyncView(context.database, 'user-1', 'word-1', '2026-07-20T12:00:00.000Z');
    expect(context.database.writeTransaction).toHaveBeenCalledTimes(1);
    expect(context.transaction.execute).toHaveBeenCalledTimes(2);
  });

  it('uses a local delete so PowerSync queues a tombstone upload', async () => {
    const context = database();
    await deleteSyncWord(context.database, 'word-1');
    expect(context.database.execute).toHaveBeenCalledWith(
      'DELETE FROM words WHERE id = ? AND deleted_at IS NULL', ['word-1'],
    );
  });
});
