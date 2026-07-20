import type { SQLiteDatabase } from 'expo-sqlite';

import { addWord, addWords, completeOnboardingSetup, getLearningFilter, getLearningPreferences, getStats, resetWord, saveLearningFilter, updateMissingWordTranslations, type NewWordInput } from './repository';

function createDatabase() {
  const database = {
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
  } as unknown as SQLiteDatabase;
  database.withExclusiveTransactionAsync = jest.fn(async (callback) => callback(database));
  return database;
}

const words: NewWordInput[] = [
  { collectionId: 'my-words', term: 'Scope', normalizedTerm: 'scope', definition: 'The extent of something.' },
  { collectionId: 'my-words', term: 'Milestone', normalizedTerm: 'milestone', definition: 'A significant stage.' },
];

describe('word repository', () => {
  it('bulk inserts all words inside one transaction', async () => {
    const database = createDatabase();

    const ids = await addWords(database, words);

    expect(database.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(database.runAsync).toHaveBeenCalledTimes(2);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('executes bulk writes on the exclusive transaction object', async () => {
    const database = createDatabase();
    const transaction = { runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })) };
    (database.withExclusiveTransactionAsync as jest.Mock).mockImplementationOnce(
      async (callback: (value: typeof transaction) => Promise<void>) => callback(transaction),
    );

    await addWords(database, words);

    expect(transaction.runAsync).toHaveBeenCalledTimes(2);
    expect(database.runAsync).not.toHaveBeenCalled();
  });

  it('backfills only words whose translations are still missing', async () => {
    const database = createDatabase();
    (database.runAsync as jest.Mock)
      .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 })
      .mockResolvedValueOnce({ changes: 1, lastInsertRowId: 0 });

    const result = await updateMissingWordTranslations(database, [
      { id: 'catalog-1', translation: 'rozsah' },
      { id: 'catalog-2', translation: 'medzník' },
    ]);

    expect(database.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(database.runAsync).toHaveBeenCalledTimes(2);
    expect((database.runAsync as jest.Mock).mock.calls[0][0]).toContain('translation IS NULL');
    expect(result.updatedIds).toEqual(['catalog-2']);
  });

  it('classifies a matching dictionary sense when adding a word', async () => {
    const database = createDatabase();

    await addWord(database, {
      collectionId: 'my-words', term: 'About', normalizedTerm: 'about',
      definition: 'On the subject of something.', catalogSenseId: '00007414-r:about',
    });

    const [, ...parameters] = (database.runAsync as jest.Mock).mock.calls[0];
    expect(parameters[8]).toBe('00007414-r:about');
    expect(parameters[9]).toBe('A1');
  });

  it('resets learning state without deleting event history', async () => {
    const database = createDatabase();

    await resetWord(database, 'word-1');

    const [query, , id] = (database.runAsync as jest.Mock).mock.calls[0];
    expect(query).toContain("state = 'new'");
    expect(query).toContain('lapse_count = 0');
    expect(query).not.toContain('DELETE');
    expect(id).toBe('word-1');
  });

  it('returns a complete seven-day activity series', async () => {
    const database = createDatabase();
    database.getAllAsync = jest.fn()
      .mockResolvedValueOnce([{ state: 'new', count: 2 }])
      .mockResolvedValueOnce([{ occurred_at: new Date().toISOString() }]);
    database.getFirstAsync = jest.fn()
      .mockResolvedValueOnce({ viewed_today: 1, notification_opens: 0 })
      .mockResolvedValueOnce({ total: 1 });

    const stats = await getStats(database);

    expect(stats.recentActivity).toHaveLength(7);
    expect(stats.recentActivity.at(-1)?.count).toBe(1);
    expect(stats.recentActivity.slice(0, -1).every((day) => day.count === 0)).toBe(true);
  });

  it('defaults invalid stored learning filters to all and persists explicit choices', async () => {
    const database = createDatabase();
    database.getFirstAsync = jest.fn(async () => ({ value: 'unknown' }));

    await expect(getLearningFilter(database)).resolves.toBe('all');
    await saveLearningFilter(database, 'B2');

    expect(database.runAsync).toHaveBeenCalledWith(expect.stringContaining("'learning_filter'"), 'B2');
  });

  it('validates stored learning preferences', async () => {
    const database = createDatabase();
    database.getFirstAsync = jest.fn(async () => ({ value: '["C2","invalid","A1"]' }));
    database.getAllAsync = jest.fn(async () => [
      { id: 'spoken', name: 'Everyday conversations', enabled: 1 },
      { id: 'business', name: 'Work and business', enabled: 0 },
      { id: 'academic', name: 'Study and research', enabled: 1 },
    ]);

    await expect(getLearningPreferences(database)).resolves.toEqual({
      levels: ['A1', 'C2'],
      topics: ['spoken', 'academic'],
    });
  });

  it('saves preferences, starter words, and completion atomically', async () => {
    const database = createDatabase();
    database.getAllAsync = jest.fn(async () => [
      { id: 'spoken', name: 'Everyday conversations', enabled: 0 },
      { id: 'business', name: 'Work and business', enabled: 0 },
      { id: 'academic', name: 'Study and research', enabled: 0 },
    ]);

    const ids = await completeOnboardingSetup(
      database,
      { levels: ['A2'], topics: ['business'] },
      [words[0]],
    );

    expect(ids).toHaveLength(1);
    expect(database.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(database.runAsync).toHaveBeenCalledWith(expect.stringContaining('preferred_cefr_levels'), '["A2"]');
    expect(database.runAsync).toHaveBeenCalledWith(expect.stringContaining('onboarding_complete'));
  });
});
