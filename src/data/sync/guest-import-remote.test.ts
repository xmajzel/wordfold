import type { SupabaseClient } from '@supabase/supabase-js';

import { SupabaseGuestImportRemote } from './guest-import-remote';

function thenableQuery() {
  let response: { data: unknown[] | null; error: null } = { data: [], error: null };
  const pages: { data: unknown[] | null; error: null }[] = [];
  const query: {
    select: jest.Mock;
    is: jest.Mock;
    range: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
    eq: jest.Mock;
    abortSignal: jest.Mock;
    then: (resolve: (value: typeof response) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
    pages: typeof pages;
  } = {
    select: jest.fn(() => query),
    is: jest.fn(() => query),
    range: jest.fn(() => {
      response = pages.shift() ?? { data: [], error: null };
      return query;
    }),
    upsert: jest.fn(() => query),
    update: jest.fn(() => query),
    eq: jest.fn(() => query),
    abortSignal: jest.fn(() => query),
    then: (resolve: (value: typeof response) => unknown, reject: (reason: unknown) => unknown) => (
      Promise.resolve(response).then(resolve, reject)
    ),
    pages,
  };
  return query;
}

describe('SupabaseGuestImportRemote', () => {
  it('paginates active account words so conflicts beyond the first server page are visible', async () => {
    const query = thenableQuery();
    query.pages.push(
      { data: Array.from({ length: 1_000 }, (_, index) => ({ id: `word-${index}`, normalized_term: `word-${index}`, term: `Word ${index}`, definition: 'Definition' })), error: null },
      { data: [{ id: 'word-1000', normalized_term: 'last', term: 'Last', definition: 'Last definition' }], error: null },
    );
    const client = { from: jest.fn(() => query) } as unknown as SupabaseClient;

    const words = await new SupabaseGuestImportRemote(client).listActiveWords();

    expect(words).toHaveLength(1_001);
    expect(words.at(-1)).toEqual({
      id: 'word-1000', normalizedTerm: 'last', term: 'Last', definition: 'Last definition',
    });
    expect(query.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(query.range).toHaveBeenNthCalledWith(2, 1_000, 1_999);
  });

  it('uses insert-on-conflict-do-nothing semantics for append-only events', async () => {
    const query = thenableQuery();
    query.pages.push({ data: [], error: null });
    query.range.mockImplementation(() => query);
    query.upsert.mockImplementation(() => {
      query.range();
      return query;
    });
    const client = { from: jest.fn(() => query) } as unknown as SupabaseClient;
    const rows = [{ id: 'event-1', user_id: 'user-1', type: 'view', occurred_at: '2026-07-20T00:00:00.000Z' }];

    await new SupabaseGuestImportRemote(client).insertEvents(rows);

    expect(query.upsert).toHaveBeenCalledWith(rows, { onConflict: 'id', ignoreDuplicates: true });
  });

  it('uses the authenticated tombstone function for a deleted guest word', async () => {
    const query = thenableQuery();
    const client = {
      from: jest.fn(() => query),
      rpc: jest.fn(() => query),
    } as unknown as SupabaseClient;

    await new SupabaseGuestImportRemote(client).tombstoneWord('word-1');

    expect(client.rpc).toHaveBeenCalledWith('tombstone_word', { p_word_id: 'word-1' });
  });
});
