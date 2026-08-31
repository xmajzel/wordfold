import baseCatalogJson from '../../assets/catalog/cefr-catalog.json';

import { cefrLevels } from './cefr-levels';
import {
  getCourseCatalogEntries,
  getCourseCatalogEntryForNormalizedTerm,
  getSpanishCatalogPilot,
  validateSpanishCatalogAsset,
} from './course-catalog';

describe('course-aware catalog', () => {
  it('preserves the complete English catalog behind the course boundary', () => {
    const entries = cefrLevels.flatMap((level) => getCourseCatalogEntries('en-sk', level));
    expect(entries).toHaveLength(baseCatalogJson.entries.length);
    expect(entries.every((entry) => entry.courseId === 'en-sk' && entry.publicationStatus === 'production')).toBe(true);
  });

  it('keeps unreviewed Spanish pilot content out of production lookups', () => {
    expect(cefrLevels.flatMap((level) => getCourseCatalogEntries('es-sk', level))).toEqual([]);
    expect(getCourseCatalogEntryForNormalizedTerm('es-sk', 'pie')).toBeNull();

    const draftEntries = cefrLevels.flatMap((level) => getCourseCatalogEntries('es-sk', level, { includeDraft: true }));
    expect(draftEntries).toHaveLength(6);
    expect(draftEntries.map((entry) => entry.level)).toEqual(cefrLevels);
    expect(draftEntries.every((entry) => entry.catalogSenseId.startsWith('es-sk:'))).toBe(true);
  });

  it('separates cross-language homographs by course', () => {
    const english = getCourseCatalogEntryForNormalizedTerm('en-sk', 'pie');
    const spanish = getCourseCatalogEntryForNormalizedTerm('es-sk', 'pie', { includeDraft: true });

    expect(english?.sourceLanguageCode).toBe('en');
    expect(spanish).toMatchObject({
      sourceLanguageCode: 'es',
      translation: 'chodidlo',
      catalogSenseId: expect.stringMatching(/^es-sk:/),
    });
    expect(spanish?.catalogSenseId).not.toBe(english?.catalogSenseId);
  });

  it('validates the pilot manifest and rejects unreviewed production promotion', () => {
    const pilot = getSpanishCatalogPilot();
    expect(() => validateSpanishCatalogAsset(pilot)).not.toThrow();
    expect(() => validateSpanishCatalogAsset({
      ...pilot,
      publicationStatus: 'production',
    })).toThrow('not independently approved');

    expect(() => validateSpanishCatalogAsset({
      ...pilot,
      publicationStatus: 'production',
      entries: pilot.entries.map((entry) => ({
        ...entry,
        learnerContentReviewStatus: 'approved',
        hintReviewStatus: 'approved',
      })),
    })).toThrow('missing independent review and release metadata');
  });

  it('allows distinct Spanish senses to share one normalized spelling', () => {
    const pilot = getSpanishCatalogPilot();
    const first = pilot.entries[0];
    expect(() => validateSpanishCatalogAsset({
      ...pilot,
      counts: { ...pilot.counts, A1: pilot.counts.A1 + 1 },
      entries: [...pilot.entries, {
        ...first,
        id: 'es-sk:pilot:a1:pie:measure',
        catalogSenseId: 'es-sk:pilot:a1:pie:noun:2',
        definition: 'Medida antigua cuya longitud dependía del lugar.',
        example: 'La tabla mide casi un pie.',
        translation: 'stopa',
      }],
    })).not.toThrow();
  });
});
