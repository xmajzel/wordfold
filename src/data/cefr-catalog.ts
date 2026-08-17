import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';
import catalogJson from '../../assets/catalog/cefr-catalog.json';
import learnerAdjudicationsJson from '../../assets/catalog/cefr-learner-definition-adjudications.json';
import learnerDefinitionsJson from '../../assets/catalog/cefr-learner-definitions.json';
import learnerTranslationsJson from '../../assets/catalog/cefr-learner-translations-sk.json';

interface CefrCatalogAsset {
  schemaVersion: number;
  title: string;
  levels: CefrLevel[];
  counts: Record<CefrLevel, number>;
  entries: CefrCatalogEntry[];
}

interface LearnerDefinition {
  entryId: string;
  normalizedTerm: string;
  meaningReferenceSenseId: string;
  definition: string;
  example: string;
  confidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
  reviewNote: string;
  partOfSpeech: string;
  translationReviewRequired: boolean;
}

interface LearnerDefinitionsAsset {
  schemaVersion: number;
  entries: Record<string, LearnerDefinition>;
}

interface LearnerAdjudication {
  entryId: string;
  normalizedTerm: string;
  definition: string;
  example: string;
  confidence: 'high' | 'medium';
  needsReview: false;
  partOfSpeech: string;
}

interface LearnerAdjudicationsAsset {
  schemaVersion: number;
  entries: Record<string, LearnerAdjudication>;
}

interface LearnerTranslation {
  entryId: string;
  normalizedTerm: string;
  translation: string;
  confidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
  reviewNote: string;
}

interface LearnerTranslationsAsset {
  schemaVersion: number;
  entries: Record<string, LearnerTranslation>;
}

const baseCatalog = catalogJson as CefrCatalogAsset;
const learnerDefinitions = learnerDefinitionsJson as LearnerDefinitionsAsset;
const learnerAdjudications = learnerAdjudicationsJson as LearnerAdjudicationsAsset;
const learnerTranslations = learnerTranslationsJson as LearnerTranslationsAsset;
const entries = baseCatalog.entries.map((baseEntry) => {
  const adjudication = learnerAdjudications.entries[baseEntry.id];
  const learner = adjudication
    && adjudication.entryId === baseEntry.id
    && adjudication.normalizedTerm === baseEntry.normalizedTerm
    && !adjudication.needsReview
    && (adjudication.confidence === 'high' || adjudication.confidence === 'medium')
    ? adjudication
    : learnerDefinitions.entries[baseEntry.id];
  const entry = !learner
    || learner.needsReview
    || learner.confidence === 'low'
    || learner.entryId !== baseEntry.id
    || learner.normalizedTerm !== baseEntry.normalizedTerm
    ? baseEntry
    : {
      ...baseEntry,
      partOfSpeech: learner.partOfSpeech,
      definition: learner.definition,
      example: learner.example,
    };
  const translated = learnerTranslations.entries[baseEntry.id];
  if (
    !translated
    || translated.needsReview
    || translated.confidence === 'low'
    || typeof translated.translation !== 'string'
    || !translated.translation.trim()
    || translated.entryId !== baseEntry.id
    || translated.normalizedTerm !== baseEntry.normalizedTerm
  ) return entry;
  return {
    ...entry,
    translation: translated.translation,
  };
});
const entriesBySense = new Map(entries.map((entry) => [entry.catalogSenseId, entry]));
const entriesByTerm = new Map(entries.map((entry) => [entry.normalizedTerm, entry]));

export function getCefrEntries(level: CefrLevel) {
  return entries.filter((entry) => entry.level === level);
}

export function getCefrEntry(catalogSenseId: string | null) {
  return catalogSenseId ? entriesBySense.get(catalogSenseId) ?? null : null;
}

export function getCefrEntryForNormalizedTerm(normalizedTerm: string) {
  return entriesByTerm.get(normalizedTerm) ?? null;
}

export function getCefrTranslation(catalogSenseId: string | null, normalizedTerm?: string | null) {
  return (catalogSenseId ? entriesBySense.get(catalogSenseId) : undefined)?.translation
    ?? (normalizedTerm ? entriesByTerm.get(normalizedTerm)?.translation : undefined)
    ?? null;
}
