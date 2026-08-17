import type { AbstractPowerSyncDatabase, CrudEntry, CrudTransaction, UpdateType } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { PowerSyncUploader, type UploadRemote } from './uploader';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'error-id') }));

function entry(
  clientId: number,
  op: `${UpdateType}`,
  table: string,
  id: string,
  data?: Record<string, unknown>,
) {
  return { clientId, op, table, id, transactionId: 1, opData: data } as CrudEntry;
}

function setup(entries: CrudEntry[], remoteOverrides: Partial<UploadRemote> = {}) {
  const complete = jest.fn(async () => undefined);
  const transaction = { crud: entries, complete, transactionId: 1 } as unknown as CrudTransaction;
  const execute = jest.fn(async () => undefined);
  const database = {
    getNextCrudTransaction: jest.fn(async () => transaction),
    execute,
  } as unknown as AbstractPowerSyncDatabase;
  const accepted = async () => ({ error: null });
  const remote: UploadRemote = {
    upsert: jest.fn(accepted),
    insertEvent: jest.fn(accepted),
    patch: jest.fn(accepted),
    rpc: jest.fn(accepted),
    ...remoteOverrides,
  };
  const uploader = new PowerSyncUploader({} as SupabaseClient, async () => 'user-1', remote);
  return { uploader, database, remote, complete, execute };
}

describe('PowerSyncUploader', () => {
  it('upserts a full local word and completes its transaction', async () => {
    const put = entry(1, 'PUT', 'words', 'word-1', {
      user_id: 'user-1', term: 'Able', normalized_term: 'able',
    });
    const context = setup([put]);

    await context.uploader.uploadNext(context.database);

    expect(context.remote.upsert).toHaveBeenCalledWith('words', {
      id: 'word-1', user_id: 'user-1', term: 'Able', normalized_term: 'able',
    });
    expect(context.complete).toHaveBeenCalledTimes(1);
  });

  it('applies a rating transaction through one idempotent RPC', async () => {
    const word = entry(1, 'PATCH', 'words', 'word-1', {
      state: 'understood', understood_streak: 1, lapse_count: 0,
      last_rated_at: '2026-07-20T10:00:00.000Z', next_review_at: '2026-07-21T10:00:00.000Z',
      updated_at: '2026-07-20T10:00:00.000Z',
    });
    const event = entry(2, 'PUT', 'learning_events', 'event-1', {
      user_id: 'user-1', word_id: 'word-1', type: 'rating', value: 'understood',
      occurred_at: '2026-07-20T10:00:00.000Z',
    });
    const context = setup([word, event]);

    await context.uploader.uploadNext(context.database);

    expect(context.remote.rpc).toHaveBeenCalledWith('apply_word_rating', {
      p_word_id: 'word-1', p_event_id: 'event-1', p_rating: 'understood', p_state: 'understood',
      p_understood_streak: 1, p_lapse_count: 0, p_last_rated_at: '2026-07-20T10:00:00.000Z',
      p_next_review_at: '2026-07-21T10:00:00.000Z',
    });
    expect(context.remote.patch).not.toHaveBeenCalled();
    expect(context.remote.insertEvent).not.toHaveBeenCalled();
    expect(context.complete).toHaveBeenCalledTimes(1);
  });

  it('applies a view transaction through one idempotent RPC', async () => {
    const word = entry(1, 'PATCH', 'words', 'word-1', {
      view_count: 3, last_viewed_at: '2026-07-20T10:00:00.000Z', updated_at: '2026-07-20T10:00:00.000Z',
    });
    const event = entry(2, 'PUT', 'learning_events', 'event-1', {
      user_id: 'user-1', word_id: 'word-1', type: 'view', value: null,
      occurred_at: '2026-07-20T10:00:00.000Z',
    });
    const context = setup([word, event]);

    await context.uploader.uploadNext(context.database);

    expect(context.remote.rpc).toHaveBeenCalledWith('record_word_view', {
      p_word_id: 'word-1', p_event_id: 'event-1', p_occurred_at: '2026-07-20T10:00:00.000Z',
    });
    expect(context.complete).toHaveBeenCalledTimes(1);
  });

  it('keeps an unexpected word uniqueness failure queued', async () => {
    const remote = {
      upsert: jest.fn(async () => ({ error: { code: '23505', message: 'private database details' } })),
    };
    const context = setup([entry(8, 'PUT', 'words', 'word-1', {
      user_id: 'user-1', term: 'Able', normalized_term: 'able',
    })], remote);

    await expect(context.uploader.uploadNext(context.database)).rejects.toThrow('Synchronization upload failed');

    expect(context.execute).not.toHaveBeenCalled();
    expect(context.complete).not.toHaveBeenCalled();
  });

  it('keeps transient and unexpected failures queued', async () => {
    const context = setup([entry(1, 'PATCH', 'words', 'word-1', { translation: 'moc' })], {
      patch: jest.fn(async () => ({ error: { code: '503', message: 'backend unavailable' } })),
    });

    await expect(context.uploader.uploadNext(context.database)).rejects.toThrow('Synchronization upload failed');
    expect(context.complete).not.toHaveBeenCalled();
    expect(context.execute).not.toHaveBeenCalled();
  });

  it('rejects unsupported queue operations without completing them', async () => {
    const context = setup([entry(1, 'DELETE', 'learning_events', 'event-1')]);

    await expect(context.uploader.uploadNext(context.database)).rejects.toThrow('Unexpected synchronization operation');
    expect(context.complete).not.toHaveBeenCalled();
  });
});
