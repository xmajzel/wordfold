import type { SQLiteDatabase } from 'expo-sqlite';

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
  const rows = await database.getAllAsync<CatalogRow>(
    `SELECT id, term, part_of_speech, definition, example, rank
     FROM senses WHERE normalized_term = ? ORDER BY rank LIMIT 12`,
    normalizeTerm(term),
  );
  return rows.map((row) => ({
    id: row.id,
    term: row.term,
    partOfSpeech: partOfSpeechLabels[row.part_of_speech] ?? row.part_of_speech,
    definition: row.definition,
    example: row.example,
    rank: row.rank,
  }));
}

type Pack = { id: ContentPackId; name: string; terms: string[] };
const packs = packsJson as Pack[];

export function getPackTerms(packId: ContentPackId) {
  return packs.find((pack) => pack.id === packId)?.terms ?? [];
}
