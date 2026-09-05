import { cefrLevels } from '@/data/cefr-levels';
import type { getCourseCatalogAvailability } from '@/data/course-catalog';

export function describeCatalogAvailability(availability: ReturnType<typeof getCourseCatalogAvailability>) {
  if (availability.total === 0) return 'Catalog not available yet. Manual words, imports, and phone pronunciation are available.';
  const levels = cefrLevels.filter((level) => availability.counts[level] > 0)
    .map((level) => `${level}: ${availability.counts[level].toLocaleString()}`).join(' · ');
  return availability.isPreview
    ? `Local preview: ${availability.total.toLocaleString()} entries · ${levels}. Available entries do not mean a complete level.`
    : `${availability.total.toLocaleString()} catalog entries available · ${levels}.`;
}
