import { getCefrEntries } from './cefr-catalog';
import { cefrLevels, getCefrLevelSummaries } from './cefr-levels';

describe('CEFR catalog', () => {
  it('ships all six levels with complete, unique entries', () => {
    expect(cefrLevels).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

    const entries = cefrLevels.flatMap(getCefrEntries);
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((entry) => entry.normalizedTerm)).size).toBe(entries.length);
    expect(entries.every((entry) => entry.term && entry.definition && entry.partOfSpeech && entry.catalogSenseId)).toBe(true);
  });

  it('keeps summary counts aligned with generated entries', () => {
    for (const summary of getCefrLevelSummaries()) {
      expect(summary.count).toBe(getCefrEntries(summary.level).length);
    }
  });
});
