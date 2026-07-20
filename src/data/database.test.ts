import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from './database';

function createDatabase(version = 0) {
  const database = {
    execAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => ({ user_version: version })),
    getAllAsync: jest.fn(async () => []),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
  } as unknown as SQLiteDatabase;
  database.withExclusiveTransactionAsync = jest.fn(async (callback) => callback(database));
  return database;
}

describe('migrateDatabase', () => {
  it('creates the initial schema and seed records', async () => {
    const database = createDatabase();

    await migrateDatabase(database);

    expect(database.execAsync).toHaveBeenNthCalledWith(
      1,
      'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
    );
    const schema = (database.execAsync as jest.Mock).mock.calls[1][0] as string;
    expect(schema).toContain('CREATE TABLE words');
    expect(schema).toContain('cefr_level');
    expect(schema).toContain('CREATE TABLE learning_events');
    expect(schema).toContain('CREATE TABLE reminder_settings');
    expect(database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO collections'),
      'my-words',
      'My words',
      '#4F4DBB',
      expect.any(String),
      expect.any(String),
    );
    expect(database.withExclusiveTransactionAsync).not.toHaveBeenCalled();
    expect((database.execAsync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('CREATE TABLE sync_imports'))).toBe(true);
    expect((database.execAsync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('CREATE TABLE sync_id_mappings'))).toBe(true);
    expect((database.execAsync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('CREATE TABLE sync_cutovers'))).toBe(true);
    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA user_version = 6');
  });

  it('preserves an existing version-one database without adding personal seed data', async () => {
    const database = createDatabase(1);

    await migrateDatabase(database);

    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA user_version = 6');
    expect(database.withExclusiveTransactionAsync).not.toHaveBeenCalled();
    expect(database.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO words'));
  });

  it('adds and backfills CEFR levels when upgrading a version-two database', async () => {
    const database = createDatabase(2);
    (database.getAllAsync as jest.Mock).mockResolvedValueOnce([
      { id: 'word-1', catalog_sense_id: '00007414-r:about' },
      { id: 'word-2', catalog_sense_id: 'not-in-catalog' },
    ]);

    await migrateDatabase(database);

    expect(database.execAsync).toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE words ADD COLUMN cefr_level'));
    expect(database.getAllAsync).toHaveBeenCalledWith('SELECT id, catalog_sense_id FROM words WHERE catalog_sense_id IS NOT NULL');
    expect(database.runAsync).toHaveBeenCalledWith(expect.stringContaining("'learning_filter', 'all'"));
    expect(database.runAsync).toHaveBeenCalledWith('UPDATE words SET cefr_level = ? WHERE id = ?', 'A1', 'word-1');
    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA user_version = 6');
  });

  it('does not reapply an up-to-date migration', async () => {
    const database = createDatabase(6);

    await migrateDatabase(database);

    expect(database.execAsync).toHaveBeenCalledTimes(1);
    expect(database.runAsync).not.toHaveBeenCalled();
  });

  it('adds import checkpoint tables when upgrading a version-four database', async () => {
    const database = createDatabase(4);

    await migrateDatabase(database);

    const migration = (database.execAsync as jest.Mock).mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('CREATE TABLE sync_imports'));
    expect(migration).toContain("CHECK(state IN ('prepared', 'needs_conflicts', 'uploading', 'verifying', 'completed', 'error'))");
    expect(migration).toContain('CREATE TABLE sync_id_mappings');
    expect(migration).toContain('has_conflict INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('UNIQUE (account_id, entity_type, remote_id)');
    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA user_version = 6');
  });

  it('adds cutover state and rebuilds reminder bookkeeping without a guest-word foreign key', async () => {
    const database = createDatabase(5);

    await migrateDatabase(database);

    const migration = (database.execAsync as jest.Mock).mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('CREATE TABLE sync_cutovers'));
    expect(migration).toContain("CHECK(state IN ('checking', 'needs_conflicts', 'uploading', 'verifying', 'ready', 'error'))");
    expect(migration).toContain('CREATE TABLE scheduled_reminders_v6');
    expect(migration).toContain('SELECT notification_id, word_id, scheduled_at FROM scheduled_reminders');
    expect(migration).not.toContain('word_id TEXT NOT NULL REFERENCES words');
    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA user_version = 6');
  });
});
