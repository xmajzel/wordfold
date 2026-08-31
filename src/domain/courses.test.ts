import {
  courseDefinitions,
  defaultCourseId,
  getCourseDefinition,
  getCourseForLanguagePair,
  isCourseId,
  wordBelongsToCourse,
} from './courses';

describe('course registry', () => {
  it('defines the existing English and approved Spanish courses unambiguously', () => {
    expect(courseDefinitions.map((course) => course.id)).toEqual(['en-sk', 'es-sk']);
    expect(defaultCourseId).toBe('en-sk');
    expect(getCourseDefinition('es-sk')).toMatchObject({
      directionLabel: 'Slovak → Spanish',
      sourceLanguageCode: 'es',
      targetLanguageCode: 'sk',
      defaultSourcePronunciationLocale: 'es-ES',
      defaultTargetPronunciationLocale: 'sk-SK',
      catalogId: 'spanish-cefr',
    });
  });

  it('derives course identity from both language fields', () => {
    expect(getCourseForLanguagePair('en', 'sk')?.id).toBe('en-sk');
    expect(getCourseForLanguagePair('es', 'sk')?.id).toBe('es-sk');
    expect(getCourseForLanguagePair('sk', 'es')).toBeNull();
    expect(wordBelongsToCourse({ sourceLanguageCode: 'es', targetLanguageCode: 'sk' }, 'es-sk')).toBe(true);
    expect(wordBelongsToCourse({ sourceLanguageCode: 'es', targetLanguageCode: 'en' }, 'es-sk')).toBe(false);
  });

  it('validates only registered course ids', () => {
    expect(isCourseId('en-sk')).toBe(true);
    expect(isCourseId('es-sk')).toBe(true);
    expect(isCourseId('sk-es')).toBe(false);
  });
});
