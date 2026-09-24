import { openDatabaseAsync } from 'expo-sqlite';

import { resolveImportedCollectionId } from './legacy-collection-id';

const mockGetFirstAsync = jest.fn();
const mockCloseAsync = jest.fn(async () => undefined);

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
    closeAsync: mockCloseAsync,
  })),
}));

describe('resolveImportedCollectionId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses only the completed account import mapping for the original collection', async () => {
    const remoteId = '22222222-2222-4222-8222-222222222222';
    mockGetFirstAsync.mockResolvedValue({ remote_id: remoteId });

    await expect(resolveImportedCollectionId('account-1', 'my-words')).resolves.toBe(remoteId);

    const [query, accountId, localId] = mockGetFirstAsync.mock.calls[0];
    expect(query).toContain("mapping.entity_type = 'collection'");
    expect(query).toContain('mapping.account_id = ?');
    expect(query).toContain('mapping.source_updated_at IS NOT NULL');
    expect(query).toContain("imported.state = 'completed'");
    expect([accountId, localId]).toEqual(['account-1', 'my-words']);
    expect(openDatabaseAsync).toHaveBeenCalledWith('wordfold.sqlite');
    expect(mockCloseAsync).toHaveBeenCalledTimes(1);
  });

  it('returns no mapping for an invalid remote ID and closes the database', async () => {
    mockGetFirstAsync.mockResolvedValue({ remote_id: 'my-words' });

    await expect(resolveImportedCollectionId('account-1', 'my-words')).resolves.toBeNull();
    expect(mockCloseAsync).toHaveBeenCalledTimes(1);
  });
});
