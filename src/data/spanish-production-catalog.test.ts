import { cefrLevels } from './cefr-levels';
import a1Asset from '../../assets/catalog/spanish/a1-course.json';
import { getCourseCatalogEntry, getCourseCatalogEntriesForNormalizedTerm, getSpanishCourseAsset } from './course-catalog';

describe('bundled Spanish A1–C2 production catalog', () => {
  it('preserves every A1 identity and presentation while excluding pending later concepts', () => {
    const asset = getSpanishCourseAsset();
    expect(asset.concepts.filter((concept) => concept.level === 'A1')).toEqual(a1Asset.concepts);
    expect(asset.excludedConcepts).toHaveLength(74);
    for (const excluded of asset.excludedConcepts ?? []) {
      expect(getCourseCatalogEntry('es-sk', excluded.id)).toBeNull();
    }
    for (const concept of asset.concepts) {
      for (const member of concept.members) {
        const entry = getCourseCatalogEntriesForNormalizedTerm('es-sk', member.normalizedTerm)
          .find((candidate) => candidate.id === member.entryId);
        expect(entry).toMatchObject({ catalogSenseId: concept.id, level: concept.level, translation: member.slovakHint });
      }
    }
  });
  it('is release-available without a development preview path', () => {
    jest.isolateModules(() => {
      const catalog = jest.requireActual<typeof import('./course-catalog')>('./course-catalog');
      const courses = jest.requireActual<typeof import('../domain/courses')>('../domain/courses');
      expect(catalog.getCourseCatalogEntries('es-sk', 'A1')).toHaveLength(1599);
      expect(catalog.getCourseCatalogEntryForNormalizedTerm('es-sk', 'cabeza')).toMatchObject({
        term: 'cabeza', translation: 'hlava', publicationStatus: 'production',
      });
      expect(courses.getCourseDefinition('es-sk').capabilities).toMatchObject({
        bundledCatalog: true, recommendations: true, devicePronunciation: true,
      });
      expect(cefrLevels.every((level) => catalog.getCourseCatalogEntries('es-sk', level).length > 0)).toBe(true);
      expect(catalog.getCourseCatalogEntries('es-sk', 'C2')).toHaveLength(801);
    });
  });
});
