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

export function getCefrEntries(level: CefrLevel) {
  return catalog.entries.filter((entry) => entry.level === level);
}
