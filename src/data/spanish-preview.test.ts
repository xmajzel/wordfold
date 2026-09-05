import { cefrLevels } from './cefr-levels';
import expansion from '../../assets/catalog/spanish/expansion-candidates.json';

describe('local Spanish multi-level preview', () => {
  const originalFlag = process.env.EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED;
  const originalDev = __DEV__;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED;
    else process.env.EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED = originalFlag;
    Object.assign(globalThis, { __DEV__: originalDev });
  });

  function withCatalog(dev: boolean, flag: string | undefined, check: (catalog: typeof import('./course-catalog'), courses: typeof import('../domain/courses')) => void) {
    Object.assign(globalThis, { __DEV__: dev });
    if (flag === undefined) delete process.env.EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED;
    else process.env.EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED = flag;
    jest.isolateModules(() => check(jest.requireActual('./course-catalog'), jest.requireActual('../domain/courses')));
  }

  it('preserves all 500 original A1 words and adds reviewed supplemental levels without claiming human approval', () => {
    withCatalog(true, 'true', (catalog, courses) => {
      const entries = catalog.getCourseCatalogEntries('es-sk', 'A1');
      expect(entries).toHaveLength(500 + expansion.counts.A1);
      for (const level of cefrLevels) {
        const actual = catalog.getCourseCatalogEntries('es-sk', level);
        expect(actual).toHaveLength(expansion.counts[level] + (level === 'A1' ? 500 : 0));
        expect(actual.every((entry) => entry.level === level && entry.publicationStatus === 'draft')).toBe(true);
        for (const candidate of expansion.entries.filter((entry) => entry.level === level)) {
          expect(catalog.getCourseCatalogEntry('es-sk', candidate.catalogSenseId)).toMatchObject({
            term: candidate.term, definition: candidate.definition, example: candidate.example,
            translation: candidate.translation, level, gender: candidate.gender,
          });
          expect(catalog.getCourseCatalogTranslation('es-sk', candidate.catalogSenseId)).toBe(candidate.translation);
          expect(catalog.getCourseCatalogEntriesForNormalizedTerm('es-sk', candidate.normalizedTerm)
            .some((entry) => entry.catalogSenseId === candidate.catalogSenseId)).toBe(true);
        }
      }
      expect(entries.every((entry) => entry.publicationStatus === 'draft' && entry.learnerContentReviewStatus === 'draft' && entry.hintReviewStatus === 'draft')).toBe(true);
      const cabeza = entries.find((entry) => entry.term === 'cabeza')!;
      expect(cabeza).toMatchObject({ courseId: 'es-sk', translation: 'hlava', sourceLanguageCode: 'es', targetLanguageCode: 'sk', gender: 'feminine' });
      expect(catalog.getCourseCatalogEntry('es-sk', cabeza.catalogSenseId)).toEqual(cabeza);
      expect(catalog.getCourseCatalogEntryForNormalizedTerm('es-sk', 'cabeza')).toEqual(cabeza);
      expect(catalog.getCourseCatalogEntriesForNormalizedTerm('es-sk', 'cabeza')).toEqual([cabeza]);
      expect(catalog.getCourseCatalogTranslation('es-sk', cabeza.catalogSenseId)).toBe('hlava');
      expect(catalog.getCourseCatalogTranslation('es-sk', null, 'cabeza')).toBe('hlava');
      expect(courses.getCourseDefinition('es-sk').capabilities).toMatchObject({ bundledCatalog: true, recommendations: false, devicePronunciation: true });
      expect(courses.getCourseDefinition('es-sk').defaultSourcePronunciationLocale).toBe('es-ES');
      expect(entries.some((entry) => 'semanticReference' in entry || 'lexicalEvidence' in entry)).toBe(false);
      expect(catalog.getCourseCatalogEntryForNormalizedTerm('en-sk', 'pie')?.sourceLanguageCode).toBe('en');
      expect(catalog.getCourseCatalogAvailability('es-sk')).toEqual({
        total: 500 + expansion.entries.length, counts: { ...expansion.counts, A1: 500 + expansion.counts.A1 }, isPreview: true, state: 'preview',
      });
      expect(catalog.getCourseCatalogAvailability('en-sk')).toMatchObject({ isPreview: false, state: 'available' });
    });
  });

  it.each([[false, 'true'], [true, undefined], [true, 'false']] as const)('keeps normal Spanish lookups gated with dev=%s flag=%s', (dev, flag) => {
    withCatalog(dev, flag, (catalog, courses) => {
      expect(cefrLevels.flatMap((level) => catalog.getCourseCatalogEntries('es-sk', level))).toEqual([]);
      expect(catalog.getCourseCatalogEntryForNormalizedTerm('es-sk', 'cabeza')).toBeNull();
      expect(courses.getCourseDefinition('es-sk').capabilities.bundledCatalog).toBe(false);
      expect(catalog.getCourseCatalogAvailability('es-sk')).toEqual({
        total: 0, counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 }, isPreview: false, state: 'unavailable',
      });
    });
  });
});
