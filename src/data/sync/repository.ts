import * as Crypto from 'expo-crypto';

import type { CefrLevel, Collection, DashboardStats, Word } from '@/domain/types';
import type { NewWordInput } from '@/data/repository';
import { getCefrLevelForCatalogSense } from '@/data/cefr-level-lookup';
import type { RatingUpdate } from '@/features/learning/algorithm';

interface SyncTransaction {
  execute(sql: string, parameters?: unknown[]): Promise<unknown>;
}

interface QueryableDatabase extends SyncTransaction {
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
  writeTransaction<T>(callback: (transaction: SyncTransaction) => Promise<T>): Promise<T>;
}

interface WordRow {
  id: string; collection_id: string; term: string; normalized_term: string;
  source_language_code: string; target_language_code: string; part_of_speech: string | null;
  definition: string; example: string | null; translation: string | null;
  catalog_sense_id: string | null; cefr_level: CefrLevel | null; source: Word['source']; state: Word['state'];
  understood_streak: number; lapse_count: number; view_count: number;
  last_viewed_at: string | null; last_rated_at: string | null; next_review_at: string | null;
  created_at: string; updated_at: string;
}

function toWord(row: WordRow): Word {
  return {
    id: row.id, collectionId: row.collection_id, term: row.term, normalizedTerm: row.normalized_term,
    sourceLanguageCode: row.source_language_code, targetLanguageCode: row.target_language_code,
    partOfSpeech: row.part_of_speech, definition: row.definition, example: row.example,
    translation: row.translation, catalogSenseId: row.catalog_sense_id, cefrLevel: row.cefr_level,
    source: row.source, state: row.state, understoodStreak: row.understood_streak,
    lapseCount: row.lapse_count, viewCount: row.view_count, lastViewedAt: row.last_viewed_at,
    lastRatedAt: row.last_rated_at, nextReviewAt: row.next_review_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function listSyncWords(database: QueryableDatabase) {
  const rows = await database.getAll<WordRow>(
    'SELECT * FROM words WHERE deleted_at IS NULL ORDER BY created_at DESC',
  );
  return rows.map(toWord);
}

export async function getSyncWord(database: QueryableDatabase, id: string) {
  const rows = await database.getAll<WordRow>(
    'SELECT * FROM words WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id],
  );
  return rows[0] ? toWord(rows[0]) : null;
}

export async function listSyncCollections(database: QueryableDatabase): Promise<Collection[]> {
  const rows = await database.getAll<{
    id: string; name: string; color: string; created_at: string; updated_at: string;
  }>('SELECT id, name, color, created_at, updated_at FROM collections WHERE deleted_at IS NULL ORDER BY created_at');
  return rows.map((row) => ({
    id: row.id, name: row.name, color: row.color, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export async function addSyncCollection(database: QueryableDatabase, userId: string, name: string, color: string) {
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  await database.execute(
    `INSERT INTO collections (id, user_id, name, color, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [id, userId, name.trim(), color, now, now],
  );
  return id;
}

function wordValues(userId: string, id: string, input: NewWordInput, now: string) {
  const cefrLevel = input.cefrLevel ?? getCefrLevelForCatalogSense(input.catalogSenseId ?? null);
  return [
    id, userId, input.collectionId, input.term.trim(), input.normalizedTerm, 'en', 'sk',
    input.partOfSpeech ?? null, input.definition.trim(), input.example ?? null, input.translation ?? null,
    input.catalogSenseId ?? null, cefrLevel, input.source ?? 'manual', 'new', 0, 0, 0,
    null, null, null, now, now,
  ];
}

const INSERT_WORD_SQL = `INSERT INTO words
  (id, user_id, collection_id, term, normalized_term, source_language_code, target_language_code,
   part_of_speech, definition, example, translation, catalog_sense_id, cefr_level, source, state,
   understood_streak, lapse_count, view_count, last_viewed_at, last_rated_at, next_review_at,
   created_at, updated_at, deleted_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`;

export async function addSyncWord(database: QueryableDatabase, userId: string, input: NewWordInput) {
  const id = Crypto.randomUUID();
  await database.execute(INSERT_WORD_SQL, wordValues(userId, id, input, new Date().toISOString()));
  return id;
}

export async function addSyncWords(database: QueryableDatabase, userId: string, inputs: NewWordInput[]) {
  const now = new Date().toISOString();
  const ids = inputs.map(() => Crypto.randomUUID());
  await database.writeTransaction(async (transaction) => {
    for (let index = 0; index < inputs.length; index += 1) {
      await transaction.execute(INSERT_WORD_SQL, wordValues(userId, ids[index], inputs[index], now));
    }
  });
  return ids;
}

export async function updateSyncWord(database: QueryableDatabase, id: string, input: NewWordInput) {
  const cefrLevel = input.cefrLevel ?? getCefrLevelForCatalogSense(input.catalogSenseId ?? null);
  await database.execute(
    `UPDATE words SET collection_id = ?, term = ?, normalized_term = ?, part_of_speech = ?,
      definition = ?, example = ?, translation = ?, catalog_sense_id = ?, cefr_level = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [input.collectionId, input.term.trim(), input.normalizedTerm, input.partOfSpeech ?? null,
      input.definition.trim(), input.example ?? null, input.translation ?? null,
      input.catalogSenseId ?? null, cefrLevel, new Date().toISOString(), id],
  );
}

export async function updateSyncWordTranslation(database: QueryableDatabase, id: string, translation: string) {
  const updatedAt = new Date().toISOString();
  await database.execute(
    'UPDATE words SET translation = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [translation.trim(), updatedAt, id],
  );
  return updatedAt;
}

export async function updateMissingSyncWordTranslations(
  database: QueryableDatabase,
  updates: { id: string; translation: string }[],
) {
  if (updates.length === 0) return { updatedAt: null, updatedIds: [] as string[] };
  const current = new Map((await database.getAll<{ id: string }>(
    `SELECT id FROM words WHERE translation IS NULL AND deleted_at IS NULL
     AND id IN (${updates.map(() => '?').join(', ')})`,
    updates.map((update) => update.id),
  )).map((row) => [row.id, true]));
  const accepted = updates.filter((update) => current.has(update.id));
  if (accepted.length === 0) return { updatedAt: null, updatedIds: [] as string[] };
  const updatedAt = new Date().toISOString();
  await database.writeTransaction(async (transaction) => {
    for (const update of accepted) {
      await transaction.execute(
        'UPDATE words SET translation = ?, updated_at = ? WHERE id = ? AND translation IS NULL AND deleted_at IS NULL',
        [update.translation.trim(), updatedAt, update.id],
      );
    }
  });
  return { updatedAt, updatedIds: accepted.map((update) => update.id) };
}

export async function deleteSyncWord(database: QueryableDatabase, id: string) {
  await database.execute('DELETE FROM words WHERE id = ? AND deleted_at IS NULL', [id]);
}

export async function resetSyncWord(database: QueryableDatabase, id: string) {
  const now = new Date().toISOString();
  await database.execute(
    `UPDATE words SET state = 'new', understood_streak = 0, lapse_count = 0, next_review_at = NULL,
      last_rated_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    [now, id],
  );
}

export async function saveSyncRating(
  database: QueryableDatabase,
  userId: string,
  id: string,
  rating: string,
  update: RatingUpdate,
) {
  const eventId = Crypto.randomUUID();
  await database.writeTransaction(async (transaction) => {
    await transaction.execute(
      `UPDATE words SET state = ?, understood_streak = ?, lapse_count = ?, last_rated_at = ?,
       next_review_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [update.state, update.understoodStreak, update.lapseCount, update.lastRatedAt,
        update.nextReviewAt, update.lastRatedAt, id],
    );
    await transaction.execute(
      `INSERT INTO learning_events (id, user_id, word_id, type, value, occurred_at)
       VALUES (?, ?, ?, 'rating', ?, ?)`,
      [eventId, userId, id, rating, update.lastRatedAt],
    );
  });
}

export async function recordSyncView(
  database: QueryableDatabase,
  userId: string,
  id: string,
  occurredAt = new Date().toISOString(),
) {
  const eventId = Crypto.randomUUID();
  await database.writeTransaction(async (transaction) => {
    await transaction.execute(
      `UPDATE words SET view_count = view_count + 1, last_viewed_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [occurredAt, occurredAt, id],
    );
    await transaction.execute(
      `INSERT INTO learning_events (id, user_id, word_id, type, value, occurred_at)
       VALUES (?, ?, ?, 'view', NULL, ?)`,
      [eventId, userId, id, occurredAt],
    );
  });
}

export async function recordSyncNotificationOpen(
  database: QueryableDatabase,
  userId: string,
  wordId: string | null,
) {
  await database.execute(
    `INSERT INTO learning_events (id, user_id, word_id, type, value, occurred_at)
     VALUES (?, ?, ?, 'notification_open', NULL, ?)`,
    [Crypto.randomUUID(), userId, wordId, new Date().toISOString()],
  );
}

export async function getSyncStats(database: QueryableDatabase): Promise<DashboardStats> {
  const stateRows = await database.getAll<{ state: Word['state']; count: number }>(
    'SELECT state, COUNT(*) AS count FROM words WHERE deleted_at IS NULL GROUP BY state',
  );
  const counts = Object.fromEntries(stateRows.map((row) => [row.state, row.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventRows = await database.getAll<{ viewed_today: number; notification_opens: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'view' AND occurred_at >= ? THEN 1 ELSE 0 END), 0) AS viewed_today,
       COALESCE(SUM(CASE WHEN type = 'notification_open' THEN 1 ELSE 0 END), 0) AS notification_opens
     FROM learning_events`,
    [today.toISOString()],
  );
  const lifetimeRows = await database.getAll<{ total: number }>(
    'SELECT COALESCE(SUM(view_count), 0) AS total FROM words WHERE deleted_at IS NULL',
  );
  const activityStart = new Date(today);
  activityStart.setDate(today.getDate() - 6);
  const recentViews = await database.getAll<{ occurred_at: string }>(
    "SELECT occurred_at FROM learning_events WHERE type = 'view' AND occurred_at >= ? ORDER BY occurred_at",
    [activityStart.toISOString()],
  );
  const activityCounts = new Map<string, number>();
  for (const event of recentViews) {
    const date = new Date(event.occurred_at);
    const key = localDateKey(date);
    activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1);
  }
  const recentActivity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(activityStart);
    date.setDate(activityStart.getDate() + index);
    const key = localDateKey(date);
    return { date: key, count: activityCounts.get(key) ?? 0 };
  });
  return {
    totalWords: Object.values(counts).reduce((total, value) => total + value, 0),
    newWords: counts.new ?? 0,
    difficultWords: counts.cannot_remember ?? 0,
    understoodWords: counts.understood ?? 0,
    learnedWords: counts.learned ?? 0,
    viewedToday: eventRows[0]?.viewed_today ?? 0,
    viewedLifetime: lifetimeRows[0]?.total ?? 0,
    notificationOpens: eventRows[0]?.notification_opens ?? 0,
    recentActivity,
  };
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export type SyncRepositoryDatabase = QueryableDatabase;
