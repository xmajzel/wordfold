import type { LearningFilter, LearningRating, Word } from '@/domain/types';
import { cefrLevels } from '@/data/cefr-levels';

const REVIEW_INTERVAL_RANGES = [
  { minDays: 1, maxDays: 3 },
  { minDays: 3, maxDays: 5 },
  { minDays: 5, maxDays: 7 },
] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_NEW_WORD_LIMIT = 12;

export interface RatingUpdate {
  state: Word['state'];
  understoodStreak: number;
  lapseCount: number;
  lastRatedAt: string;
  nextReviewAt: string | null;
}

export function getNextReviewIntervalRange(word: Pick<Word, 'understoodStreak'>) {
  const intervalIndex = Math.min(word.understoodStreak, REVIEW_INTERVAL_RANGES.length - 1);
  return REVIEW_INTERVAL_RANGES[intervalIndex];
}

export function getNextReviewIntervalDays(
  word: Pick<Word, 'understoodStreak'>,
  random = Math.random,
) {
  const { minDays, maxDays } = getNextReviewIntervalRange(word);
  return minDays + Math.floor(random() * (maxDays - minDays + 1));
}

export function applyRating(
  word: Pick<Word, 'understoodStreak' | 'lapseCount'>,
  rating: LearningRating,
  now = new Date(),
  random = Math.random,
): RatingUpdate {
  if (rating === 'learned') {
    return {
      state: 'learned',
      understoodStreak: word.understoodStreak,
      lapseCount: word.lapseCount,
      lastRatedAt: now.toISOString(),
      nextReviewAt: null,
    };
  }

  if (rating === 'again') {
    return {
      state: 'cannot_remember',
      understoodStreak: 0,
      lapseCount: word.lapseCount + 1,
      lastRatedAt: now.toISOString(),
      nextReviewAt: new Date(now.getTime() + DAY_MS).toISOString(),
    };
  }

  const understoodStreak = word.understoodStreak + 1;
  const intervalDays = getNextReviewIntervalDays(word, random);
  return {
    state: 'understood',
    understoodStreak,
    lapseCount: word.lapseCount,
    lastRatedAt: now.toISOString(),
    nextReviewAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seededShuffle(words: Word[], seed: string) {
  return [...words].sort((left, right) => hash(`${seed}:${left.id}`) - hash(`${seed}:${right.id}`));
}

export function filterWordsByLearningCategory(words: Word[], filter: LearningFilter) {
  if (filter === 'all') return words;
  if (filter === 'personal') return words.filter((word) => word.cefrLevel === null);
  return words.filter((word) => word.cefrLevel === filter);
}

export function getAvailableLearningFilters(words: Word[]): LearningFilter[] {
  const filters: LearningFilter[] = ['all'];
  if (words.some((word) => word.cefrLevel === null)) filters.push('personal');
  for (const level of cefrLevels) {
    if (words.some((word) => word.cefrLevel === level)) filters.push(level);
  }
  return filters;
}

export function buildLearningFeed(words: Word[], now = new Date(), filter: LearningFilter = 'all'): Word[] {
  const categoryWords = filterWordsByLearningCategory(words, filter);
  const daySeed = now.toISOString().slice(0, 10);
  const unfinishedNewWords = categoryWords
    .filter((word) => word.state === 'new' && word.viewCount > 0)
    .sort((left, right) => (left.lastViewedAt ?? '').localeCompare(right.lastViewedAt ?? ''));
  const unseenNewWords = seededShuffle(
    categoryWords.filter((word) => word.state === 'new' && word.viewCount === 0),
    daySeed,
  );
  const newWords = [...unfinishedNewWords, ...unseenNewWords].slice(0, DAILY_NEW_WORD_LIMIT);
  const dueReviews = categoryWords
    .filter((word) => word.state !== 'new' && word.state !== 'learned')
    .filter((word) => word.nextReviewAt !== null && new Date(word.nextReviewAt) <= now)
    .sort((left, right) => {
      if (left.state !== right.state) return left.state === 'cannot_remember' ? -1 : 1;
      const dueDifference = (left.nextReviewAt ?? '').localeCompare(right.nextReviewAt ?? '');
      if (dueDifference !== 0) return dueDifference;
      return (left.lastViewedAt ?? '').localeCompare(right.lastViewedAt ?? '');
    });

  const feed: Word[] = [];
  let newIndex = 0;
  let reviewIndex = 0;
  while (newIndex < newWords.length || reviewIndex < dueReviews.length) {
    for (let count = 0; count < 2 && newIndex < newWords.length; count += 1) {
      feed.push(newWords[newIndex]);
      newIndex += 1;
    }
    if (reviewIndex < dueReviews.length) {
      feed.push(dueReviews[reviewIndex]);
      reviewIndex += 1;
    }
  }
  return feed;
}

export function buildContinuedLearningFeed(
  words: Word[],
  completedSessionWordIds: Iterable<string>,
  now = new Date(),
  filter: LearningFilter = 'all',
): Word[] {
  const completedIds = new Set(completedSessionWordIds);
  const remainingNewWords = words.filter((word) => word.state === 'new' && !completedIds.has(word.id));
  return buildLearningFeed(remainingNewWords, now, filter);
}
