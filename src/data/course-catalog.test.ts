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

  it('bundles Spanish A1–C1 while leaving C2 unsupported', () => {
    expect(getCourseCatalogEntries('es-sk', 'A1')).toHaveLength(1599);
    expect(getCourseCatalogEntries('es-sk', 'C2')).toHaveLength(0);
    expect(getCourseCatalogAvailability('es-sk')).toEqual({
      total: 5888,
      counts: { A1: 1599, A2: 1763, B1: 1272, B2: 723, C1: 531, C2: 0 },
      levels: {
        A1: 'available', A2: 'available', B1: 'available',
        B2: 'available', C1: 'available', C2: 'unsupported-by-source',
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
      pronunciationEnabled: false,
      counts: { concepts: 5888, terms: 6086, ownerVerdictRequiredConcepts: 47, ownerPendingConcepts: 0 },
    });
  });
});
