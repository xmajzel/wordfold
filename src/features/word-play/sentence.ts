import type { Word } from '@/domain/types';

export interface SentenceGap { before: string; answer: string; after: string }
export const normalizeSentenceAnswer = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export function buildSentenceGap(word: Pick<Word, 'term' | 'example'>): SentenceGap | null {
  const sentence = word.example?.normalize('NFC').trim();
  const term = word.term.normalize('NFC').trim();
  if (!sentence || !term) return null;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  // Unicode boundaries prevent blanking fragments of accented words or inflections.
  const expression = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_'’–-])(${escaped})(?=$|[^\\p{L}\\p{M}\\p{N}_'’–-])`, 'giu');
  const matches = [...sentence.matchAll(expression)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const start = match.index + match[1].length;
  const before = sentence.slice(0, start);
  const after = sentence.slice(start + match[2].length);
  if (!(before + after).trim()) return null;
  return { before, answer: match[2], after };
}
