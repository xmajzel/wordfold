import type { SQLiteDatabase } from 'expo-sqlite';

import { readAccountVocabularySnapshot, replaceGuestVocabularyWithSnapshot } from './account-deletion';

describe('account deletion vocabulary snapshot', () => {
  it('reads every synchronized table in one account-scoped transaction', async () => {
    const transaction = { getAll: jest.fn(async () => []) };
    const database = { readTransaction: jest.fn(async (callback) => callback(transaction)) };

    await readAccountVocabularySnapshot(database, 'user-1');

    expect(database.readTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.getAll).toHaveBeenCalledTimes(3);
    for (const call of transaction.getAll.mock.calls as unknown as [string, string[]][]) {
      expect(call[1]).toEqual(['user-1']);
    }
  });

  it('replaces the guest vocabulary atomically and records recovery state', async () => {
    const runAsync = jest.fn<Promise<{ changes: number }>, [string, ...unknown[]]>(
      async () => ({ changes: 1 }),
    );
    const transaction = {
      execAsync: jest.fn(async () => undefined),
      runAsync,
      getAllAsync: jest.fn(async () => []),
    };
    const database = {
      withExclusiveTransactionAsync: jest.fn(async (callback) => callback(transaction)),
    } as unknown as SQLiteDatabase;

    await replaceGuestVocabularyWithSnapshot(database, {
      accountId: 'user-1', createdAt: '2026-08-07T00:00:00.000Z', learningEvents: [],
      collections: [{ id: 'remote-collection', name: 'Cloud', color: '#123456', createdAt: 'a', updatedAt: 'b' }],
      words: [{
        id: 'remote-word', collectionId: 'remote-collection', term: 'Scope', normalizedTerm: 'scope',
        sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US',
        targetPronunciationLocale: 'sk-SK', partOfSpeech: 'noun', definition: 'Extent.', example: null,
        translation: 'rozsah', catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'understood',
        understoodStreak: 2, lapseCount: 1, viewCount: 4, lastViewedAt: null, lastRatedAt: null,
        nextReviewAt: null, createdAt: 'a', updatedAt: 'b',
      }],
    });

    expect(database.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(transaction.execAsync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM words'));
    const wordInsert = runAsync.mock.calls.find(([sql]) => sql.includes('INSERT INTO words'));
    expect(wordInsert?.slice(1)).toHaveLength(24);
    expect(transaction.runAsync).toHaveBeenCalledWith(expect.stringContaining('app_metadata'), 'account_deletion_recovery', expect.stringContaining('user-1'));
  });
});
