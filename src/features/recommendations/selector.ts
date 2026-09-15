import { getPackTerms } from '@/data/catalog';
import { getCourseCatalogEntries, type CourseCatalogEntry } from '@/data/course-catalog';
import type { CourseId } from '@/domain/courses';
import { cefrLevels } from '@/data/cefr-levels';
import type { CefrLevel, ContentPackId, LearningPreferences } from '@/domain/types';
import spanishTopicIndex from '../../../assets/catalog/spanish/course-topic-index.json';

const topicOrder: ContentPackId[] = ['spoken', 'business', 'academic'];

const supplementalTerms: Record<ContentPackId, string[]> = {
  spoken: ['agree', 'available', 'benefit', 'choice', 'conversation', 'explain', 'focus', 'quality', 'reason', 'support', 'understand', 'wonder'],
  business: ['stakeholder', 'deliverable', 'milestone', 'governance', 'dependency', 'alignment', 'benchmark', 'collaboration', 'constraint', 'forecast', 'portfolio', 'strategy'],
  academic: ['methodology', 'empirical', 'inference', 'validity', 'synthesis', 'hypothesis', 'variable', 'qualitative', 'quantitative', 'framework', 'correlation', 'parameter'],
};

const spanishTopics = spanishTopicIndex.topicsByConcept as Record<string, readonly ContentPackId[]>;

export const topicOptions: { id: ContentPackId; title: string; description: string; icon: 'chatbubbles-outline' | 'briefcase-outline' | 'school-outline' }[] = [
  { id: 'spoken', title: 'Everyday conversations', description: 'Social situations and practical daily language', icon: 'chatbubbles-outline' },
  { id: 'business', title: 'Work and business', description: 'Meetings, projects, collaboration, and decisions', icon: 'briefcase-outline' },
  { id: 'academic', title: 'Study and research', description: 'Academic reading, evidence, writing, and analysis', icon: 'school-outline' },
];

export interface Recommendation {
  entry: CourseCatalogEntry;
  topic: ContentPackId | null;
}

export function normalizeLearningPreferences(preferences: LearningPreferences): LearningPreferences {
  return {
    levels: cefrLevels.filter((level) => preferences.levels.includes(level)),
    topics: topicOrder.filter((topic) => preferences.topics.includes(topic)),
  };
}

function uniqueTerms(topic: ContentPackId) {
  return [...new Set([...supplementalTerms[topic], ...getPackTerms(topic)].map((term) => term.toLocaleLowerCase('en')))];
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function buildRecommendations(
  rawPreferences: LearningPreferences,
  existingNormalizedTerms: Iterable<string>,
  limit = 10,
  courseId: CourseId = 'en-sk',
  random: () => number = Math.random,
): Recommendation[] {
  const preferences = normalizeLearningPreferences(rawPreferences);
  if (limit <= 0 || preferences.levels.length === 0 || preferences.topics.length === 0) return [];

  const existing = new Set(existingNormalizedTerms);
  const selectedLevels = new Set(preferences.levels);
  const entries = preferences.levels.flatMap((level) => getCourseCatalogEntries(courseId, level));
  const byTerm = new Map(entries.map((entry) => [entry.normalizedTerm, entry]));
  const result: Recommendation[] = [];
  const added = new Set(existing);
  for (const entry of entries) {
    if (entry.alternativeTerms?.some((term) => existing.has(term.toLocaleLowerCase('es')))) {
      added.add(entry.normalizedTerm);
    }
  }

  const queues = preferences.topics.flatMap((topic) => preferences.levels.map((level) => ({
    topic,
    level,
    entries: shuffled(courseId === 'es-sk'
      ? entries.filter((entry) => entry.level === level && spanishTopics[entry.catalogSenseId ?? '']?.includes(topic))
      : uniqueTerms(topic).flatMap((term) => {
        const entry = byTerm.get(term);
        return entry?.level === level ? [entry] : [];
      }), random),
    index: 0,
  })));

  let progressed = true;
  while (result.length < limit && progressed) {
    progressed = false;
    for (const queue of queues) {
      while (queue.index < queue.entries.length && added.has(queue.entries[queue.index].normalizedTerm)) queue.index += 1;
      const entry = queue.entries[queue.index];
      if (!entry) continue;
      queue.index += 1;
      result.push({ entry, topic: queue.topic });
      added.add(entry.normalizedTerm);
      progressed = true;
      if (result.length >= limit) break;
    }
  }

  if (result.length < limit) {
    const fallbackQueues = preferences.levels.map((level) => ({
      entries: shuffled(getCourseCatalogEntries(courseId, level), random),
      index: 0,
    }));
    progressed = true;
    while (result.length < limit && progressed) {
      progressed = false;
      for (const queue of fallbackQueues) {
        while (queue.index < queue.entries.length && added.has(queue.entries[queue.index].normalizedTerm)) queue.index += 1;
        const entry = queue.entries[queue.index];
        if (!entry || !selectedLevels.has(entry.level as CefrLevel)) continue;
        queue.index += 1;
        result.push({ entry, topic: null });
        added.add(entry.normalizedTerm);
        progressed = true;
        if (result.length >= limit) break;
      }
    }
  }

  return result;
}

/** Save the reviewed selection, rechecking eligibility without filling it with unseen words. */
export function resolveRecommendations(
  preferences: LearningPreferences,
  existingNormalizedTerms: Iterable<string>,
  limit: number,
  courseId: CourseId,
  preview?: readonly Recommendation[],
): Recommendation[] {
  if (!preview) return buildRecommendations(preferences, existingNormalizedTerms, limit, courseId);
  if (limit <= 0 || preview.length === 0) return [];
  const eligible = new Map(buildRecommendations(
    preferences, existingNormalizedTerms, Infinity, courseId, () => 0,
  ).map((recommendation) => [recommendation.entry.id, recommendation]));
  const result: Recommendation[] = [];
  for (const { entry } of preview) {
    const recommendation = eligible.get(entry.id);
    if (entry.courseId !== courseId || !recommendation) continue;
    result.push(recommendation);
    eligible.delete(entry.id);
    if (result.length >= limit) break;
  }
  return result;
}
