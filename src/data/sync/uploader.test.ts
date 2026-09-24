import type { AbstractPowerSyncDatabase, CrudEntry, CrudTransaction, UpdateType } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { PowerSyncUploader, type UploadRemote } from './uploader';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'error-id') }));

const collectionId = '11111111-1111-4111-8111-111111111111';
const importedCollectionId = '22222222-2222-4222-8222-222222222222';

function entry(
  clientId: number,
  op: `${UpdateType}`,
  table: string,
  id: string,
  data?: Record<string, unknown>,
) {
  return { clientId, op, table, id, transactionId: 1, opData: data } as CrudEntry;
}

function setup(entries: CrudEntry[], remoteOverrides: Partial<UploadRemote> = {}, mappedId: string | null = null) {
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
  const resolveCollectionId = jest.fn(async () => mappedId);
  const uploader = new PowerSyncUploader({} as SupabaseClient, async () => 'user-1', resolveCollectionId, remote);
  return { uploader, database, remote, complete, execute, resolveCollectionId };
}

describe('PowerSyncUploader', () => {
  it('uploads game relearning atomically and leaves a transient failure queued', async () => {
    const context = setup([
      entry(1, 'PATCH', 'words', 'word-1', { state: 'cannot_remember', known_streak: 0 }),
      entry(2, 'PUT', 'learning_events', 'game-event', {
        user_id: 'user-1', word_id: 'word-1', type: 'game_relearned', value: '{"sessionId":"session","mode":"matching"}',
        occurred_at: '2026-09-18T10:00:00.000Z',
      }),
    ]);
    jest.mocked(context.remote.rpc).mockResolvedValueOnce({ error: { code: '503', message: 'Unavailable' } });
    await expect(context.uploader.uploadNext(context.database)).rejects.toThrow('Synchronization upload failed');
    expect(context.complete).not.toHaveBeenCalled();
    await context.uploader.uploadNext(context.database);
    expect(context.remote.rpc).toHaveBeenLastCalledWith('relearn_game_word', {
      p_word_id: 'word-1', p_event_id: 'game-event', p_value: '{"sessionId":"session","mode":"matching"}',
      p_occurred_at: '2026-09-18T10:00:00.000Z',
    });
    expect(context.remote.patch).not.toHaveBeenCalled();
    expect(context.remote.insertEvent).not.toHaveBeenCalled();
    expect(context.complete).toHaveBeenCalledTimes(1);
  });
  it('upserts a full local word and completes its transaction', async () => {
    const put = entry(1, 'PUT', 'words', 'word-1', {
      user_id: 'user-1', collection_id: collectionId, term: 'Able', normalized_term: 'able',
    });
    const context = setup([put]);

    await context.uploader.uploadNext(context.database);

    expect(context.remote.upsert).toHaveBeenCalledWith('words', {
      id: 'word-1', user_id: 'user-1', collection_id: collectionId, term: 'Able', normalized_term: 'able',
    });
    expect(context.resolveCollectionId).not.toHaveBeenCalled();
    expect(context.complete).toHaveBeenCalledTimes(1);
  });

  it('replays a legacy collection through the completed import mapping without changing the queued word', async () => {
    const put = entry(1, 'PUT', 'words', 'word-1', {
      user_id: 'user-1', collection_id: 'my-words', term: 'Able', normalized_term: 'able',
    });
    const context = setup([put], {}, importedCollectionId);

    await context.uploader.uploadNext(context.database);

    expect(context.resolveCollectionId).toHaveBeenCalledWith('user-1', 'my-words');
    expect(context.remote.upsert).toHaveBeenCalledWith('words', expect.objectContaining({
      id: 'word-1', collection_id: importedCollectionId,
    }));
    expect(put.opData?.collection_id).toBe('my-words');
    expect(context.complete).toHaveBeenCalledTimes(1);
  });

  it('maps a queued collection change before patching', async () => {
    const context = setup([entry(2, 'PATCH', 'words', 'word-1', {
      collection_id: 'my-words', term: 'Able', ignored: 'private',
    })], {}, importedCollectionId);

    await context.uploader.uploadNext(context.database);

    expect(context.remote.patch).toHaveBeenCalledWith('words', 'word-1', 'user-1', {
      collection_id: importedCollectionId, term: 'Able',
    });
    expect(context.complete).toHaveBeenCalledTimes(1);
  });

  it('keeps a legacy word queued when its account has no completed import mapping', async () => {
    const context = setup([entry(1, 'PUT', 'words', 'word-1', {
      user_id: 'user-1', collection_id: 'my-words', term: 'Able',
    })]);

    await expect(context.uploader.uploadNext(context.database)).rejects.toThrow('needs a collection mapping');

    expect(context.remote.upsert).not.toHaveBeenCalled();
    expect(context.complete).not.toHaveBeenCalled();
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
      user_id: 'user-1', collection_id: collectionId, term: 'Able', normalized_term: 'able',
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

it('uploads new confirmations through v2 while retaining the legacy queued-rating route', async () => {
  const word = entry(1, 'PATCH', 'words', 'word-1', {
    state: 'understood', known_streak: 1, understood_streak: 0, lapse_count: 0,
    last_rated_at: '2026-09-17T12:00:00.000Z', next_review_at: '2026-09-18T12:00:00.000Z',
  });
  const event = entry(2, 'PUT', 'learning_events', 'confirmation-1', {
    word_id: 'word-1', type: 'rating', value: 'learned', occurred_at: '2026-09-17T12:00:00.000Z',
  });
  const context = setup([word, event]);
  await context.uploader.uploadNext(context.database);
  expect(context.remote.rpc).toHaveBeenCalledWith('apply_word_rating_v2', expect.objectContaining({
    p_known_streak: 1, p_state: 'understood', p_rating: 'learned', p_event_id: 'confirmation-1',
  }));
  expect(context.complete).toHaveBeenCalledTimes(1);
});
