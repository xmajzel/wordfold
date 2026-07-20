import type { SQLiteDatabase } from 'expo-sqlite';

import { normalizeTermForLanguage } from '@/domain/normalize-term';

import { getCefrLevelForCatalogSense } from './cefr-level-lookup';

const DATABASE_VERSION = 7;

export async function migrateDatabase(database: SQLiteDatabase) {
  await database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
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
        normalized_term TEXT NOT NULL,
        source_language_code TEXT NOT NULL DEFAULT 'en',
        target_language_code TEXT NOT NULL DEFAULT 'sk',
        source_pronunciation_locale TEXT NOT NULL DEFAULT 'en-US',
        target_pronunciation_locale TEXT NOT NULL DEFAULT 'sk-SK',
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
      CREATE INDEX words_source_normalized_idx ON words(source_language_code, normalized_term);

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

  if (currentVersion < 5) {
    await database.execAsync(`
      CREATE TABLE sync_imports (
        account_id TEXT PRIMARY KEY NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('prepared', 'needs_conflicts', 'uploading', 'verifying', 'completed', 'error')),
        collections_total INTEGER NOT NULL DEFAULT 0,
        collections_uploaded INTEGER NOT NULL DEFAULT 0,
        words_total INTEGER NOT NULL DEFAULT 0,
        words_uploaded INTEGER NOT NULL DEFAULT 0,
        events_total INTEGER NOT NULL DEFAULT 0,
        events_uploaded INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        error_message TEXT,
        started_at TEXT,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE sync_id_mappings (
        account_id TEXT NOT NULL REFERENCES sync_imports(account_id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('collection', 'word', 'learning_event')),
        local_id TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        has_conflict INTEGER NOT NULL DEFAULT 0 CHECK(has_conflict IN (0, 1)),
        conflict_resolution TEXT CHECK(conflict_resolution IN ('keep_account', 'use_device')),
        source_updated_at TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (account_id, entity_type, local_id),
        UNIQUE (account_id, entity_type, remote_id)
      );
      CREATE INDEX sync_id_mappings_account_type_idx
        ON sync_id_mappings(account_id, entity_type);
    `);
  }

  if (currentVersion < 6) {
    await database.execAsync(`
      CREATE TABLE sync_cutovers (
        account_id TEXT PRIMARY KEY NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('checking', 'needs_conflicts', 'uploading', 'verifying', 'ready', 'error')),
        collections_total INTEGER NOT NULL DEFAULT 0,
        collections_uploaded INTEGER NOT NULL DEFAULT 0,
        words_total INTEGER NOT NULL DEFAULT 0,
        words_uploaded INTEGER NOT NULL DEFAULT 0,
        events_total INTEGER NOT NULL DEFAULT 0,
        events_uploaded INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        error_message TEXT,
        started_at TEXT,
        updated_at TEXT NOT NULL,
        ready_at TEXT
      );

      CREATE TABLE scheduled_reminders_v6 (
        notification_id TEXT PRIMARY KEY NOT NULL,
        word_id TEXT NOT NULL,
        scheduled_at TEXT NOT NULL
      );
      INSERT INTO scheduled_reminders_v6 (notification_id, word_id, scheduled_at)
        SELECT notification_id, word_id, scheduled_at FROM scheduled_reminders;
      DROP TABLE scheduled_reminders;
      ALTER TABLE scheduled_reminders_v6 RENAME TO scheduled_reminders;
    `);
  }

  if (currentVersion > 0 && currentVersion < 7) {
    await database.execAsync('PRAGMA foreign_keys = OFF');
    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(`
          CREATE TABLE words_v7 (
            id TEXT PRIMARY KEY NOT NULL,
            collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
            term TEXT NOT NULL,
            normalized_term TEXT NOT NULL,
            source_language_code TEXT NOT NULL DEFAULT 'en',
            target_language_code TEXT NOT NULL DEFAULT 'sk',
            source_pronunciation_locale TEXT NOT NULL DEFAULT 'en-US',
            target_pronunciation_locale TEXT NOT NULL DEFAULT 'sk-SK',
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

          INSERT INTO words_v7 (
            id, collection_id, term, normalized_term, source_language_code, target_language_code,
            source_pronunciation_locale, target_pronunciation_locale, part_of_speech, definition,
            example, translation, catalog_sense_id, cefr_level, source, state, understood_streak,
            lapse_count, view_count, last_viewed_at, last_rated_at, next_review_at, created_at, updated_at
          )
          SELECT
            id, collection_id, term, normalized_term, source_language_code, target_language_code,
            CASE source_language_code
              WHEN 'en' THEN 'en-US' WHEN 'sk' THEN 'sk-SK' WHEN 'es' THEN 'es-ES'
              WHEN 'de' THEN 'de-DE' WHEN 'el' THEN 'el-GR' ELSE source_language_code
            END,
            CASE target_language_code
              WHEN 'en' THEN 'en-US' WHEN 'sk' THEN 'sk-SK' WHEN 'es' THEN 'es-ES'
              WHEN 'de' THEN 'de-DE' WHEN 'el' THEN 'el-GR' ELSE target_language_code
            END,
            part_of_speech, definition, example, translation, catalog_sense_id, cefr_level, source,
            state, understood_streak, lapse_count, view_count, last_viewed_at, last_rated_at,
            next_review_at, created_at, updated_at
          FROM words;

          DROP TABLE words;
          ALTER TABLE words_v7 RENAME TO words;
          CREATE INDEX words_state_due_idx ON words(state, next_review_at);
          CREATE INDEX words_collection_idx ON words(collection_id);
          CREATE INDEX words_source_normalized_idx ON words(source_language_code, normalized_term);
        `);

        const words = await transaction.getAllAsync<{
          id: string;
          term: string;
          source_language_code: string;
        }>('SELECT id, term, source_language_code FROM words');
        for (const word of words) {
          await transaction.runAsync(
            'UPDATE words SET normalized_term = ? WHERE id = ?',
            normalizeTermForLanguage(word.term, word.source_language_code),
            word.id,
          );
        }

        const foreignKeyErrors = await transaction.getAllAsync('PRAGMA foreign_key_check');
        if (foreignKeyErrors.length > 0) throw new Error('Word database migration failed its foreign-key check.');
      });
    } finally {
      await database.execAsync('PRAGMA foreign_keys = ON');
    }
  }

  await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
