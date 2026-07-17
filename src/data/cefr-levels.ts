import type { CefrLevel, LearningFilter } from '@/domain/types';
import indexJson from '../../assets/catalog/cefr-index.json';

interface CefrCatalogIndex {
  schemaVersion: number;
  title: string;
  levels: CefrLevel[];
  counts: Record<CefrLevel, number>;
}

const index = indexJson as CefrCatalogIndex;

export const cefrLevels = index.levels;

export const cefrLevelDescriptions: Record<CefrLevel, string> = {
  A1: 'Starter essentials',
  A2: 'Everyday foundations',
  B1: 'Independent everyday use',
  B2: 'Confident, nuanced use',
  C1: 'Advanced, flexible language',
  C2: 'Highly precise expression',
};

export function isCefrLevel(value: string | undefined): value is CefrLevel {
  return cefrLevels.includes(value as CefrLevel);
}

export function isLearningFilter(value: string | null | undefined): value is LearningFilter {
  return value === 'all' || value === 'personal' || isCefrLevel(value ?? undefined);
}

export function getCefrLevelSummaries() {
  return cefrLevels.map((level) => ({
    level,
    count: index.counts[level],
    description: cefrLevelDescriptions[level],
  }));
}
