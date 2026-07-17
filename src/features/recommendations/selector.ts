import { getPackTerms } from '@/data/catalog';
import { getCefrEntries } from '@/data/cefr-catalog';
import { cefrLevels } from '@/data/cefr-levels';
import type { CefrCatalogEntry, CefrLevel, ContentPackId, LearningPreferences } from '@/domain/types';

const topicOrder: ContentPackId[] = ['spoken', 'business', 'academic'];

const priorityTerms: Record<ContentPackId, string[]> = {
  spoken: ['agree', 'available', 'benefit', 'choice', 'conversation', 'explain', 'focus', 'quality', 'reason', 'support', 'understand', 'wonder'],
  business: ['stakeholder', 'deliverable', 'milestone', 'governance', 'dependency', 'alignment', 'benchmark', 'collaboration', 'constraint', 'forecast', 'portfolio', 'strategy'],
  academic: ['methodology', 'empirical', 'inference', 'validity', 'synthesis', 'hypothesis', 'variable', 'qualitative', 'quantitative', 'framework', 'correlation', 'parameter'],
};

export const topicOptions: { id: ContentPackId; title: string; description: string; icon: 'chatbubbles-outline' | 'briefcase-outline' | 'school-outline' }[] = [
  { id: 'spoken', title: 'Everyday conversations', description: 'Social situations and practical daily language', icon: 'chatbubbles-outline' },
  { id: 'business', title: 'Work and business', description: 'Meetings, projects, collaboration, and decisions', icon: 'briefcase-outline' },
  { id: 'academic', title: 'Study and research', description: 'Academic reading, evidence, writing, and analysis', icon: 'school-outline' },
];

export interface Recommendation {
  entry: CefrCatalogEntry;
  topic: ContentPackId | null;
}

export function normalizeLearningPreferences(preferences: LearningPreferences): LearningPreferences {
  return {
    levels: cefrLevels.filter((level) => preferences.levels.includes(level)),
    topics: topicOrder.filter((topic) => preferences.topics.includes(topic)),
  };
}

function uniqueTerms(topic: ContentPackId) {
  return [...new Set([...priorityTerms[topic], ...getPackTerms(topic)].map((term) => term.toLocaleLowerCase('en')))];
}

export function buildRecommendations(
  rawPreferences: LearningPreferences,
  existingNormalizedTerms: Iterable<string>,
  limit = 10,
): Recommendation[] {
  const preferences = normalizeLearningPreferences(rawPreferences);
  if (limit <= 0 || preferences.levels.length === 0 || preferences.topics.length === 0) return [];

  const existing = new Set(existingNormalizedTerms);
  const selectedLevels = new Set(preferences.levels);
  const entries = preferences.levels.flatMap(getCefrEntries);
  const byTerm = new Map(entries.map((entry) => [entry.normalizedTerm, entry]));
  const result: Recommendation[] = [];
  const added = new Set(existing);

  const queues = preferences.topics.flatMap((topic) => preferences.levels.map((level) => ({
    topic,
    level,
    entries: uniqueTerms(topic).flatMap((term) => {
      const entry = byTerm.get(term);
      return entry?.level === level ? [entry] : [];
    }),
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
      entries: getCefrEntries(level),
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
