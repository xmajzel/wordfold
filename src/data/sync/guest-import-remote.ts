import type { SupabaseClient } from '@supabase/supabase-js';

export interface RemoteImportWord {
  id: string;
  normalizedTerm: string;
  term: string;
  definition: string;
}

export type RemoteImportRow = Record<string, string | number | null>;

export interface GuestImportRemote {
  listActiveWords(signal?: AbortSignal): Promise<RemoteImportWord[]>;
  upsertCollections(rows: RemoteImportRow[], signal?: AbortSignal): Promise<void>;
  upsertWords(rows: RemoteImportRow[], signal?: AbortSignal): Promise<void>;
  updateWord(id: string, userId: string, row: RemoteImportRow, signal?: AbortSignal): Promise<void>;
  insertEvents(rows: RemoteImportRow[], signal?: AbortSignal): Promise<void>;
}

export class GuestImportRemoteError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const REMOTE_PAGE_SIZE = 1_000;

function throwIfError(error: { code?: string; message: string } | null) {
  if (error) throw new GuestImportRemoteError(error.code ?? 'remote_error', error.message);
}

export class SupabaseGuestImportRemote implements GuestImportRemote {
  constructor(private readonly client: SupabaseClient) {}

  async listActiveWords(signal?: AbortSignal): Promise<RemoteImportWord[]> {
    const words: RemoteImportWord[] = [];
    for (let from = 0; ; from += REMOTE_PAGE_SIZE) {
      let query = this.client.from('words')
        .select('id, normalized_term, term, definition')
        .is('deleted_at', null)
        .range(from, from + REMOTE_PAGE_SIZE - 1);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      throwIfError(error);
      const page = data ?? [];
      words.push(...page.map((row) => ({
        id: String(row.id),
        normalizedTerm: String(row.normalized_term),
        term: String(row.term),
        definition: String(row.definition),
      })));
      if (page.length < REMOTE_PAGE_SIZE) return words;
    }
  }

  async upsertCollections(rows: RemoteImportRow[], signal?: AbortSignal) {
    if (rows.length === 0) return;
    let query = this.client.from('collections').upsert(rows, { onConflict: 'id' });
    if (signal) query = query.abortSignal(signal);
    const { error } = await query;
    throwIfError(error);
  }

  async upsertWords(rows: RemoteImportRow[], signal?: AbortSignal) {
    if (rows.length === 0) return;
    let query = this.client.from('words').upsert(rows, { onConflict: 'id' });
    if (signal) query = query.abortSignal(signal);
    const { error } = await query;
    throwIfError(error);
  }

  async updateWord(id: string, userId: string, row: RemoteImportRow, signal?: AbortSignal) {
    let query = this.client.from('words').update(row).eq('id', id).eq('user_id', userId);
    if (signal) query = query.abortSignal(signal);
    const { error } = await query;
    throwIfError(error);
  }

  async insertEvents(rows: RemoteImportRow[], signal?: AbortSignal) {
    if (rows.length === 0) return;
    let query = this.client.from('learning_events')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (signal) query = query.abortSignal(signal);
    const { error } = await query;
    throwIfError(error);
  }
}
