import { requestCloudAccountDeletion } from './account-deletion';

describe('cloud account deletion client', () => {
  it('invokes the authenticated deletion function without sending account data', async () => {
    const invoke = jest.fn(async () => ({ data: null, error: null }));

    await requestCloudAccountDeletion({ functions: { invoke } } as never);

    expect(invoke).toHaveBeenCalledWith('account-delete', { method: 'POST', body: {} });
  });

  it('fails safely when the service cannot be reached', async () => {
    const invoke = jest.fn(async () => { throw new TypeError('offline'); });

    await expect(requestCloudAccountDeletion({ functions: { invoke } } as never))
      .rejects.toEqual(expect.objectContaining({ code: 'unavailable' }));
  });
});
