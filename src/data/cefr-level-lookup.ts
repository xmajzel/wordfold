import type { CefrLevel } from '@/domain/types';
import senseLevelsJson from '../../assets/catalog/cefr-sense-levels.json';

const senseLevels = senseLevelsJson as Record<string, CefrLevel>;

export function getCefrLevelForCatalogSense(catalogSenseId: string | null) {
  return catalogSenseId ? senseLevels[catalogSenseId] ?? null : null;
}
