import type { SQLiteDatabase } from 'expo-sqlite';

import { getCefrEntryForNormalizedTerm } from '@/data/cefr-catalog';
import type { CatalogSense, ContentPackId } from '@/domain/types';
import { normalizeTerm } from '@/features/import/parser';
import packsJson from '../../assets/catalog/packs.json';

interface CatalogRow {
  id: string;
  term: string;
  part_of_speech: string;
  definition: string;
  example: string | null;
  rank: number;
}

const partOfSpeechLabels: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  s: 'adjective',
  r: 'adverb',
};

export async function lookupSenses(database: SQLiteDatabase, term: string): Promise<CatalogSense[]> {
  const normalizedTerm = normalizeTerm(term);
  const rows = await database.getAllAsync<CatalogRow>(
    `SELECT id, term, part_of_speech, definition, example, rank
     FROM senses WHERE normalized_term = ? ORDER BY rank LIMIT 12`,
    normalizedTerm,
  );
  const senses = rows.map((row) => ({
    id: row.id,
    term: row.term,
    partOfSpeech: partOfSpeechLabels[row.part_of_speech] ?? row.part_of_speech,
    definition: row.definition,
    example: row.example,
    rank: row.rank,
  }));
  const learnerEntry = getCefrEntryForNormalizedTerm(normalizedTerm);
  if (!learnerEntry) return senses;
  return [{
    id: learnerEntry.catalogSenseId,
    term: learnerEntry.term,
    partOfSpeech: learnerEntry.partOfSpeech,
    definition: learnerEntry.definition,
    example: learnerEntry.example,
    translation: learnerEntry.translation,
    rank: -101,
  }, ...senses.filter((sense) => sense.id !== learnerEntry.catalogSenseId)].slice(0, 12);
}

type Pack = { id: ContentPackId; name: string; terms: string[] };
const packs = packsJson as Pack[];

export function getPackTerms(packId: ContentPackId) {
  return packs.find((pack) => pack.id === packId)?.terms ?? [];
}
