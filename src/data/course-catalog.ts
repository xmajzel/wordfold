import spanishPilotJson from '../../assets/catalog/spanish/cefr-pilot.json';

import type { CourseId } from '@/domain/courses';
import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';
import { normalizeTermForLanguage } from '@/domain/normalize-term';
import { spanishA1PreviewEnabled } from '@/domain/spanish-preview';

import {
  getCefrEntries,
  getCefrEntry,
  getCefrEntryForNormalizedTerm,
  getCefrTranslation,
} from './cefr-catalog';
import { cefrLevels } from './cefr-levels';

export type CatalogPublicationStatus = 'draft' | 'production';
export type CatalogReviewStatus = 'draft' | 'approved';

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
}

interface SpanishPilotEntry extends CefrCatalogEntry {
  learnerContentReviewStatus: CatalogReviewStatus;
  hintReviewStatus: CatalogReviewStatus;
  levelEvidence: string;
}

export interface SpanishCatalogAsset {
  schemaVersion: number;
  publicationStatus: CatalogPublicationStatus;
  courseId: 'es-sk';
  sourceLanguageCode: 'es';
  targetLanguageCode: 'sk';
  title: string;
  notice: string;
  editorialReferences: {
    id: string;
    url: string;
    use: string;
    accessed: string;
    permissionReceived?: string;
    permissionEvidence?: string;
    attribution?: string;
    endorsementStatus?: string;
  }[];
  counts: Record<CefrLevel, number>;
  entries: SpanishPilotEntry[];
  productionRelease?: {
    sources: {
      id: string;
      version: string;
      sha256: string;
      attribution: string;
      redistributionScope: string;
    }[];
    spanishReviewer: string;
    slovakReviewer: string;
    reviewedAt: string;
    coverageDecision: string;
    adjudicationRecord: string;
  };
}

const spanishPilot = spanishPilotJson as SpanishCatalogAsset;

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

function spanishEntry(entry: SpanishPilotEntry): CourseCatalogEntry {
  return {
    ...entry,
    courseId: spanishPilot.courseId,
    sourceLanguageCode: spanishPilot.sourceLanguageCode,
    targetLanguageCode: spanishPilot.targetLanguageCode,
    publicationStatus: spanishPilot.publicationStatus,
  };
}

export function validateSpanishCatalogAsset(asset: SpanishCatalogAsset) {
  const errors: string[] = [];
  if (asset.schemaVersion !== 1) errors.push('Unsupported Spanish catalog schema version.');
  if (asset.courseId !== 'es-sk' || asset.sourceLanguageCode !== 'es' || asset.targetLanguageCode !== 'sk') {
    errors.push('Spanish catalog language identity must be es-sk.');
  }
  const ids = new Set<string>();
  const senseIds = new Set<string>();
  const actualCounts: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
  for (const entry of asset.entries) {
    if (!entry.id.startsWith('es-sk:') || !entry.catalogSenseId.startsWith('es-sk:')) {
      errors.push(`Spanish entry ${entry.id || '<missing>'} must use namespaced IDs.`);
    }
    if (ids.has(entry.id)) errors.push(`Duplicate Spanish entry ID: ${entry.id}`);
    if (senseIds.has(entry.catalogSenseId)) errors.push(`Duplicate Spanish sense ID: ${entry.catalogSenseId}`);
    ids.add(entry.id);
    senseIds.add(entry.catalogSenseId);
    if (normalizeTermForLanguage(entry.term, 'es') !== entry.normalizedTerm) {
      errors.push(`Spanish entry ${entry.id} has an invalid normalized term.`);
    }
    if (!entry.term.trim() || !entry.definition.trim() || !entry.example?.trim() || !entry.translation.trim()
      || !entry.partOfSpeech.trim() || !entry.sourceVersion.trim() || !entry.levelEvidence.trim()) {
      errors.push(`Spanish entry ${entry.id} is missing required content or provenance.`);
    }
    if (!(entry.level in actualCounts)) errors.push(`Spanish entry ${entry.id} has an unsupported level.`);
    else actualCounts[entry.level] += 1;
    if (asset.publicationStatus === 'production'
      && (entry.learnerContentReviewStatus !== 'approved' || entry.hintReviewStatus !== 'approved')) {
      errors.push(`Production Spanish entry ${entry.id} is not independently approved.`);
    }
  }
  for (const [level, count] of Object.entries(actualCounts) as [CefrLevel, number][]) {
    if (asset.counts[level] !== count) errors.push(`Spanish ${level} count does not match its manifest.`);
    if (asset.publicationStatus === 'production' && count === 0) errors.push(`Production Spanish ${level} coverage is empty.`);
  }
  if (asset.publicationStatus === 'production') {
    const release = asset.productionRelease;
    if (!release || release.sources.length === 0
      || !release.spanishReviewer.trim() || !release.slovakReviewer.trim()
      || release.spanishReviewer.trim() === release.slovakReviewer.trim()
      || !release.reviewedAt.trim() || !release.coverageDecision.trim() || !release.adjudicationRecord.trim()) {
      errors.push('Production Spanish catalog is missing independent review and release metadata.');
    } else {
      for (const source of release.sources) {
        if (!source.id.trim() || !source.version.trim() || !/^[a-f0-9]{64}$/i.test(source.sha256)
          || !source.attribution.trim() || !source.redistributionScope.trim()) {
          errors.push(`Production Spanish source ${source.id || '<missing>'} has incomplete licensing metadata.`);
        }
      }
      for (const entry of asset.entries) {
        if (!release.sources.some((source) => source.id === entry.source && source.version === entry.sourceVersion)) {
          errors.push(`Production Spanish entry ${entry.id} has no matching approved source release.`);
        }
      }
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
}

validateSpanishCatalogAsset(spanishPilot);

// Import only original learner fields; licensed reviewer glosses and review
// packages are not part of this development preview or the learner model.
const spanishEntries: CourseCatalogEntry[] = spanishA1PreviewEnabled
  ? [
      ...(require('../../assets/catalog/spanish/a1-candidates.json') as typeof import('../../assets/catalog/spanish/a1-candidates.json')).entries,
      ...(require('../../assets/catalog/spanish/expansion-preview.json') as typeof import('../../assets/catalog/spanish/expansion-preview.json')).entries,
    ].map((entry) => ({
      id: entry.id,
      catalogSenseId: entry.catalogSenseId,
      term: entry.term,
      normalizedTerm: entry.normalizedTerm,
      level: entry.level as CefrLevel,
      partOfSpeech: entry.displayPartOfSpeech,
      sourcePartOfSpeech: [entry.partOfSpeech],
      definition: entry.definition,
      example: entry.example,
      translation: entry.translation,
      source: 'wordfold-original-spanish',
      sourceVersion: entry.sourceVersion,
      courseId: 'es-sk',
      sourceLanguageCode: 'es',
      targetLanguageCode: 'sk',
      publicationStatus: 'draft',
      learnerContentReviewStatus: 'draft',
      hintReviewStatus: 'draft',
      levelEvidence: entry.levelRationale,
      gender: entry.gender,
      alternativeForms: entry.alternativeForms,
    }))
  : spanishPilot.entries.map(spanishEntry);
const spanishBySense = new Map(spanishEntries.map((entry) => [entry.catalogSenseId, entry]));
const spanishByTerm = new Map<string, CourseCatalogEntry[]>();
for (const entry of spanishEntries) {
  spanishByTerm.set(entry.normalizedTerm, [...(spanishByTerm.get(entry.normalizedTerm) ?? []), entry]);
}

function isAvailable(entry: CourseCatalogEntry, includeDraft: boolean) {
  return includeDraft || spanishA1PreviewEnabled || entry.publicationStatus === 'production';
}

export function getCourseCatalogEntries(
  courseId: CourseId,
  level: CefrLevel,
  options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') return getCefrEntries(level).map(englishEntry);
  return spanishEntries.filter((entry) => entry.level === level && isAvailable(entry, options.includeDraft ?? false));
}

/** Availability is not curriculum completeness or a content-review attestation. */
export function getCourseCatalogAvailability(courseId: CourseId): {
  total: number;
  counts: Record<CefrLevel, number>;
  isPreview: boolean;
  state: 'unavailable' | 'preview' | 'available';
} {
  const counts = Object.fromEntries(cefrLevels.map((level) => [level, getCourseCatalogEntries(courseId, level).length])) as Record<CefrLevel, number>;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const isPreview = courseId === 'es-sk' && spanishA1PreviewEnabled;
  return { total, counts, isPreview, state: total === 0 ? 'unavailable' : isPreview ? 'preview' : 'available' };
}

export function getCourseCatalogEntry(
  courseId: CourseId,
  catalogSenseId: string | null,
  options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') {
    const entry = getCefrEntry(catalogSenseId);
    return entry ? englishEntry(entry) : null;
  }
  const entry = catalogSenseId ? spanishBySense.get(catalogSenseId) ?? null : null;
  return entry && isAvailable(entry, options.includeDraft ?? false) ? entry : null;
}

export function getCourseCatalogEntryForNormalizedTerm(
  courseId: CourseId,
  normalizedTerm: string,
  options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') {
    const entry = getCefrEntryForNormalizedTerm(normalizedTerm);
    return entry ? englishEntry(entry) : null;
  }
  const entry = spanishByTerm.get(normalizedTerm)?.find((candidate) => isAvailable(candidate, options.includeDraft ?? false)) ?? null;
  return entry && isAvailable(entry, options.includeDraft ?? false) ? entry : null;
}

export function getCourseCatalogEntriesForNormalizedTerm(
  courseId: CourseId,
  normalizedTerm: string,
  options: { includeDraft?: boolean } = {},
) {
  if (courseId === 'en-sk') {
    const entry = getCefrEntryForNormalizedTerm(normalizedTerm);
    return entry ? [englishEntry(entry)] : [];
  }
  return (spanishByTerm.get(normalizedTerm) ?? [])
    .filter((entry) => isAvailable(entry, options.includeDraft ?? false));
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

export function getSpanishCatalogPilot() {
  return spanishPilot;
}
