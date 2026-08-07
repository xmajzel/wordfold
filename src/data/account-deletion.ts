import type { SQLiteDatabase } from 'expo-sqlite';

import type { CefrLevel, Collection, Word } from '@/domain/types';

export const ACCOUNT_DELETION_MARKER_KEY = 'account_deletion_recovery';

type SyncReader = {
  readTransaction<T>(callback: (transaction: { getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> }) => Promise<T>): Promise<T>;
};

type LearningEventSnapshot = {
  wordId: string | null;
  type: 'view' | 'rating' | 'notification_open';
  value: string | null;
  occurredAt: string;
};

export type AccountVocabularySnapshot = {
  accountId: string;
  collections: Collection[];
  words: Word[];
  learningEvents: LearningEventSnapshot[];
  createdAt: string;
};

type SyncWordRow = {
  id: string; collection_id: string; term: string; normalized_term: string;
  source_language_code: string; target_language_code: string;
  source_pronunciation_locale: string; target_pronunciation_locale: string;
  part_of_speech: string | null; definition: string; example: string | null;
  translation: string | null; catalog_sense_id: string | null; cefr_level: CefrLevel | null;
  source: Word['source']; state: Word['state']; understood_streak: number; lapse_count: number;
  view_count: number; last_viewed_at: string | null; last_rated_at: string | null;
  next_review_at: string | null; created_at: string; updated_at: string;
};

function toWord(row: SyncWordRow): Word {
  return {
    id: row.id, collectionId: row.collection_id, term: row.term, normalizedTerm: row.normalized_term,
    sourceLanguageCode: row.source_language_code, targetLanguageCode: row.target_language_code,
    sourcePronunciationLocale: row.source_pronunciation_locale,
    targetPronunciationLocale: row.target_pronunciation_locale,
    partOfSpeech: row.part_of_speech, definition: row.definition, example: row.example,
    translation: row.translation, catalogSenseId: row.catalog_sense_id, cefrLevel: row.cefr_level,
    source: row.source, state: row.state, understoodStreak: row.understood_streak,
    lapseCount: row.lapse_count, viewCount: row.view_count, lastViewedAt: row.last_viewed_at,
    lastRatedAt: row.last_rated_at, nextReviewAt: row.next_review_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function readAccountVocabularySnapshot(
  database: SyncReader,
  accountId: string,
): Promise<AccountVocabularySnapshot> {
  if (!accountId) throw new Error('A signed-in account is required.');
  return database.readTransaction(async (transaction) => {
    const [collectionRows, wordRows, eventRows] = await Promise.all([
      transaction.getAll<{
        id: string; name: string; color: string; created_at: string; updated_at: string;
      }>(`SELECT id, name, color, created_at, updated_at FROM collections
          WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at`, [accountId]),
      transaction.getAll<SyncWordRow>(
        'SELECT * FROM words WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at',
        [accountId],
      ),
      transaction.getAll<{
        word_id: string | null; type: LearningEventSnapshot['type']; value: string | null; occurred_at: string;
      }>(`SELECT word_id, type, value, occurred_at FROM learning_events
          WHERE user_id = ? ORDER BY occurred_at`, [accountId]),
    ]);
    return {
      accountId,
      collections: collectionRows.map((row) => ({
        id: row.id, name: row.name, color: row.color, createdAt: row.created_at, updatedAt: row.updated_at,
      })),
      words: wordRows.map(toWord),
      learningEvents: eventRows.map((row) => ({
        wordId: row.word_id, type: row.type, value: row.value, occurredAt: row.occurred_at,
      })),
      createdAt: new Date().toISOString(),
    };
  });
}

export async function replaceGuestVocabularyWithSnapshot(
  database: SQLiteDatabase,
  snapshot: AccountVocabularySnapshot,
) {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const collectionIds = new Set(snapshot.collections.map((collection) => collection.id));
    if (snapshot.words.some((word) => !collectionIds.has(word.collectionId))) {
      throw new Error('The synchronized vocabulary snapshot is incomplete.');
    }
    await transaction.execAsync(`
      DELETE FROM scheduled_reminders;
      DELETE FROM learning_events;
      DELETE FROM words;
      DELETE FROM collections;
    `);
    const collections = snapshot.collections.length > 0 ? snapshot.collections : [{
      id: 'my-words', name: 'My words', color: '#4F4DBB',
      createdAt: snapshot.createdAt, updatedAt: snapshot.createdAt,
    }];
    for (const collection of collections) {
      await transaction.runAsync(
        'INSERT INTO collections (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        collection.id, collection.name, collection.color, collection.createdAt, collection.updatedAt,
      );
    }
    for (const word of snapshot.words) {
      await transaction.runAsync(
        `INSERT INTO words (
          id, collection_id, term, normalized_term, source_language_code, target_language_code,
          source_pronunciation_locale, target_pronunciation_locale, part_of_speech, definition,
          example, translation, catalog_sense_id, cefr_level, source, state, understood_streak,
          lapse_count, view_count, last_viewed_at, last_rated_at, next_review_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        word.id, word.collectionId, word.term, word.normalizedTerm,
        word.sourceLanguageCode, word.targetLanguageCode,
        word.sourcePronunciationLocale, word.targetPronunciationLocale,
        word.partOfSpeech, word.definition, word.example, word.translation,
        word.catalogSenseId, word.cefrLevel, word.source, word.state,
        word.understoodStreak, word.lapseCount, word.viewCount,
        word.lastViewedAt, word.lastRatedAt, word.nextReviewAt, word.createdAt, word.updatedAt,
      );
    }
    const wordIds = new Set(snapshot.words.map((word) => word.id));
    for (const event of snapshot.learningEvents) {
      await transaction.runAsync(
        'INSERT INTO learning_events (word_id, type, value, occurred_at) VALUES (?, ?, ?, ?)',
        event.wordId && wordIds.has(event.wordId) ? event.wordId : null,
        event.type, event.value, event.occurredAt,
      );
    }
    await transaction.runAsync(
      'INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)',
      ACCOUNT_DELETION_MARKER_KEY,
      JSON.stringify({ version: 1, accountId: snapshot.accountId, phase: 'prepared', createdAt: snapshot.createdAt }),
    );
    const foreignKeyErrors = await transaction.getAllAsync<{ table: string }>('PRAGMA foreign_key_check');
    if (foreignKeyErrors.length > 0) throw new Error('The local vocabulary copy could not be verified.');
  });
}

export async function clearAccountDeletionMarker(database: SQLiteDatabase) {
  await database.runAsync('DELETE FROM app_metadata WHERE key = ?', ACCOUNT_DELETION_MARKER_KEY);
}

export async function finalizeLocalAccountDeletion(database: SQLiteDatabase, accountId: string) {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM sync_imports WHERE account_id = ?', accountId);
    await transaction.runAsync('DELETE FROM sync_cutovers WHERE account_id = ?', accountId);
    await transaction.runAsync('DELETE FROM app_metadata WHERE key = ?', ACCOUNT_DELETION_MARKER_KEY);
  });
}
