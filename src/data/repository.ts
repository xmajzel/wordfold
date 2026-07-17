import type { SQLiteDatabase } from 'expo-sqlite';

import type { CefrLevel, Collection, ContentPackId, ContentSource, DashboardStats, LearningFilter, LearningPreferences, ReminderSettings, Word } from '@/domain/types';
import { getCefrLevelForCatalogSense } from '@/data/cefr-level-lookup';
import { isCefrLevel, isLearningFilter } from '@/data/cefr-levels';
import { normalizeLearningPreferences } from '@/features/recommendations/selector';
import type { RatingUpdate } from '@/features/learning/algorithm';

interface WordRow {
  id: string; collection_id: string; term: string; normalized_term: string;
  source_language_code: string; target_language_code: string; part_of_speech: string | null;
  definition: string; example: string | null; translation: string | null;
  catalog_sense_id: string | null; cefr_level: CefrLevel | null; source: ContentSource; state: Word['state'];
  understood_streak: number; lapse_count: number; view_count: number;
  last_viewed_at: string | null; last_rated_at: string | null; next_review_at: string | null;
  created_at: string; updated_at: string;
}

function toWord(row: WordRow): Word {
  return {
    id: row.id, collectionId: row.collection_id, term: row.term, normalizedTerm: row.normalized_term,
    sourceLanguageCode: row.source_language_code, targetLanguageCode: row.target_language_code,
    partOfSpeech: row.part_of_speech, definition: row.definition, example: row.example,
    translation: row.translation, catalogSenseId: row.catalog_sense_id, cefrLevel: row.cefr_level, source: row.source,
    state: row.state, understoodStreak: row.understood_streak, lapseCount: row.lapse_count,
    viewCount: row.view_count, lastViewedAt: row.last_viewed_at, lastRatedAt: row.last_rated_at,
    nextReviewAt: row.next_review_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function listWords(database: SQLiteDatabase) {
  const rows = await database.getAllAsync<WordRow>('SELECT * FROM words ORDER BY created_at DESC');
  return rows.map(toWord);
}

export async function getWord(database: SQLiteDatabase, id: string) {
  const row = await database.getFirstAsync<WordRow>('SELECT * FROM words WHERE id = ?', id);
  return row ? toWord(row) : null;
}

export async function listCollections(database: SQLiteDatabase): Promise<Collection[]> {
  const rows = await database.getAllAsync<{
    id: string; name: string; color: string; created_at: string; updated_at: string;
  }>('SELECT * FROM collections ORDER BY created_at');
  return rows.map((row) => ({
    id: row.id, name: row.name, color: row.color, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export async function addCollection(database: SQLiteDatabase, name: string, color: string) {
  const now = new Date().toISOString();
  const id = createId('collection');
  await database.runAsync(
    'INSERT INTO collections (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    id, name.trim(), color, now, now,
  );
  return id;
}

export interface NewWordInput {
  collectionId: string; term: string; normalizedTerm: string; definition: string;
  partOfSpeech?: string | null; example?: string | null; translation?: string | null;
  catalogSenseId?: string | null; cefrLevel?: CefrLevel | null; source?: ContentSource;
}

export async function addWord(database: SQLiteDatabase, input: NewWordInput) {
  const now = new Date().toISOString();
  const id = createId('word');
  const cefrLevel = input.cefrLevel ?? getCefrLevelForCatalogSense(input.catalogSenseId ?? null);
  await database.runAsync(
    `INSERT INTO words
      (id, collection_id, term, normalized_term, source_language_code, target_language_code,
       part_of_speech, definition, example, translation, catalog_sense_id, cefr_level, source, state,
       understood_streak, lapse_count, view_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'en', 'sk', ?, ?, ?, ?, ?, ?, ?, 'new', 0, 0, 0, ?, ?)`,
    id, input.collectionId, input.term.trim(), input.normalizedTerm, input.partOfSpeech ?? null,
    input.definition.trim(), input.example ?? null, input.translation ?? null,
    input.catalogSenseId ?? null, cefrLevel, input.source ?? 'manual', now, now,
  );
  return id;
}

export async function addWords(database: SQLiteDatabase, inputs: NewWordInput[]) {
  const ids: string[] = [];
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const input of inputs) ids.push(await addWord(transaction, input));
  });
  return ids;
}

export async function updateWord(database: SQLiteDatabase, id: string, input: NewWordInput) {
  const cefrLevel = input.cefrLevel ?? getCefrLevelForCatalogSense(input.catalogSenseId ?? null);
  await database.runAsync(
    `UPDATE words SET collection_id = ?, term = ?, normalized_term = ?, part_of_speech = ?,
      definition = ?, example = ?, translation = ?, catalog_sense_id = ?, cefr_level = ?, updated_at = ? WHERE id = ?`,
    input.collectionId, input.term.trim(), input.normalizedTerm, input.partOfSpeech ?? null,
    input.definition.trim(), input.example ?? null, input.translation ?? null,
    input.catalogSenseId ?? null, cefrLevel, new Date().toISOString(), id,
  );
}

export async function deleteWord(database: SQLiteDatabase, id: string) {
  await database.runAsync('DELETE FROM words WHERE id = ?', id);
}

export async function resetWord(database: SQLiteDatabase, id: string) {
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE words SET state = 'new', understood_streak = 0, lapse_count = 0, next_review_at = NULL,
      last_rated_at = NULL, updated_at = ? WHERE id = ?`, now, id,
  );
}

export async function saveRating(database: SQLiteDatabase, id: string, rating: string, update: RatingUpdate) {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `UPDATE words SET state = ?, understood_streak = ?, lapse_count = ?, last_rated_at = ?,
       next_review_at = ?, updated_at = ? WHERE id = ?`,
      update.state, update.understoodStreak, update.lapseCount, update.lastRatedAt,
      update.nextReviewAt, update.lastRatedAt, id,
    );
    await transaction.runAsync(
      "INSERT INTO learning_events (word_id, type, value, occurred_at) VALUES (?, 'rating', ?, ?)",
      id, rating, update.lastRatedAt,
    );
  });
}

export async function recordView(database: SQLiteDatabase, id: string, occurredAt = new Date().toISOString()) {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      'UPDATE words SET view_count = view_count + 1, last_viewed_at = ?, updated_at = ? WHERE id = ?',
      occurredAt, occurredAt, id,
    );
    await transaction.runAsync(
      "INSERT INTO learning_events (word_id, type, occurred_at) VALUES (?, 'view', ?)", id, occurredAt,
    );
  });
}

export async function recordNotificationOpen(database: SQLiteDatabase, wordId: string | null) {
  await database.runAsync(
    "INSERT INTO learning_events (word_id, type, occurred_at) VALUES (?, 'notification_open', ?)",
    wordId, new Date().toISOString(),
  );
}

export async function getStats(database: SQLiteDatabase): Promise<DashboardStats> {
  const stateRows = await database.getAllAsync<{ state: Word['state']; count: number }>(
    'SELECT state, COUNT(*) AS count FROM words GROUP BY state',
  );
  const counts = Object.fromEntries(stateRows.map((row) => [row.state, row.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventRow = await database.getFirstAsync<{ viewed_today: number; notification_opens: number }>(
    `SELECT
      SUM(CASE WHEN type = 'view' AND occurred_at >= ? THEN 1 ELSE 0 END) AS viewed_today,
      SUM(CASE WHEN type = 'notification_open' THEN 1 ELSE 0 END) AS notification_opens
     FROM learning_events`,
    today.toISOString(),
  );
  const lifetime = await database.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(view_count), 0) AS total FROM words');
  const activityStart = new Date(today);
  activityStart.setDate(today.getDate() - 6);
  const recentViews = await database.getAllAsync<{ occurred_at: string }>(
    "SELECT occurred_at FROM learning_events WHERE type = 'view' AND occurred_at >= ? ORDER BY occurred_at",
    activityStart.toISOString(),
  );
  const activityCounts = new Map<string, number>();
  for (const event of recentViews) {
    const date = new Date(event.occurred_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1);
  }
  const recentActivity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(activityStart);
    date.setDate(activityStart.getDate() + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { date: key, count: activityCounts.get(key) ?? 0 };
  });
  const totalWords = Object.values(counts).reduce((total, value) => total + value, 0);
  return {
    totalWords, newWords: counts.new ?? 0, difficultWords: counts.cannot_remember ?? 0,
    understoodWords: counts.understood ?? 0, learnedWords: counts.learned ?? 0,
    viewedToday: eventRow?.viewed_today ?? 0, viewedLifetime: lifetime?.total ?? 0,
    notificationOpens: eventRow?.notification_opens ?? 0, recentActivity,
  };
}

export async function getReminderSettings(database: SQLiteDatabase): Promise<ReminderSettings> {
  const row = await database.getFirstAsync<{
    enabled: number; count_per_day: number; window_start_minutes: number;
    window_end_minutes: number; time_zone_id: string;
  }>('SELECT * FROM reminder_settings WHERE id = 1');
  if (!row) throw new Error('Reminder settings are missing');
  return { enabled: Boolean(row.enabled), countPerDay: row.count_per_day,
    windowStartMinutes: row.window_start_minutes, windowEndMinutes: row.window_end_minutes,
    timeZoneId: row.time_zone_id };
}

export async function saveReminderSettings(database: SQLiteDatabase, settings: ReminderSettings) {
  await database.runAsync(
    `UPDATE reminder_settings SET enabled = ?, count_per_day = ?, window_start_minutes = ?,
      window_end_minutes = ?, time_zone_id = ?, updated_at = ? WHERE id = 1`,
    settings.enabled ? 1 : 0, settings.countPerDay, settings.windowStartMinutes,
    settings.windowEndMinutes, settings.timeZoneId, new Date().toISOString(),
  );
}

export async function getContentPacks(database: SQLiteDatabase) {
  return database.getAllAsync<{ id: ContentPackId; name: string; enabled: number }>(
    'SELECT id, name, enabled FROM content_packs ORDER BY rowid',
  );
}

function parsePreferredLevels(value: string | undefined): CefrLevel[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is CefrLevel => typeof item === 'string' && isCefrLevel(item)) : [];
  } catch {
    return [];
  }
}

export async function getLearningPreferences(database: SQLiteDatabase): Promise<LearningPreferences> {
  const [levelRow, packs] = await Promise.all([
    database.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_metadata WHERE key = 'preferred_cefr_levels'",
    ),
    getContentPacks(database),
  ]);
  return normalizeLearningPreferences({
    levels: parsePreferredLevels(levelRow?.value),
    topics: packs.filter((pack) => Boolean(pack.enabled)).map((pack) => pack.id),
  });
}

async function writeLearningPreferences(database: SQLiteDatabase, rawPreferences: LearningPreferences) {
  const preferences = normalizeLearningPreferences(rawPreferences);
  await database.runAsync(
    `INSERT INTO app_metadata (key, value) VALUES ('preferred_cefr_levels', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    JSON.stringify(preferences.levels),
  );
  for (const pack of await getContentPacks(database)) {
    await database.runAsync(
      'UPDATE content_packs SET enabled = ? WHERE id = ?',
      preferences.topics.includes(pack.id) ? 1 : 0,
      pack.id,
    );
  }
}

export async function saveLearningPreferences(database: SQLiteDatabase, preferences: LearningPreferences) {
  await database.withExclusiveTransactionAsync((transaction) => writeLearningPreferences(transaction, preferences));
}

export async function isOnboardingComplete(database: SQLiteDatabase) {
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_metadata WHERE key = 'onboarding_complete'",
  );
  return row?.value === 'true';
}

export async function completeOnboarding(database: SQLiteDatabase) {
  await database.runAsync("UPDATE app_metadata SET value = 'true' WHERE key = 'onboarding_complete'");
}

export async function completeOnboardingSetup(
  database: SQLiteDatabase,
  preferences: LearningPreferences,
  starterWords: NewWordInput[],
) {
  const ids: string[] = [];
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await writeLearningPreferences(transaction, preferences);
    for (const input of starterWords) ids.push(await addWord(transaction, input));
    await completeOnboarding(transaction);
  });
  return ids;
}

export async function getLearningFilter(database: SQLiteDatabase): Promise<LearningFilter> {
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_metadata WHERE key = 'learning_filter'",
  );
  return isLearningFilter(row?.value) ? row.value : 'all';
}

export async function saveLearningFilter(database: SQLiteDatabase, filter: LearningFilter) {
  await database.runAsync(
    `INSERT INTO app_metadata (key, value) VALUES ('learning_filter', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    filter,
  );
}
