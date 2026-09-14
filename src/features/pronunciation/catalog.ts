import { getCefrEntries, getCefrEntry } from '@/data/cefr-catalog';
import { getCourseCatalogEntries, getCourseCatalogEntry } from '@/data/course-catalog';
import type { CefrLevel } from '@/domain/types';
import type { NeuralLocale } from '@/domain/pronunciation-voices';

export function pronunciationEntries(locale: NeuralLocale, level: CefrLevel) {
  return locale.startsWith('es-') ? getCourseCatalogEntries('es-sk', level) : getCefrEntries(level);
}
export function pronunciationEntry(locale: NeuralLocale, id: string) {
  return locale.startsWith('es-') ? getCourseCatalogEntry('es-sk', id) : getCefrEntry(id);
}
