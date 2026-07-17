import type { SQLiteDatabase } from 'expo-sqlite';

import personalVocabulary from '../../assets/seed/personal-vocabulary.json';

const COLLECTION_COLORS: Record<string, string> = {
  'ux-ui': '#EE6FA8',
  'project-management': '#6C63E8',
  'headway-upper-intermediate': '#27A8A2',
};

export async function seedPersonalVocabulary(database: SQLiteDatabase) {
  const now = new Date().toISOString();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const collection of personalVocabulary.collections) {
      await transaction.runAsync(
        `INSERT OR IGNORE INTO collections (id, name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        collection.id,
        collection.name,
        COLLECTION_COLORS[collection.id] ?? '#6C63E8',
        now,
        now,
      );
    }

    for (const word of personalVocabulary.words) {
      await transaction.runAsync(
        `INSERT OR IGNORE INTO words
          (id, collection_id, term, normalized_term, source_language_code, target_language_code,
           part_of_speech, definition, example, translation, catalog_sense_id, source, state,
           understood_streak, lapse_count, view_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'en', 'sk', ?, ?, ?, ?, ?, 'manual', 'new', 0, 0, 0, ?, ?)`,
        word.id,
        word.collectionId,
        word.term,
        word.normalizedTerm,
        word.partOfSpeech,
        word.definition,
        word.example,
        word.translation,
        word.catalogSenseId,
        now,
        now,
      );
    }
  });
}
