import { buildRecommendations, normalizeLearningPreferences } from './selector';

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
