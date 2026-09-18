import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseBulkInput } from './parser';
export type ReviewDraft = { term: string; definition: string; translation: string; example: string; partOfSpeech: string; catalogSenseId: string | null; error: string | null; prepared: boolean };
export type ReviewQueue = { version: 1; collectionId: string; index: number; added: number; skipped: number; rows: ReviewDraft[] };
export const reviewQueueKey = (userId: string | undefined, courseId: string) => `word-review-v1:${userId ?? 'guest'}:${courseId}`;
let writes: Promise<unknown> = Promise.resolve();
export function saveReviewQueue(key: string, queue: ReviewQueue | null): Promise<void> {
  const encoded = queue === null ? null : JSON.stringify(queue);
  const next = writes.catch(() => undefined).then(() => encoded === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, encoded));
  writes = next;
  return next;
}
export function makeReviewQueue(input: string, language: string, collectionId: string): ReviewQueue {
  return { version: 1, collectionId, index: 0, added: 0, skipped: 0, rows: parseBulkInput(input, language).map((line) => ({
    term: line.term, definition: line.definition ?? '', translation: line.translation ?? '', example: line.example ?? '',
    partOfSpeech: '', catalogSenseId: null, error: line.error, prepared: Boolean(line.definition),
  })) };
}
export function parseReviewQueue(raw: string | null): ReviewQueue | null {
  if (!raw) return null;
  try {
    const q = JSON.parse(raw);
    if (q.version !== 1 || typeof q.collectionId !== 'string' || !Array.isArray(q.rows)
      || !Number.isInteger(q.index) || q.index < 0 || q.index > q.rows.length
      || !Number.isInteger(q.added) || q.added < 0 || !Number.isInteger(q.skipped) || q.skipped < 0
      || !q.rows.every((r: ReviewDraft) => r && ['term','definition','translation','example','partOfSpeech'].every((key) => typeof r[key as keyof ReviewDraft] === 'string')
        && typeof r.prepared === 'boolean' && (r.catalogSenseId === null || typeof r.catalogSenseId === 'string')
        && (r.error === null || typeof r.error === 'string'))) return null;
    return q;
  } catch { return null; }
}
