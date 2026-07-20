import type { AbstractPowerSyncDatabase, CrudEntry, CrudTransaction } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

type MutableRow = Record<string, unknown>;

interface SupabaseError {
  code?: string;
  message: string;
}

interface UploadResult {
  error: SupabaseError | null;
}

interface UploadRemote {
  upsert(table: 'collections' | 'words', row: MutableRow): Promise<UploadResult>;
  insertEvent(row: MutableRow): Promise<UploadResult>;
  patch(table: 'collections' | 'words', id: string, userId: string, values: MutableRow): Promise<UploadResult>;
  rpc(name: string, parameters: MutableRow): Promise<UploadResult>;
}

const MUTABLE_FIELDS = {
  collections: new Set(['name', 'color', 'updated_at']),
  words: new Set([
    'collection_id', 'term', 'normalized_term', 'source_language_code', 'target_language_code',
    'part_of_speech', 'definition', 'example', 'translation', 'catalog_sense_id', 'cefr_level',
    'source', 'state', 'understood_streak', 'lapse_count', 'view_count', 'last_viewed_at',
    'last_rated_at', 'next_review_at', 'updated_at',
  ]),
} as const;

export class SupabaseUploadRemote implements UploadRemote {
  constructor(private readonly client: SupabaseClient) {}

  async upsert(table: 'collections' | 'words', row: MutableRow) {
    const result = await this.client.from(table).upsert(row, { onConflict: 'id' });
    return { error: result.error };
  }

  async insertEvent(row: MutableRow) {
    const result = await this.client.from('learning_events')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    return { error: result.error };
  }

  async patch(table: 'collections' | 'words', id: string, userId: string, values: MutableRow) {
    const result = await this.client.from(table).update(values).eq('id', id).eq('user_id', userId);
    return { error: result.error };
  }

  async rpc(name: string, parameters: MutableRow) {
    const result = await this.client.rpc(name, parameters);
    return { error: result.error };
  }
}

export class PowerSyncUploader {
  private readonly remote: UploadRemote;

  constructor(
    client: SupabaseClient,
    private readonly getUserId: () => Promise<string>,
    remote?: UploadRemote,
  ) {
    this.remote = remote ?? new SupabaseUploadRemote(client);
  }

  async uploadNext(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;
    const userId = await this.getUserId();

    const compound = compoundMutation(transaction);
    if (compound) {
      const result = await this.remote.rpc(compound.name, compound.parameters);
      if (result.error) {
        const rejected = knownRejection(result.error, compound.event);
        if (!rejected) throw new Error('Synchronization upload failed.');
        await recordRejection(database, userId, compound.event, result.error.code ?? 'validation_error', rejected);
      }
      await transaction.complete();
      return;
    }

    for (const entry of transaction.crud) {
      const result = await this.applyEntry(entry, userId);
      if (!result.error) continue;
      const rejected = knownRejection(result.error, entry);
      if (!rejected) throw new Error('Synchronization upload failed.');
      await recordRejection(database, userId, entry, result.error.code ?? 'validation_error', rejected);
    }
    await transaction.complete();
  }

  private applyEntry(entry: CrudEntry, userId: string): Promise<UploadResult> {
    if (entry.op === 'PUT') {
      const row: MutableRow = { ...(entry.opData ?? {}), id: entry.id };
      if (entry.table === 'collections' || entry.table === 'words') {
        if (row.user_id !== userId) throw new Error('Queued synchronization row belongs to another account.');
        return this.remote.upsert(entry.table, row);
      }
      if (entry.table === 'learning_events') {
        if (row.user_id !== userId) throw new Error('Queued synchronization event belongs to another account.');
        return this.remote.insertEvent(row);
      }
      throw unexpected(entry);
    }

    if (entry.op === 'PATCH') {
      if (entry.table !== 'collections' && entry.table !== 'words') throw unexpected(entry);
      const values = mutableValues(entry.table, entry.opData ?? {});
      if (Object.keys(values).length === 0) throw unexpected(entry);
      return this.remote.patch(entry.table, entry.id, userId, values);
    }

    if (entry.op === 'DELETE') {
      if (entry.table === 'words') return this.remote.rpc('tombstone_word', { p_word_id: entry.id });
      if (entry.table === 'collections') return this.remote.rpc('tombstone_collection', { p_collection_id: entry.id });
      throw unexpected(entry);
    }

    throw unexpected(entry);
  }
}

interface CompoundMutation {
  name: 'apply_word_rating' | 'record_word_view';
  parameters: MutableRow;
  event: CrudEntry;
}

function compoundMutation(transaction: CrudTransaction): CompoundMutation | null {
  if (transaction.crud.length !== 2) return null;
  const word = transaction.crud.find((entry) => entry.table === 'words' && entry.op === 'PATCH');
  const event = transaction.crud.find((entry) => entry.table === 'learning_events' && entry.op === 'PUT');
  if (!word || !event || event.opData?.word_id !== word.id) return null;

  if (event.opData?.type === 'rating' && hasFields(word.opData, [
    'state', 'understood_streak', 'lapse_count', 'last_rated_at', 'next_review_at',
  ])) {
    return {
      name: 'apply_word_rating', event,
      parameters: {
        p_word_id: word.id,
        p_event_id: event.id,
        p_rating: event.opData.value,
        p_state: word.opData?.state,
        p_understood_streak: word.opData?.understood_streak,
        p_lapse_count: word.opData?.lapse_count,
        p_last_rated_at: word.opData?.last_rated_at,
        p_next_review_at: word.opData?.next_review_at ?? null,
      },
    };
  }

  if (event.opData?.type === 'view' && hasFields(word.opData, ['view_count', 'last_viewed_at'])) {
    return {
      name: 'record_word_view', event,
      parameters: {
        p_word_id: word.id,
        p_event_id: event.id,
        p_occurred_at: event.opData.occurred_at,
      },
    };
  }
  return null;
}

function hasFields(data: MutableRow | undefined, fields: string[]) {
  return Boolean(data) && fields.every((field) => Object.prototype.hasOwnProperty.call(data, field));
}

function mutableValues(table: 'collections' | 'words', data: MutableRow) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => MUTABLE_FIELDS[table].has(key)));
}

function knownRejection(error: SupabaseError, entry: CrudEntry) {
  if (error.code === '23505' && entry.table === 'words') {
    return 'This account already contains that word. The account copy was kept.';
  }
  if (error.code === '22000') return 'This change targeted an item that was already removed.';
  if (error.code === '42501' && /not found/i.test(error.message)) {
    return 'This change targeted an item that is no longer available.';
  }
  return null;
}

async function recordRejection(
  database: AbstractPowerSyncDatabase,
  userId: string,
  entry: CrudEntry,
  code: string,
  safeMessage: string,
) {
  const now = new Date().toISOString();
  await database.execute(
    `INSERT INTO sync_write_errors
      (id, user_id, operation_id, table_name, row_id, operation, error_code, safe_message, created_at, acknowledged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [Crypto.randomUUID(), userId, String(entry.clientId), entry.table, entry.id, entry.op, code, safeMessage, now],
  );
}

function unexpected(entry: CrudEntry) {
  return new Error(`Unexpected synchronization operation: ${entry.op} ${entry.table}`);
}

export type { UploadRemote, UploadResult };
