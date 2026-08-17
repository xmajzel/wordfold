import baseCatalogJson from '../../assets/catalog/cefr-catalog.json';
import learnerAdjudicationsJson from '../../assets/catalog/cefr-learner-definition-adjudications.json';
import learnerDefinitionsJson from '../../assets/catalog/cefr-learner-definitions.json';
import learnerTranslationsJson from '../../assets/catalog/cefr-learner-translations-sk.json';
import { getCefrEntries, getCefrTranslation } from './cefr-catalog';
import { cefrLevels, getCefrLevelSummaries } from './cefr-levels';

const baseEntries = baseCatalogJson.entries;
const adjudicatedEntries = learnerAdjudicationsJson.entries;
const learnerEntries = learnerDefinitionsJson.entries;
const translatedEntries = learnerTranslationsJson.entries;
const mergedEntries = cefrLevels.flatMap(getCefrEntries);

describe('CEFR catalog', () => {
  it('ships all six levels with complete, unique entries', () => {
    expect(cefrLevels).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

    const entries = mergedEntries;
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((entry) => entry.normalizedTerm)).size).toBe(entries.length);
    expect(entries.every((entry) => entry.term && entry.definition && entry.translation && entry.partOfSpeech && entry.catalogSenseId)).toBe(true);
  });

  it('ships a one-to-one learner definition record for every catalog entry', () => {
    expect(baseEntries).toHaveLength(8300);
    expect(Object.keys(learnerEntries)).toHaveLength(baseEntries.length);

    for (const entry of baseEntries) {
      const learner = learnerEntries[entry.id as keyof typeof learnerEntries];
      expect(learner).toEqual(expect.objectContaining({
        entryId: entry.id,
        normalizedTerm: entry.normalizedTerm,
      }));
    }
  });

  it.each([
    ['bank', "A business that keeps, lends, and manages people's money.", 'noun'],
    ['present', 'Something that you give someone for a special occasion.', 'noun'],
    ['run', 'To move quickly on foot, with both feet sometimes off the ground.', 'verb'],
    ['right', 'On or toward the side opposite the left.', 'adjective'],
  ])('uses the reviewed learner meaning for %s without changing catalog identity', (term, definition, partOfSpeech) => {
    const base = baseEntries.find((entry) => entry.normalizedTerm === term);
    const merged = mergedEntries.find((entry) => entry.normalizedTerm === term);

    expect(base).toBeDefined();
    expect(merged).toEqual(expect.objectContaining({
      id: base?.id,
      catalogSenseId: base?.catalogSenseId,
      level: base?.level,
      definition,
      partOfSpeech,
    }));
  });

  it('ships one reviewed Slovak hint for every catalog entry', () => {
    expect(Object.keys(translatedEntries)).toHaveLength(baseEntries.length);
    expect(learnerTranslationsJson.qa.needsReview).toBe(0);

    for (const entry of baseEntries) {
      expect(translatedEntries[entry.id as keyof typeof translatedEntries]).toEqual(expect.objectContaining({
        entryId: entry.id,
        normalizedTerm: entry.normalizedTerm,
        needsReview: false,
      }));
    }
  });

  it('preserves every base identity and provenance field through both learner overlays', () => {
    expect(mergedEntries).toHaveLength(baseEntries.length);

    for (const base of baseEntries) {
      const merged = mergedEntries.find((entry) => entry.id === base.id);
      expect(merged).toEqual(expect.objectContaining({
        id: base.id,
        term: base.term,
        normalizedTerm: base.normalizedTerm,
        level: base.level,
        catalogSenseId: base.catalogSenseId,
        source: base.source,
        sourceVersion: base.sourceVersion,
      }));
      expect(merged?.sourcePartOfSpeech).toEqual(base.sourcePartOfSpeech);
    }
  });

  it.each([
    ['bank', 'banka'],
    ['present', 'darček'],
    ['run', 'bežať'],
    ['right', 'pravý'],
    ['balance', 'rovnováha'],
    ['completion', 'dokončenie'],
    ['mansion', 'honosné sídlo'],
    ['stroke', 'mozgová príhoda'],
    ['pinnacle', 'vrchol'],
  ])('uses the final reviewed Slovak meaning for %s', (term, translation) => {
    const base = baseEntries.find((entry) => entry.normalizedTerm === term);
    const merged = mergedEntries.find((entry) => entry.normalizedTerm === term);

    expect(base).toBeDefined();
    expect(merged).toEqual(expect.objectContaining({
      id: base?.id,
      catalogSenseId: base?.catalogSenseId,
      level: base?.level,
      translation,
    }));
  });

  it('adjudicates every review-gated definition without changing catalog identity', () => {
    const reviewGated = Object.values(learnerEntries).filter((entry) => entry.needsReview);
    expect(reviewGated).toHaveLength(56);
    expect(Object.keys(adjudicatedEntries)).toHaveLength(56);
    expect(learnerAdjudicationsJson.qa.unresolved).toBe(0);

    for (const learner of reviewGated) {
      const base = baseEntries.find((entry) => entry.id === learner.entryId);
      const adjudicated = adjudicatedEntries[learner.entryId as keyof typeof adjudicatedEntries];
      const merged = mergedEntries.find((entry) => entry.id === learner.entryId);

      expect(base).toBeDefined();
      expect(adjudicated).toEqual(expect.objectContaining({
        entryId: learner.entryId,
        normalizedTerm: learner.normalizedTerm,
        needsReview: false,
      }));
      expect(merged).toEqual(expect.objectContaining({
        id: base?.id,
        catalogSenseId: base?.catalogSenseId,
        normalizedTerm: base?.normalizedTerm,
        level: base?.level,
        definition: adjudicated.definition,
        example: adjudicated.example,
        partOfSpeech: adjudicated.partOfSpeech,
      }));
    }
  });

  it('uses a curated adjudication for the formerly gated be-verb am entry', () => {
    const base = baseEntries.find((entry) => entry.normalizedTerm === 'am');
    const merged = mergedEntries.find((entry) => entry.normalizedTerm === 'am');

    expect(base).toBeDefined();
    expect(learnerEntries[base!.id as keyof typeof learnerEntries].needsReview).toBe(true);
    expect(merged).toEqual(expect.objectContaining({
      id: base?.id,
      catalogSenseId: base?.catalogSenseId,
      level: base?.level,
      partOfSpeech: 'verb',
      definition: 'The form of the verb be used with I in the present tense.',
      example: 'I am happy to see you.',
    }));
  });

  it('keeps summary counts aligned with generated entries', () => {
    for (const summary of getCefrLevelSummaries()) {
      expect(summary.count).toBe(getCefrEntries(summary.level).length);
    }
  });

  it('finds bundled hints by catalog sense or normalized term', () => {
    const entry = getCefrEntries('A1')[0];

    expect(getCefrTranslation(entry.catalogSenseId)).toBe(entry.translation);
    expect(getCefrTranslation(null, entry.normalizedTerm)).toBe(entry.translation);
    expect(getCefrTranslation('missing', 'not-in-the-catalog')).toBeNull();
  });
});
