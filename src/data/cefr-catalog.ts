import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';
import catalogJson from '../../assets/catalog/cefr-catalog.json';
import learnerDefinitionsJson from '../../assets/catalog/cefr-learner-definitions.json';

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

const baseCatalog = catalogJson as CefrCatalogAsset;
const learnerDefinitions = learnerDefinitionsJson as LearnerDefinitionsAsset;
const entries = baseCatalog.entries.map((entry) => {
  const learner = learnerDefinitions.entries[entry.id];
  if (!learner || learner.needsReview) return entry;
  return {
    ...entry,
    partOfSpeech: learner.partOfSpeech,
    definition: learner.definition,
    example: learner.example,
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
