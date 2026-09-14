import spanishJson from '../../assets/catalog/spanish/course.json';

import type { CourseId } from '@/domain/courses';
import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';

import {
  getCefrEntries,
  getCefrEntry,
  getCefrEntryForNormalizedTerm,
  getCefrTranslation,
} from './cefr-catalog';
import { cefrLevels } from './cefr-levels';
import {
  createSpanishCourseRuntime,
  type SpanishCourseAsset,
  type SpanishRuntimeCatalogEntry,
} from './spanish-course-runtime';

export type CatalogPublicationStatus = 'draft' | 'production';
export type CatalogReviewStatus = 'draft' | 'approved';
export type CourseCatalogLevelState = 'available' | 'not-yet-available' | 'unsupported-by-source';

export interface CourseCatalogEntry extends CefrCatalogEntry {
  courseId: CourseId;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  publicationStatus: CatalogPublicationStatus;
  learnerContentReviewStatus: CatalogReviewStatus;
  hintReviewStatus: CatalogReviewStatus;
  levelEvidence: string;
  gender?: string;
  alternativeForms?: { form: string; type: string; note?: string }[];
  alternativeTerms?: string[];
}

const spanishAsset = spanishJson as SpanishCourseAsset;
const spanishRuntime = createSpanishCourseRuntime(spanishAsset);

function englishEntry(entry: CefrCatalogEntry): CourseCatalogEntry {
  return {
    ...entry,
    courseId: 'en-sk',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'sk',
    publicationStatus: 'production',
    learnerContentReviewStatus: 'approved',
    hintReviewStatus: 'approved',
    levelEvidence: `${entry.source}:${entry.sourceVersion}`,
  };
}

function spanishEntry(entry: SpanishRuntimeCatalogEntry): CourseCatalogEntry {
  return {
    ...entry,
    courseId: 'es-sk',
    sourceLanguageCode: 'es',
    targetLanguageCode: 'sk',
    publicationStatus: 'production',
    learnerContentReviewStatus: 'approved',
    hintReviewStatus: 'approved',
    levelEvidence: entry.levelEvidence,
  };
}

export function getCourseCatalogLevelState(courseId: CourseId, level: CefrLevel): CourseCatalogLevelState {
  if (courseId === 'en-sk') return 'available';
  const state = spanishRuntime.levelState(level);
  if (state === 'available') return 'available';
  return state === 'unavailable-no-elelex-source-level' ? 'unsupported-by-source' : 'not-yet-available';
}

export function getCourseCatalogEntries(
  courseId: CourseId,
  level: CefrLevel,
  _options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') return getCefrEntries(level).map(englishEntry);
  return spanishRuntime.entries(level).map(spanishEntry);
}

/** Availability reports bundled content and source support, not curriculum completeness. */
export function getCourseCatalogAvailability(courseId: CourseId): {
  total: number;
  counts: Record<CefrLevel, number>;
  levels: Record<CefrLevel, CourseCatalogLevelState>;
  state: 'unavailable' | 'available';
} {
  const counts = Object.fromEntries(cefrLevels.map((level) => [level, getCourseCatalogEntries(courseId, level).length])) as Record<CefrLevel, number>;
  const levels = Object.fromEntries(cefrLevels.map((level) => [level, getCourseCatalogLevelState(courseId, level)])) as Record<CefrLevel, CourseCatalogLevelState>;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { total, counts, levels, state: total === 0 ? 'unavailable' : 'available' };
}

export function getCourseCatalogEntry(
  courseId: CourseId,
  catalogSenseId: string | null,
  _options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') {
    const entry = getCefrEntry(catalogSenseId);
    return entry ? englishEntry(entry) : null;
  }
  const entry = spanishRuntime.entry(catalogSenseId);
  return entry ? spanishEntry(entry) : null;
}

export function getCourseCatalogEntryForNormalizedTerm(
  courseId: CourseId,
  normalizedTerm: string,
  _options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') {
    const entry = getCefrEntryForNormalizedTerm(normalizedTerm);
    return entry ? englishEntry(entry) : null;
  }
  const entry = spanishRuntime.entriesForNormalizedTerm(normalizedTerm)[0] ?? null;
  return entry ? spanishEntry(entry) : null;
}

export function getCourseCatalogEntriesForNormalizedTerm(
  courseId: CourseId,
  normalizedTerm: string,
  _options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') {
    const entry = getCefrEntryForNormalizedTerm(normalizedTerm);
    return entry ? [englishEntry(entry)] : [];
  }
  return spanishRuntime.entriesForNormalizedTerm(normalizedTerm).map(spanishEntry);
}

export function getCourseCatalogTranslation(
  courseId: CourseId,
  catalogSenseId: string | null,
  normalizedTerm?: string | null,
  options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') return getCefrTranslation(catalogSenseId, normalizedTerm);
  return getCourseCatalogEntry(courseId, catalogSenseId, options)?.translation
    ?? (normalizedTerm ? getCourseCatalogEntryForNormalizedTerm(courseId, normalizedTerm, options)?.translation : undefined)
    ?? null;
}

export function getSpanishCourseAsset() {
  return spanishAsset;
}
