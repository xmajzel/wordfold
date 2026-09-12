import { cefrLevels } from './cefr-levels';

describe('bundled Spanish A1 production catalog', () => {
  it('is release-available without a development preview path', () => {
    jest.isolateModules(() => {
      const catalog = jest.requireActual<typeof import('./course-catalog')>('./course-catalog');
      const courses = jest.requireActual<typeof import('../domain/courses')>('../domain/courses');
      expect(catalog.getCourseCatalogEntries('es-sk', 'A1')).toHaveLength(1599);
      expect(catalog.getCourseCatalogEntryForNormalizedTerm('es-sk', 'cabeza')).toMatchObject({
        term: 'cabeza', translation: 'hlava', publicationStatus: 'production',
      });
      expect(courses.getCourseDefinition('es-sk').capabilities).toMatchObject({
        bundledCatalog: true, recommendations: false, devicePronunciation: false,
      });
      expect(cefrLevels.slice(1).every((level) => catalog.getCourseCatalogEntries('es-sk', level).length === 0)).toBe(true);
    });
  });
});
