import type { CefrCatalogEntry, Word } from '@/domain/types';

type CatalogProgressEntry = Pick<CefrCatalogEntry, 'catalogSenseId' | 'normalizedTerm'>;
type CatalogProgressWord = Pick<Word, 'catalogSenseId' | 'normalizedTerm' | 'state'>;

export interface CefrProgress {
  total: number;
  known: number;
  learning: number;
  addedNotStarted: number;
  notAdded: number;
}

export function calculateCefrProgress(
  entries: CatalogProgressEntry[],
  words: CatalogProgressWord[],
): CefrProgress {
  const wordsBySense = new Map(words.flatMap((word) => (
    word.catalogSenseId ? [[word.catalogSenseId, word] as const] : []
  )));
  const wordsByTerm = new Map(words.flatMap((word) => (
    word.catalogSenseId === null ? [[word.normalizedTerm, word] as const] : []
  )));
  const progress: CefrProgress = {
    total: entries.length,
    known: 0,
    learning: 0,
    addedNotStarted: 0,
    notAdded: 0,
  };

  for (const entry of entries) {
    const word = wordsBySense.get(entry.catalogSenseId) ?? wordsByTerm.get(entry.normalizedTerm);
    if (!word) progress.notAdded += 1;
    else if (word.state === 'learned') progress.known += 1;
    else if (word.state === 'new') progress.addedNotStarted += 1;
    else progress.learning += 1;
  }

  return progress;
}
