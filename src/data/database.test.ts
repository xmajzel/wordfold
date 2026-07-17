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
    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA user_version = 4');
  });

  it('preserves an existing version-one database without adding personal seed data', async () => {
    const database = createDatabase(1);

    await migrateDatabase(database);

    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA user_version = 4');
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
    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA user_version = 4');
  });

  it('does not reapply an up-to-date migration', async () => {
    const database = createDatabase(4);

    await migrateDatabase(database);

    expect(database.execAsync).toHaveBeenCalledTimes(1);
    expect(database.runAsync).not.toHaveBeenCalled();
  });
});
