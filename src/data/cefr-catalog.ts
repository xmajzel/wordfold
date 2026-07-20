import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';
import catalogJson from '../../assets/catalog/cefr-catalog.json';

interface CefrCatalogAsset {
  schemaVersion: number;
  title: string;
  levels: CefrLevel[];
  counts: Record<CefrLevel, number>;
  entries: CefrCatalogEntry[];
}

const catalog = catalogJson as CefrCatalogAsset;
const entriesBySense = new Map(catalog.entries.map((entry) => [entry.catalogSenseId, entry]));
const entriesByTerm = new Map(catalog.entries.map((entry) => [entry.normalizedTerm, entry]));

export function getCefrEntries(level: CefrLevel) {
  return catalog.entries.filter((entry) => entry.level === level);
}

export function getCefrTranslation(catalogSenseId: string | null, normalizedTerm?: string | null) {
  return (catalogSenseId ? entriesBySense.get(catalogSenseId) : undefined)?.translation
    ?? (normalizedTerm ? entriesByTerm.get(normalizedTerm)?.translation : undefined)
    ?? null;
}
