import type { SupabaseClient } from '@supabase/supabase-js';

import { SupabasePowerSyncConnector } from './connector';

describe('SupabasePowerSyncConnector', () => {
  it('returns the current Supabase access token as PowerSync credentials', async () => {
    const client = {
      auth: {
        getSession: jest.fn(async () => ({
          data: { session: { access_token: 'access-token', expires_at: 1_800_000_000 } },
          error: null,
        })),
      },
    } as unknown as SupabaseClient;
    const connector = new SupabasePowerSyncConnector(client, 'https://sync.example.com');

    await expect(connector.fetchCredentials()).resolves.toEqual({
      endpoint: 'https://sync.example.com',
      token: 'access-token',
      expiresAt: new Date(1_800_000_000_000),
    });
  });

  it('returns no credentials while signed out', async () => {
    const client = {
      auth: { getSession: jest.fn(async () => ({ data: { session: null }, error: null })) },
    } as unknown as SupabaseClient;

    await expect(new SupabasePowerSyncConnector(client, 'https://sync.example.com').fetchCredentials()).resolves.toBeNull();
  });

  it('does nothing when the upload queue is empty', async () => {
    const client = {} as SupabaseClient;
    const database = { getNextCrudTransaction: jest.fn(async () => null) };
    const connector = new SupabasePowerSyncConnector(client, 'https://sync.example.com');

    await expect(connector.uploadData(database as never)).resolves.toBeUndefined();
  });
});
