import { wordBelongsToCourse, type CourseId } from '@/domain/courses';
import { isLearningFilter } from '@/data/cefr-levels';
import { filterWordsByLearningCategory } from '@/features/learning/algorithm';
import type { LearningFilter, Word } from '@/domain/types';

import { buildSentenceGap, type SentenceGap } from './sentence';

export const WORD_PLAY_SIZE = 10;
export type WordPlayMode = 'matching' | 'recall' | 'sentence';
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
    if (!value || typeof value.sessionId !== 'string' || !['matching', 'recall', 'sentence'].includes(String(value.mode))) continue;
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
      stats.lastMode = (value.sessionMode === 'matching' || value.sessionMode === 'recall' || value.sessionMode === 'sentence' ? value.sessionMode : value.mode) as WordPlayMode;
    }
  }
  return result;
}

export type WordPlayRound = { mode: 'matching'; words: Word[]; answers: Word[] }
  | { mode: 'recall'; words: [Word] }
  | { mode: 'sentence'; words: [Word]; gap: SentenceGap };

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

export type PlayActivity = 'surprise' | 'recall' | 'cards' | 'matching' | 'sentence';
export interface PlayConfig {
  activity: PlayActivity;
  filter: LearningFilter;
  status: 'all' | 'learning' | 'learned';
  length: 'quick' | 'all';
}
export const defaultPlayConfig: PlayConfig = { activity: 'cards', filter: 'all', status: 'all', length: 'quick' };

export function parsePlayConfig(params: Record<string, unknown>): PlayConfig {
  return {
    activity: typeof params.activity === 'string' && ['surprise', 'recall', 'cards', 'matching', 'sentence'].includes(String(params.activity)) ? params.activity as PlayActivity : defaultPlayConfig.activity,
    filter: typeof params.filter === 'string' && isLearningFilter(params.filter) ? params.filter : 'all',
    status: params.status === 'learned' || params.status === 'learning' ? params.status : defaultPlayConfig.status,
    length: params.length === 'all' ? 'all' : 'quick',
  };
}

export function scopedPlayWords(words: Word[], courseId: CourseId, config: PlayConfig) {
  return filterWordsByLearningCategory(words, config.filter).filter((word) => wordBelongsToCourse(word, courseId)
    && (config.status === 'all' || (config.status === 'learned' ? word.state === 'learned' : word.state !== 'learned')));
}

// Stable grouping makes the setup's supported count agree with the actual game.
function matchingBoards(words: Word[]): Word[][] {
  const boards: Word[][] = [];
  let remaining = words.filter((word) => canMatch(word, []));
  while (remaining.length >= 2) {
    const board: Word[] = [];
    const size = remaining.length === 6 ? 4 : 5;
    for (const word of remaining) {
      if (canMatch(word, board)) board.push(word);
      if (board.length === size) break;
    }
    if (board.length < 2) break;
    boards.push(board);
    const ids = new Set(board.map((word) => word.id));
    remaining = remaining.filter((word) => !ids.has(word.id));
  }
  return boards;
}

export function playSelection(words: Word[], courseId: CourseId, config: PlayConfig) {
  const scoped = scopedPlayWords(words, courseId, config);
  const boards = config.activity === 'matching' ? matchingBoards(scoped) : [];
  const supported = config.activity === 'matching' ? boards.flat()
    : config.activity === 'sentence' ? scoped.filter((word) => buildSentenceGap(word)) : scoped;
  let count = config.length === 'all' ? supported.length : Math.min(WORD_PLAY_SIZE, supported.length);
  if (config.activity === 'matching' && config.length === 'quick') {
    let used = 0;
    for (const board of boards) {
      const size = Math.min(board.length, WORD_PLAY_SIZE - used);
      if (size < 2) break;
      used += size;
    }
    count = used;
  }
  return { scoped, supported, boards, count };
}

export function buildWordPlaySession(
  words: Word[], courseId: CourseId, stats: Record<string, WordPlayStats>, random = Math.random,
  options: LearningFilter | PlayConfig = defaultPlayConfig,
): WordPlayRound[] {
  const config = typeof options === 'string' ? { ...defaultPlayConfig, filter: options } : options;
  if (config.activity === 'cards') return [];
  const selection = playSelection(words, courseId, config);
  if (config.activity === 'matching') {
    // Quick rounds may trim the final board, but never leave a one-pair board.
    let room = selection.count;
    return selection.boards.flatMap((board): WordPlayRound[] => {
      const selected = board.slice(0, room);
      room -= selected.length;
      return selected.length >= 2 ? [{ mode: 'matching', words: shuffle(selected, random), answers: shuffle(selected, random) }] : [];
    });
  }
  const eligible = selection.supported;
  const latest = eligible.map((word) => stats[word.id]).filter((item) => item?.lastPlayedAt)
    .sort((left, right) => right.lastPlayedAt!.localeCompare(left.lastPlayedAt!))[0];
  const selected = shuffle(eligible, random).sort((left, right) =>
    (stats[left.id]?.lastPlayedAt ?? '').localeCompare(stats[right.id]?.lastPlayedAt ?? '')).slice(0, selection.count);
  const mode = config.activity !== 'surprise' ? config.activity : latest?.lastMode === 'matching' ? 'recall'
    : latest?.lastMode === 'recall' && selected.some((word) => buildSentenceGap(word)) ? 'sentence' : 'matching';
  if (mode === 'sentence') return selected.map((word): WordPlayRound => {
    const gap = buildSentenceGap(word);
    return gap ? { mode: 'sentence', words: [word], gap } : { mode: 'recall', words: [word] };
  });
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
