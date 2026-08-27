import type { Word } from './types';

export type CourseId = 'en-sk' | 'es-sk';

export type CourseCatalogId = 'english-cefr' | 'spanish-cefr';

export interface CourseCapabilities {
  bundledCatalog: boolean;
  recommendations: boolean;
  onDeviceTranslation: boolean;
  devicePronunciation: boolean;
  publicNeuralPronunciation: boolean;
  privateNeuralPronunciation: boolean;
  offlinePronunciation: boolean;
}

export interface CourseDefinition {
  id: CourseId;
  displayName: string;
  directionLabel: string;
  description: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  defaultSourcePronunciationLocale: string;
  defaultTargetPronunciationLocale: string;
  catalogId: CourseCatalogId;
  capabilities: CourseCapabilities;
}

export const defaultCourseId: CourseId = 'en-sk';

export const courseDefinitions: readonly CourseDefinition[] = [
  {
    id: 'en-sk',
    displayName: 'English with Slovak hints',
    directionLabel: 'Slovak → English',
    description: 'Learn English through English definitions and Slovak hints.',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'sk',
    defaultSourcePronunciationLocale: 'en-US',
    defaultTargetPronunciationLocale: 'sk-SK',
    catalogId: 'english-cefr',
    capabilities: {
      bundledCatalog: true,
      recommendations: true,
      onDeviceTranslation: true,
      devicePronunciation: true,
      publicNeuralPronunciation: true,
      privateNeuralPronunciation: true,
      offlinePronunciation: true,
    },
  },
  {
    id: 'es-sk',
    displayName: 'Spanish with Slovak hints',
    directionLabel: 'Slovak → Spanish',
    description: 'Learn Spanish through Spanish definitions and Slovak hints.',
    sourceLanguageCode: 'es',
    targetLanguageCode: 'sk',
    defaultSourcePronunciationLocale: 'es-ES',
    defaultTargetPronunciationLocale: 'sk-SK',
    catalogId: 'spanish-cefr',
    capabilities: {
      bundledCatalog: false,
      recommendations: false,
      onDeviceTranslation: true,
      devicePronunciation: true,
      publicNeuralPronunciation: false,
      privateNeuralPronunciation: false,
      offlinePronunciation: false,
    },
  },
] as const;

const courseById = new Map(courseDefinitions.map((course) => [course.id, course]));
const courseByPair = new Map(courseDefinitions.map((course) => [
  `${course.sourceLanguageCode}:${course.targetLanguageCode}`,
  course,
]));

export function isCourseId(value: unknown): value is CourseId {
  return typeof value === 'string' && courseById.has(value as CourseId);
}

export function getCourseDefinition(courseId: CourseId): CourseDefinition {
  const course = courseById.get(courseId);
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  return course;
}

export function getCourseForLanguagePair(
  sourceLanguageCode: string,
  targetLanguageCode: string,
): CourseDefinition | null {
  return courseByPair.get(`${sourceLanguageCode}:${targetLanguageCode}`) ?? null;
}

export function getCourseForWord(word: Pick<Word, 'sourceLanguageCode' | 'targetLanguageCode'>) {
  return getCourseForLanguagePair(word.sourceLanguageCode, word.targetLanguageCode);
}

export function wordBelongsToCourse(
  word: Pick<Word, 'sourceLanguageCode' | 'targetLanguageCode'>,
  courseId: CourseId,
) {
  return getCourseForWord(word)?.id === courseId;
}
