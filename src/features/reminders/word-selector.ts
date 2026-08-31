import { wordBelongsToCourse, type CourseId } from '@/domain/courses';
import type { Word } from '@/domain/types';
import { buildLearningFeed } from '@/features/learning/algorithm';

export function buildReminderWordCandidates(words: Word[], date = new Date(), courseId?: CourseId) {
  const activeWords = words.filter((word) => word.state !== 'learned'
    && (!courseId || wordBelongsToCourse(word, courseId)));
  const ranked = buildLearningFeed(activeWords, date);
  const rankedIds = new Set(ranked.map((word) => word.id));
  const fallback = activeWords
    .filter((word) => !rankedIds.has(word.id))
    .sort((left, right) => (left.lastViewedAt ?? '').localeCompare(right.lastViewedAt ?? ''));

  return [...ranked, ...fallback];
}

export function pickReminderWord(words: Word[], date: Date, usedWordIds: Set<string>, courseId?: CourseId) {
  const candidates = buildReminderWordCandidates(words, date, courseId);
  const unused = candidates.find((word) => !usedWordIds.has(word.id));
  if (unused) return unused;
  usedWordIds.clear();
  return candidates[0] ?? null;
}
