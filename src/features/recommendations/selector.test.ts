import { buildRecommendations, normalizeLearningPreferences } from './selector';
import { getCourseCatalogEntries } from '@/data/course-catalog';
import type { ContentPackId } from '@/domain/types';
import spanishTopicIndex from '../../../assets/catalog/spanish/course-topic-index.json';

const reviewedTopics = spanishTopicIndex.topicsByConcept as Record<string, readonly ContentPackId[]>;
const spanishLevels = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
const interests = ['spoken', 'business', 'academic'] as const;

describe('recommendation selector', () => {
  it('keeps levels as a strict boundary while prioritizing selected topics', () => {
    const recommendations = buildRecommendations({ levels: ['A2'], topics: ['business'] }, [], 10);

    expect(recommendations).toHaveLength(10);
    expect(recommendations.every(({ entry }) => entry.level === 'A2')).toBe(true);
    expect(recommendations.some(({ topic }) => topic === 'business')).toBe(true);
  });

  it('falls back to general level words when a topic has no direct matches', () => {
    const recommendations = buildRecommendations({ levels: ['C1'], topics: ['spoken'] }, [], 10);

    expect(recommendations).toHaveLength(10);
    expect(recommendations.every(({ entry }) => entry.level === 'C1')).toBe(true);
    expect(recommendations.every(({ topic }) => topic === null)).toBe(true);
  });

  it('balances multiple selected levels and topics', () => {
    const recommendations = buildRecommendations(
      { levels: ['B1', 'B2'], topics: ['business', 'academic'] },
      [],
      10,
    );

    expect(new Set(recommendations.map(({ entry }) => entry.level))).toEqual(new Set(['B1', 'B2']));
    expect(new Set(recommendations.flatMap(({ topic }) => topic ? [topic] : []))).toEqual(new Set(['business', 'academic']));
  });

  it('excludes existing terms and respects the requested limit', () => {
    const first = buildRecommendations({ levels: ['A1'], topics: ['spoken'] }, [], 4);
    const next = buildRecommendations(
      { levels: ['A1'], topics: ['spoken'] },
      first.map(({ entry }) => entry.normalizedTerm),
      4,
    );

    expect(next).toHaveLength(4);
    expect(next.some(({ entry }) => first.some(({ entry: previous }) => previous.normalizedTerm === entry.normalizedTerm))).toBe(false);
  });

  it('normalizes duplicate and out-of-order preferences', () => {
    expect(normalizeLearningPreferences({
      levels: ['C2', 'A1', 'C2'],
      topics: ['academic', 'spoken', 'academic'],
    })).toEqual({ levels: ['A1', 'C2'], topics: ['spoken', 'academic'] });
  });
});

describe('Spanish recommendations', () => {
  it.each(spanishLevels.flatMap((level) => interests.map((topic) => ({ level, topic }))))(
    'provides three distinct batches with reviewed $topic meanings at $level',
    ({ level, topic }) => {
      const existing = new Set<string>();
      const preferences = { levels: [level], topics: [topic] };
      for (let batch = 0; batch < 3; batch += 1) {
        const result = buildRecommendations(preferences, existing, 10, 'es-sk');
        expect(result).toHaveLength(10);
        for (const recommendation of result) {
          expect(recommendation.entry.courseId).toBe('es-sk');
          expect(recommendation.entry.level).toBe(level);
          expect(existing.has(recommendation.entry.normalizedTerm)).toBe(false);
          expect(recommendation.topic).toBe(topic);
          expect(reviewedTopics[recommendation.entry.catalogSenseId!]).toContain(topic);
          existing.add(recommendation.entry.normalizedTerm);
        }
      }
      expect(existing.size).toBe(30);
    },
  );

  it.each(spanishLevels)('changes the first set for different interests at %s', (level) => {
    const sets = interests.map((topic) => buildRecommendations({ levels: [level], topics: [topic] }, [], 10, 'es-sk')
      .map(({ entry }) => entry.catalogSenseId).sort().join(','));
    expect(new Set(sets).size).toBe(3);
  });

  it('uses general fallback only after unused reviewed topic matches are exhausted', () => {
    const level = 'A2';
    const matches = getCourseCatalogEntries('es-sk', level)
      .filter((entry) => reviewedTopics[entry.catalogSenseId!].includes('academic'));
    const existing = matches.map(({ normalizedTerm }) => normalizedTerm);
    const result = buildRecommendations({ levels: [level], topics: ['academic'] }, existing, 10, 'es-sk');
    expect(result).toHaveLength(10);
    expect(result.every(({ topic, entry }) => topic === null && !existing.includes(entry.normalizedTerm))).toBe(true);
  });

  it('distinguishes the friendship and military meanings of amigo', () => {
    expect(reviewedTopics['es-sk:a1:i90098']).toContain('spoken');
    expect(reviewedTopics['es-sk:a2:i5911']).toEqual([]);
  });

  it('uses direct business and research meanings without tagging every specialist noun', () => {
    expect(reviewedTopics['es-sk:b2:i25503']).toEqual(['business']); // negociar: discuss agreement terms
    expect(reviewedTopics['es-sk:b2:i14445']).toEqual(['academic']); // académico: related to teaching/research
    expect(reviewedTopics['es-sk:c1:i67795']).toContain('academic'); // hipótesis
    expect(reviewedTopics['es-sk:c1:i48554']).toEqual([]); // armadillo
  });

  it.each(['spoken', 'business', 'academic'] as const)('prioritizes %s within the selected levels', (topic) => {
    const result = buildRecommendations({ levels: ['A1', 'A2'], topics: [topic] }, [], 10, 'es-sk');
    expect(result).toHaveLength(10);
    expect(result.some((item) => item.topic === topic)).toBe(true);
    expect(result.every(({ entry }) => entry.courseId === 'es-sk' && ['A1', 'A2'].includes(entry.level))).toBe(true);
  });

  it('excludes existing words and respects capacity', () => {
    const preferences = { levels: ['A1'] as const, topics: ['spoken'] as const };
    const input = { levels: [...preferences.levels], topics: [...preferences.topics] };
    const first = buildRecommendations(input, [], 10, 'es-sk');
    const next = buildRecommendations(input, first.map(({ entry }) => entry.normalizedTerm), 3, 'es-sk');
    expect(next).toHaveLength(3);
    expect(next.every(({ entry }) => !first.some((item) => item.entry.catalogSenseId === entry.catalogSenseId))).toBe(true);
    expect(buildRecommendations(input, [], 0, 'es-sk')).toEqual([]);

  });

  it('returns only the remaining words when the catalog is nearly exhausted', () => {
    const input = { levels: ['A1'] as const, topics: ['spoken'] as const };
    const preferences = { levels: [...input.levels], topics: [...input.topics] };
    const all = buildRecommendations(preferences, [], 10000, 'es-sk');
    const remaining = buildRecommendations(preferences, all.slice(2).map(({ entry }) => entry.normalizedTerm), 10, 'es-sk');
    expect(remaining).toEqual(all.slice(0, 2));
  });
  it('offers all 801 C2 entries through general fallback without inventing reviewed interest tags', () => {
    const input = { levels: ['C2'] as const, topics: ['academic'] as const };
    const preferences = { levels: [...input.levels], topics: [...input.topics] };
    const all = buildRecommendations(preferences, [], 10000, 'es-sk');
    expect(all).toHaveLength(801);
    expect(all.every(({ entry, topic }) => entry.level === 'C2' && topic === null)).toBe(true);
    const next = buildRecommendations(preferences, all.slice(0, 10).map(({ entry }) => entry.normalizedTerm), 3, 'es-sk');
    expect(next).toEqual(all.slice(10, 13));
  });

});
