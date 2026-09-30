import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncRepositoryDatabase } from './sync/repository';
import { migrateDatabase } from './database';
import { gardenTreeId, getGuestGardenProgress, plantGuestGardenTree, plantSyncGardenTree } from './garden-repository';
import { replaceGuestVocabularyWithSnapshot } from './account-deletion';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { MD5: 'md5' },
  digestStringAsync: async (algorithm: string, value: string) => jest.requireActual('node:crypto').createHash(algorithm).update(value).digest('hex'),
}));
const { DatabaseSync } = jest.requireActual('node:sqlite');
const fs = jest.requireActual('node:fs');
const os = jest.requireActual('node:os');
const path = jest.requireActual('node:path');
function open(filename = ':memory:') {
  const sql = new DatabaseSync(filename);
  const database = {
    execAsync: async (query: string) => { sql.exec(query); },
    runAsync: async (query: string, ...params: unknown[]) => sql.prepare(query).run(...params),
    getFirstAsync: async (query: string, ...params: unknown[]) => sql.prepare(query).get(...params) ?? null,
    getAllAsync: async (query: string, ...params: unknown[]) => sql.prepare(query).all(...params),
    withExclusiveTransactionAsync: async (callback: (db: SQLiteDatabase) => Promise<void>) => {
      sql.exec('BEGIN');
      try { await callback(database as unknown as SQLiteDatabase); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as SQLiteDatabase;
  return { sql, database };
}
function practice(sql: ReturnType<typeof open>['sql'], count: number) {
  for (let index = 1; index <= count; index += 1) {
    const day = `2026-08-${String(index).padStart(2, '0')}`;
    sql.prepare("INSERT INTO learning_events (word_id, type, value, occurred_at, practice_date) VALUES (NULL, 'rating', 'understood', ?, ?)").run(`${day}T10:00:00Z`, day);
  }
}

describe('Persistent garden', () => {
  it('plants once per milestone, survives a real database restart and vocabulary deletion', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wordfold-garden-'));
    const filename = path.join(directory, 'garden.sqlite');
    let store = open(filename);
    try {
      await migrateDatabase(store.database);
      practice(store.sql, 9);
      expect(await plantGuestGardenTree(store.database)).toBeNull();
      practice(store.sql, 10); // Same dates count only once, even with extra ratings.
      const tree = await plantGuestGardenTree(store.database);
      expect(tree).toMatchObject({ ordinal: 1, earnedOn: '2026-08-10' });
      expect(await plantGuestGardenTree(store.database)).toBeNull();
      store.sql.exec("INSERT INTO words (id, collection_id, term, normalized_term, definition, created_at, updated_at) VALUES ('word', 'my-words', 'hello', 'hello', 'greeting', 'now', 'now'); UPDATE learning_events SET word_id = 'word' WHERE type = 'rating'; DELETE FROM words;");
      store.sql.close(); store = open(filename);
      expect(await getGuestGardenProgress(store.database)).toMatchObject({ practiceDays: 10, practiceActions: 19, currentStreak: 0, readyToPlant: 0, trees: [tree] });
      practice(store.sql, 20);
      expect(await plantGuestGardenTree(store.database)).toMatchObject({ ordinal: 2, earnedOn: '2026-08-20' });
      expect(await plantGuestGardenTree(store.database)).toBeNull();
    } finally { store.sql.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  });
  it('freezes legacy UTC dates and preserves event IDs when migrating version nine', async () => {
    const { sql, database } = open();
    sql.exec(`CREATE TABLE words (id TEXT PRIMARY KEY);
      CREATE TABLE learning_events (id INTEGER PRIMARY KEY, word_id TEXT REFERENCES words(id) ON DELETE SET NULL, type TEXT, value TEXT, occurred_at TEXT);
      INSERT INTO learning_events VALUES (42, NULL, 'rating', 'understood', '2026-09-20T23:30:00-02:00');
      INSERT INTO learning_events VALUES (43, NULL, 'view', NULL, '2026-09-22'); PRAGMA user_version = 9;`);
    await migrateDatabase(database);
    expect(sql.prepare('SELECT id, practice_date FROM learning_events ORDER BY id').all()).toEqual([{ id: 42, practice_date: '2026-09-21' }, { id: 43, practice_date: null }]);
    expect((await getGuestGardenProgress(database)).practiceDays).toBe(1);
    sql.close();
  });
  it('uses the same primary key across devices and retries a synced claim safely', async () => {
    const { sql } = open();
    sql.exec('CREATE TABLE learning_events (id TEXT PRIMARY KEY, user_id TEXT, word_id TEXT, type TEXT, value TEXT, occurred_at TEXT, practice_date TEXT);');
    practice(sql, 10);
    const sync: SyncRepositoryDatabase = {
      getAll: async <T,>(query: string, params: unknown[] = []) => sql.prepare(query).all(...params) as T[],
      execute: async (query: string, params: unknown[] = []) => sql.prepare(query).run(...params),
      writeTransaction: async <T,>(callback: (transaction: SyncRepositoryDatabase) => Promise<T>): Promise<T> => {
        sql.exec('BEGIN');
        try { const value = await callback(sync); sql.exec('COMMIT'); return value; }
        catch (error) { sql.exec('ROLLBACK'); throw error; }
      },
    };
    const id = await gardenTreeId('12345678-1111-4111-8111-123456789012', 1);
    await plantSyncGardenTree(sync, '12345678-1111-4111-8111-123456789012');
    expect(await plantSyncGardenTree(sync, '12345678-1111-4111-8111-123456789012')).toBeNull();
    expect(sql.prepare("SELECT id FROM learning_events WHERE type = 'garden_tree'").all()).toEqual([{ id }]);
    expect(await gardenTreeId('other-user', 1)).not.toBe(id);
    sql.close();
  });
  it('keeps planted trees and dates in the local account-deletion recovery copy', async () => {
    const { sql, database } = open();
    await migrateDatabase(database);
    await replaceGuestVocabularyWithSnapshot(database, {
      accountId: 'account', createdAt: '2026-09-30T12:00:00Z', collections: [], words: [],
      learningEvents: [{ wordId: 'deleted-word', type: 'rating', value: 'understood', occurredAt: '2026-09-30T00:30:00Z', practiceDate: '2026-09-29' },
        { wordId: null, type: 'garden_tree', value: '1', occurredAt: '2026-09-30T12:00:00Z', practiceDate: '2026-09-29' }],
    });
    expect(await getGuestGardenProgress(database)).toMatchObject({ practiceDays: 1, trees: [{ ordinal: 1, earnedOn: '2026-09-29', plantedAt: '2026-09-30T12:00:00Z' }] });
    expect(sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    sql.close();
  });
});
