import { getWordPlayIntroductions, saveWordPlayIntroduction } from './repository';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './database';
import { getGuestWordPlayStats, getSyncWordPlayStats, recordGuestWordPlayEvent, recordSyncWordPlayEvent } from './word-play-repository';
import type { WordPlayEvent } from '@/features/word-play/model';

// Node 24's real SQLite engine exercises the SQL; it is not part of the app bundle.
type SQLInputValue = string | number | null;
interface TestSQLite {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    get(...params: SQLInputValue[]): Record<string, unknown> | undefined;
    all(...params: SQLInputValue[]): Record<string, unknown>[];
    run(...params: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
}
const { DatabaseSync } = jest.requireActual<{ DatabaseSync: new (path: string) => TestSQLite }>('node:sqlite');
interface TestSync {
  getAll<T>(query: string, params?: unknown[]): Promise<T[]>;
  execute(query: string, params?: unknown[]): Promise<unknown>;
  writeTransaction<T>(callback: (transaction: TestSync) => Promise<T>): Promise<T>;
}

const event: WordPlayEvent = {
  id: 'event-1', wordId: 'word-1', sessionId: 'session-1', courseId: 'en-sk', mode: 'matching',
  type: 'game_seen', occurredAt: '2026-09-18T10:00:00.000Z',
};

function sqlite() {
  const sql = new DatabaseSync(':memory:');
  const database = {
    execAsync: async (query: string) => { sql.exec(query); },
    runAsync: async (query: string, ...params: SQLInputValue[]) => sql.prepare(query).run(...params),
    getFirstAsync: async (query: string, ...params: SQLInputValue[]) => sql.prepare(query).get(...params) ?? null,
    getAllAsync: async (query: string, ...params: SQLInputValue[]) => sql.prepare(query).all(...params),
    withExclusiveTransactionAsync: async (callback: (db: SQLiteDatabase) => Promise<void>) => {
      sql.exec('BEGIN');
      try { await callback(database as unknown as SQLiteDatabase); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, database: database as unknown as SQLiteDatabase };
}

describe('Word play storage', () => {
  it('persists introduction dismissal separately per language across fresh reads', async () => {
    const { sql, database } = sqlite();
    await migrateDatabase(database);
    expect(await getWordPlayIntroductions(database)).toEqual([]);
    await saveWordPlayIntroduction(database, 'en-sk');
    expect(await getWordPlayIntroductions(database)).toEqual(['en-sk']);
    await saveWordPlayIntroduction(database, 'es-sk');
    await saveWordPlayIntroduction(database, 'en-sk');
    expect((await getWordPlayIntroductions(database)).sort()).toEqual(['en-sk', 'es-sk']);
    sql.close();
  });

  it('migrates a v8 history without changing IDs, counters or existing events', async () => {
    const { sql, database } = sqlite();
    sql.exec(`CREATE TABLE words (id TEXT PRIMARY KEY); INSERT INTO words VALUES ('word-1');
      CREATE TABLE learning_events (id INTEGER PRIMARY KEY AUTOINCREMENT, word_id TEXT REFERENCES words(id) ON DELETE SET NULL,
        type TEXT CHECK(type IN ('view', 'rating', 'notification_open')), value TEXT, occurred_at TEXT);
      INSERT INTO learning_events VALUES (42, 'word-1', 'rating', 'learned', '2026-09-01');
      CREATE INDEX learning_events_time_idx ON learning_events(occurred_at); PRAGMA user_version = 8;`);
    await migrateDatabase(database);
    expect(sql.prepare('SELECT * FROM learning_events').get()).toEqual({ id: 42, word_id: 'word-1', type: 'rating', value: 'learned', occurred_at: '2026-09-01' });
    sql.prepare('INSERT INTO learning_events (word_id, type, value, occurred_at) VALUES (?, ?, ?, ?)').run('word-1', 'game_seen', '{}', 'today');
    expect(sql.prepare('SELECT MAX(id) AS id FROM learning_events').get()?.id).toBe(43);
    await migrateDatabase(database);
    expect(sql.prepare('PRAGMA user_version').get()?.user_version).toBe(9);
    sql.close();
  });

  it.each(['guest', 'synced'] as const)('%s keeps game counters separate and retries relearning safely', async (source) => {
    const { sql, database } = sqlite();
    await migrateDatabase(database);
    sql.exec(`INSERT INTO words (id, collection_id, term, normalized_term, definition, state, known_streak, understood_streak,
      lapse_count, view_count, created_at, updated_at) VALUES ('word-1','my-words','hello','hello','A greeting','learned',3,2,4,9,'yesterday','yesterday');`);
    if (source === 'synced') {
      sql.exec('ALTER TABLE words ADD COLUMN deleted_at TEXT; DROP TABLE learning_events; CREATE TABLE learning_events (id TEXT PRIMARY KEY, user_id TEXT, word_id TEXT, type TEXT, value TEXT, occurred_at TEXT);');
    }
    const sync: TestSync = {
      getAll: async <T,>(query: string, params: unknown[] = []) => sql.prepare(query).all(...params as SQLInputValue[]) as T[],
      execute: async (query: string, params: unknown[] = []) => sql.prepare(query).run(...params as SQLInputValue[]),
      writeTransaction: async <T,>(callback: (transaction: TestSync) => Promise<T>): Promise<T> => {
        sql.exec('BEGIN');
        try { const result = await callback(sync); sql.exec('COMMIT'); return result; }
        catch (error) { sql.exec('ROLLBACK'); throw error; }
      },
    };
    const record = (value: WordPlayEvent) => source === 'guest' ? recordGuestWordPlayEvent(database, value) : recordSyncWordPlayEvent(sync, 'user', value);
    const stats = () => source === 'guest' ? getGuestWordPlayStats(database) : getSyncWordPlayStats(sync);
    await record(event); await record(event);
    await record({ ...event, id: 'missed', type: 'game_missed' });
    await record({ ...event, id: 'answered', type: 'game_answered' });
    expect((await stats())['word-1']).toMatchObject({ gamesPlayed: 1, needsPractice: 1, returnedToLearning: 0 });
    expect(sql.prepare('SELECT state, known_streak, understood_streak, lapse_count, view_count FROM words').get()).toEqual({
      state: 'learned', known_streak: 3, understood_streak: 2, lapse_count: 4, view_count: 9,
    });
    const restart = { ...event, id: 'relearned', type: 'game_relearned' as const };
    await record(restart);
    expect(sql.prepare('SELECT state, known_streak, next_review_at FROM words').get()).toEqual({ state: 'cannot_remember', known_streak: 0, next_review_at: event.occurredAt });
    sql.exec("UPDATE words SET state = 'understood', known_streak = 1");
    await record(restart);
    expect(sql.prepare('SELECT known_streak FROM words').get()?.known_streak).toBe(1);
    expect((await stats())['word-1'].returnedToLearning).toBe(1);
    await expect(record({ ...event, id: 'other', sessionId: 'other', courseId: 'es-sk' })).rejects.toThrow('no longer available');
    sql.close();
  });
});
