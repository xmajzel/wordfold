import { wordBelongsToCourse, type CourseId } from '@/domain/courses';
import { filterWordsByLearningCategory } from '@/features/learning/algorithm';
import type { LearningFilter, Word } from '@/domain/types';

export const WORD_PLAY_SIZE = 10;
export type WordPlayMode = 'matching' | 'recall';
export type WordPlayEventType = 'game_seen' | 'game_missed' | 'game_answered' | 'game_relearned';

export interface WordPlayEvent {
  id: string;
  wordId: string;
  sessionId: string;
  courseId: CourseId;
  mode: WordPlayMode;
  sessionMode?: WordPlayMode;
  type: WordPlayEventType;
  occurredAt: string;
}

export interface WordPlayStats {
  gamesPlayed: number;
  needsPractice: number;
  returnedToLearning: number;
  lastPlayedAt: string | null;
  lastMode: WordPlayMode | null;
}

export const emptyWordPlayStats: WordPlayStats = {
  gamesPlayed: 0, needsPractice: 0, returnedToLearning: 0, lastPlayedAt: null, lastMode: null,
};

export interface WordPlayEventRow {
  word_id: string | null;
  type: string;
  value: string | null;
  occurred_at: string;
}

// The same value identifies every event for a word's single exercise in a session.
// Keep it independent of local word IDs so guest import can remap those IDs safely.
export function wordPlayEventValue(event: Pick<WordPlayEvent, 'sessionId' | 'mode' | 'sessionMode'>) {
  return JSON.stringify({ sessionId: event.sessionId, mode: event.mode, sessionMode: event.sessionMode });
}

export function summarizeWordPlay(rows: WordPlayEventRow[]): Record<string, WordPlayStats> {
  const result: Record<string, WordPlayStats> = {};
  const counted = new Set<string>();
  for (const row of rows) {
    if (!row.word_id || !row.value) continue;
    let value: { sessionId?: unknown; mode?: unknown; sessionMode?: unknown };
    try { value = JSON.parse(row.value); } catch { continue; }
    if (!value || typeof value.sessionId !== 'string' || !['matching', 'recall'].includes(String(value.mode))) continue;
    const stats = result[row.word_id] ??= { ...emptyWordPlayStats };
    const key = JSON.stringify([row.word_id, row.type, value.sessionId]);
    if (!counted.has(key)) {
      counted.add(key);
      if (row.type === 'game_seen') stats.gamesPlayed += 1;
      if (row.type === 'game_missed') stats.needsPractice += 1;
      if (row.type === 'game_relearned') stats.returnedToLearning += 1;
    }
    if (row.type === 'game_seen' && (!stats.lastPlayedAt || row.occurred_at > stats.lastPlayedAt)) {
      stats.lastPlayedAt = row.occurred_at;
      stats.lastMode = (value.sessionMode === 'matching' || value.sessionMode === 'recall' ? value.sessionMode : value.mode) as WordPlayMode;
    }
  }
  return result;
}

export type WordPlayRound = { mode: 'matching'; words: Word[]; answers: Word[] }
  | { mode: 'recall'; words: [Word] };

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

const labelKey = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

function canMatch(word: Word, board: Word[]) {
  const translation = word.translation?.trim();
  if (!translation || translation.length > 55 || word.term.length > 40 || /[,;/\n()]/.test(translation)) return false;
  const term = labelKey(word.term);
  const hint = labelKey(translation);
  return term !== hint && !board.some((other) => labelKey(other.term) === term
    || labelKey(other.translation!) === hint);
}

export function isWordPlayUnlocked(words: Word[], courseId: CourseId, stats: Record<string, WordPlayStats>) {
  const courseWords = words.filter((word) => wordBelongsToCourse(word, courseId));
  return courseWords.filter((word) => word.state === 'learned').length >= WORD_PLAY_SIZE
    || courseWords.some((word) => stats[word.id]?.gamesPlayed > 0);
}

export function buildWordPlaySession(
  words: Word[], courseId: CourseId, stats: Record<string, WordPlayStats>, random = Math.random, filter: LearningFilter = 'all',
): WordPlayRound[] {
  if (!isWordPlayUnlocked(words, courseId, stats)) return [];
  const eligible = filterWordsByLearningCategory(words, filter).filter((word) => word.state === 'learned' && wordBelongsToCourse(word, courseId));
  const latest = eligible.map((word) => stats[word.id]).filter((item) => item?.lastPlayedAt)
    .sort((left, right) => right.lastPlayedAt!.localeCompare(left.lastPlayedAt!))[0];
  const mode = latest?.lastMode === 'matching' ? 'recall' : 'matching';
  const selected = shuffle(eligible, random).sort((left, right) =>
    (stats[left.id]?.lastPlayedAt ?? '').localeCompare(stats[right.id]?.lastPlayedAt ?? '')).slice(0, WORD_PLAY_SIZE);
  if (mode === 'recall') return selected.map((word) => ({ mode: 'recall', words: [word] }));

  const rounds: WordPlayRound[] = [];
  let remaining = selected;
  while (remaining.length >= 5) {
    const board: Word[] = [];
    for (const word of remaining) {
      if (canMatch(word, board)) board.push(word);
      if (board.length === 5) break;
    }
    if (board.length < 5) break;
    rounds.push({ mode: 'matching', words: board, answers: shuffle(board, random) });
    const ids = new Set(board.map((word) => word.id));
    remaining = remaining.filter((word) => !ids.has(word.id));
  }
  rounds.push(...remaining.map((word): WordPlayRound => ({ mode: 'recall', words: [word] })));
  return rounds;
}
