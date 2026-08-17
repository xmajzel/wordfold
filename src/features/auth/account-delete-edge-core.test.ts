import { handleAccountDelete } from '../../../supabase/functions/account-delete/core';

function dependencies() {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    listPrivateObjectKeys: jest.fn(async () => [
      '11111111-1111-4111-8111-111111111111/version/hash.mp3',
    ]),
    removePrivateObjects: jest.fn(async () => undefined),
    deleteUser: jest.fn(async () => undefined),
  };
}

describe('account-delete edge core', () => {
  it('removes private objects before deleting the authenticated user', async () => {
    const deps = dependencies();
    const order: string[] = [];
    deps.removePrivateObjects.mockImplementation(async () => { order.push('storage'); });
    deps.deleteUser.mockImplementation(async () => { order.push('auth'); });

    const response = await handleAccountDelete(new Request('https://example.test', { method: 'POST' }), deps);

    expect(response.status).toBe(204);
    expect(order).toEqual(['storage', 'auth']);
  });

  it('never deletes the user when a storage key has an unexpected owner', async () => {
    const deps = dependencies();
    deps.listPrivateObjectKeys.mockResolvedValueOnce(['another-user/version/hash.mp3']);

    const response = await handleAccountDelete(new Request('https://example.test', { method: 'POST' }), deps);

    expect(response.status).toBe(503);
    expect(deps.removePrivateObjects).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it('does not delete auth when storage cleanup fails', async () => {
    const deps = dependencies();
    deps.removePrivateObjects.mockRejectedValueOnce(new Error('storage unavailable'));

    const response = await handleAccountDelete(new Request('https://example.test', { method: 'POST' }), deps);

    expect(response.status).toBe(503);
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });
});
