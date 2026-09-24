import type { SQLiteDatabase } from 'expo-sqlite';
import { getCourseDefinition } from '@/domain/courses';
import { summarizeWordPlay, wordPlayEventValue, type WordPlayEvent, type WordPlayEventRow } from '@/features/word-play/model';

const HISTORY_SQL = `SELECT word_id, type, value, occurred_at FROM learning_events
  WHERE type IN ('game_seen', 'game_missed', 'game_answered', 'game_relearned')`;
const DUPLICATE_SQL = 'SELECT id FROM learning_events WHERE word_id = ? AND type = ? AND value = ? LIMIT 1';
const RESET_SQL = `UPDATE words SET state = 'cannot_remember', understood_streak = 0, known_streak = 0,
  next_review_at = ?, updated_at = ? WHERE id = ?`;

interface GameWordRow { state: string; source_language_code: string; target_language_code: string }
function validateWord(word: GameWordRow | undefined, event: WordPlayEvent) {
  const course = getCourseDefinition(event.courseId);
  if (!word || word.source_language_code !== course.sourceLanguageCode || word.target_language_code !== course.targetLanguageCode) {
    throw new Error('This word is no longer available in this language.');
  }
  if (event.type === 'game_relearned' && word.state !== 'learned') {
    throw new Error('This word is already in regular practice. Deselect it to continue.');
  }
}

export async function getGuestWordPlayStats(database: SQLiteDatabase) {
  return summarizeWordPlay(await database.getAllAsync<WordPlayEventRow>(HISTORY_SQL));
}

export async function recordGuestWordPlayEvent(database: SQLiteDatabase, event: WordPlayEvent) {
  const value = wordPlayEventValue(event);
  await database.withExclusiveTransactionAsync(async (transaction) => {
    if (await transaction.getFirstAsync(DUPLICATE_SQL, event.wordId, event.type, value)) return;
    const word = await transaction.getFirstAsync<GameWordRow>('SELECT * FROM words WHERE id = ?', event.wordId);
    validateWord(word ?? undefined, event);
    if (event.type === 'game_relearned') {
      await transaction.runAsync(RESET_SQL, event.occurredAt, event.occurredAt, event.wordId);
    }
    await transaction.runAsync(
      'INSERT INTO learning_events (word_id, type, value, occurred_at) VALUES (?, ?, ?, ?)',
      event.wordId, event.type, value, event.occurredAt,
    );
  });
}

interface GameSyncTransaction {
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
  execute(sql: string, parameters?: unknown[]): Promise<unknown>;
}
interface GameSyncDatabase extends GameSyncTransaction {
  writeTransaction<T>(callback: (transaction: GameSyncTransaction) => Promise<T>): Promise<T>;
}

export async function getSyncWordPlayStats(database: GameSyncDatabase) {
  return summarizeWordPlay(await database.getAll<WordPlayEventRow>(HISTORY_SQL));
}

export async function recordSyncWordPlayEvent(database: GameSyncDatabase, userId: string, event: WordPlayEvent) {
  const value = wordPlayEventValue(event);
  await database.writeTransaction(async (transaction) => {
    if ((await transaction.getAll(DUPLICATE_SQL, [event.wordId, event.type, value])).length) return;
    const [word] = await transaction.getAll<GameWordRow>('SELECT * FROM words WHERE id = ? AND deleted_at IS NULL', [event.wordId]);
    validateWord(word, event);
    if (event.type === 'game_relearned') {
      await transaction.execute(RESET_SQL, [event.occurredAt, event.occurredAt, event.wordId]);
    }
    await transaction.execute(
      'INSERT INTO learning_events (id, user_id, word_id, type, value, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      [event.id, userId, event.wordId, event.type, value, event.occurredAt],
    );
  });
}
