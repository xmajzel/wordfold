import type { SQLiteDatabase } from 'expo-sqlite';

import { getCefrLevelForCatalogSense } from './cefr-level-lookup';

const DATABASE_VERSION = 4;

export async function migrateDatabase(database: SQLiteDatabase) {
  await database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await database.execAsync(`
      CREATE TABLE collections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE words (
        id TEXT PRIMARY KEY NOT NULL,
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
        term TEXT NOT NULL,
        normalized_term TEXT NOT NULL UNIQUE,
        source_language_code TEXT NOT NULL DEFAULT 'en',
        target_language_code TEXT NOT NULL DEFAULT 'sk',
        part_of_speech TEXT,
        definition TEXT NOT NULL,
        example TEXT,
        translation TEXT,
        catalog_sense_id TEXT,
        cefr_level TEXT CHECK(cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'spoken', 'business', 'academic')),
        state TEXT NOT NULL DEFAULT 'new' CHECK(state IN ('new', 'cannot_remember', 'understood', 'learned')),
        understood_streak INTEGER NOT NULL DEFAULT 0,
        lapse_count INTEGER NOT NULL DEFAULT 0,
        view_count INTEGER NOT NULL DEFAULT 0,
        last_viewed_at TEXT,
        last_rated_at TEXT,
        next_review_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX words_state_due_idx ON words(state, next_review_at);
      CREATE INDEX words_collection_idx ON words(collection_id);

      CREATE TABLE learning_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id TEXT REFERENCES words(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK(type IN ('view', 'rating', 'notification_open')),
        value TEXT,
        occurred_at TEXT NOT NULL
      );
      CREATE INDEX learning_events_time_idx ON learning_events(occurred_at);

      CREATE TABLE reminder_settings (
        id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        count_per_day INTEGER NOT NULL DEFAULT 1 CHECK(count_per_day BETWEEN 1 AND 6),
        window_start_minutes INTEGER NOT NULL DEFAULT 600,
        window_end_minutes INTEGER NOT NULL DEFAULT 1200,
        time_zone_id TEXT NOT NULL DEFAULT 'local',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE scheduled_reminders (
        notification_id TEXT PRIMARY KEY NOT NULL,
        word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        scheduled_at TEXT NOT NULL
      );

      CREATE TABLE content_packs (
        id TEXT PRIMARY KEY NOT NULL CHECK(id IN ('spoken', 'business', 'academic')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE app_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    await database.runAsync(
      'INSERT INTO collections (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      'my-words', 'My words', '#4F4DBB', now, now,
    );
    await database.runAsync(
      `INSERT INTO reminder_settings
        (id, enabled, count_per_day, window_start_minutes, window_end_minutes, time_zone_id, updated_at)
       VALUES (1, 0, 1, 600, 1200, 'local', ?)`,
      now,
    );
    await database.runAsync(
      `INSERT INTO content_packs (id, name, enabled) VALUES
        ('spoken', 'Everyday conversations', 0),
        ('business', 'Work and business', 0),
        ('academic', 'Study and research', 0)`,
    );
    await database.runAsync("INSERT INTO app_metadata (key, value) VALUES ('onboarding_complete', 'false')");
  }

  if (currentVersion < 3) {
    if (currentVersion > 0) {
      await database.execAsync(
        "ALTER TABLE words ADD COLUMN cefr_level TEXT CHECK(cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'))",
      );
    }
    await database.runAsync(
      "INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('learning_filter', 'all')",
    );
    const candidates = await database.getAllAsync<{ id: string; catalog_sense_id: string | null }>(
      'SELECT id, catalog_sense_id FROM words WHERE catalog_sense_id IS NOT NULL',
    );
    const backfill = candidates.flatMap((word) => {
      const level = getCefrLevelForCatalogSense(word.catalog_sense_id);
      return level ? [{ id: word.id, level }] : [];
    });
    if (backfill.length > 0) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const word of backfill) {
          await transaction.runAsync('UPDATE words SET cefr_level = ? WHERE id = ?', word.level, word.id);
        }
      });
    }
  }

  if (currentVersion < 4) {
    await database.runAsync(
      "INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('preferred_cefr_levels', '[]')",
    );
    await database.execAsync(`
      UPDATE content_packs SET name = 'Everyday conversations' WHERE id = 'spoken';
      UPDATE content_packs SET name = 'Work and business' WHERE id = 'business';
      UPDATE content_packs SET name = 'Study and research' WHERE id = 'academic';
    `);
  }

  await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
