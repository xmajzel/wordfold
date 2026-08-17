import type { Word } from '@/domain/types';
import { buildLearningFeed } from '@/features/learning/algorithm';

export function buildReminderWordCandidates(words: Word[], date = new Date()) {
  const activeWords = words.filter((word) => word.state !== 'learned');
  const ranked = buildLearningFeed(activeWords, date);
  const rankedIds = new Set(ranked.map((word) => word.id));
  const fallback = activeWords
    .filter((word) => !rankedIds.has(word.id))
    .sort((left, right) => (left.lastViewedAt ?? '').localeCompare(right.lastViewedAt ?? ''));

  return [...ranked, ...fallback];
}

export function pickReminderWord(words: Word[], date: Date, usedWordIds: Set<string>) {
  const candidates = buildReminderWordCandidates(words, date);
  const unused = candidates.find((word) => !usedWordIds.has(word.id));
  if (unused) return unused;
  usedWordIds.clear();
  return candidates[0] ?? null;
}
