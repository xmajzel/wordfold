import baseCatalogJson from '../../assets/catalog/cefr-catalog.json';

import { cefrLevels } from './cefr-levels';
import {
  getCourseCatalogAvailability,
  getCourseCatalogEntries,
  getCourseCatalogEntryForNormalizedTerm,
  getCourseCatalogLevelState,
  getSpanishCourseAsset,
} from './course-catalog';
import { validateSpanishCourseAsset } from './spanish-course-runtime';

describe('course-aware catalog', () => {
  it('preserves the complete English catalog behind the course boundary', () => {
    const entries = cefrLevels.flatMap((level) => getCourseCatalogEntries('en-sk', level));
    expect(entries).toHaveLength(baseCatalogJson.entries.length);
    expect(entries.every((entry) => entry.courseId === 'en-sk' && entry.publicationStatus === 'production')).toBe(true);
    expect(cefrLevels.every((level) => getCourseCatalogLevelState('en-sk', level) === 'available')).toBe(true);
  });

  it('bundles independently reviewed C2 alongside unchanged A1–C1', () => {
    expect(getCourseCatalogEntries('es-sk', 'A1')).toHaveLength(1599);
    expect(getCourseCatalogEntries('es-sk', 'C2')).toHaveLength(801);
    expect(getCourseCatalogAvailability('es-sk')).toEqual({
      total: 6689,
      counts: { A1: 1599, A2: 1763, B1: 1272, B2: 723, C1: 531, C2: 801 },
      levels: {
        A1: 'available', A2: 'available', B1: 'available',
        B2: 'available', C1: 'available', C2: 'available',
      },
      state: 'available',
    });
  });

  it('separates cross-language homographs by course', () => {
    const english = getCourseCatalogEntryForNormalizedTerm('en-sk', 'pie');
    const spanish = getCourseCatalogEntryForNormalizedTerm('es-sk', 'pie');

    expect(english?.sourceLanguageCode).toBe('en');
    expect(spanish).toMatchObject({ sourceLanguageCode: 'es', translation: 'chodidlo', catalogSenseId: 'es-sk:a1:i66149' });
    expect(spanish?.catalogSenseId).not.toBe(english?.catalogSenseId);
  });

  it('loads a valid production asset with the approved release policy', () => {
    const asset = getSpanishCourseAsset();
    expect(() => validateSpanishCourseAsset(asset)).not.toThrow();
    expect(asset).toMatchObject({
      status: 'production',
      pronunciationEnabled: true,
      counts: { concepts: 6689, terms: 6887, ownerVerdictRequiredConcepts: 47, ownerPendingConcepts: 0 },
    });
  });
});
