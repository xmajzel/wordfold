import { reconcilePurchaseIdentity, withPurchaseLock } from './identity';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/features/ai/client', () => ({ fetchAiBalance: jest.fn() }));
it('links an existing anonymous customer so prior purchases can be merged', async () => {
  const sdk = { getAppUserID: jest.fn(async () => '$RCAnonymousID:old'), logIn: jest.fn(), logOut: jest.fn() };
  await reconcilePurchaseIdentity(sdk, 'account-id');
  expect(sdk.logIn).toHaveBeenCalledWith('account-id'); expect(sdk.logOut).not.toHaveBeenCalled();
});
it('switches directly between identified users and logs out on sign-out', async () => {
  const sdk = { getAppUserID: jest.fn(async () => 'old-account'), logIn: jest.fn(), logOut: jest.fn() };
  await reconcilePurchaseIdentity(sdk, 'new-account'); expect(sdk.logIn).toHaveBeenCalledWith('new-account');
  await reconcilePurchaseIdentity(sdk, null); expect(sdk.logOut).toHaveBeenCalledTimes(1);
});
it('does not log out an already anonymous user', async () => {
  const sdk = { getAppUserID: jest.fn(async () => '$RCAnonymousID:old'), logIn: jest.fn(), logOut: jest.fn() };
  await reconcilePurchaseIdentity(sdk, null); expect(sdk.logOut).not.toHaveBeenCalled();
});
it('serializes identity changes with purchases and recovers after errors', async () => {
  const order: string[] = []; let release!: () => void;
  const first = withPurchaseLock(async () => { order.push('purchase'); await new Promise<void>((r) => { release = r; }); throw new Error('cancelled'); });
  const caught = first.catch(() => undefined);
  const second = withPurchaseLock(async () => { order.push('switch'); });
  await Promise.resolve(); await Promise.resolve();
  expect(order).toEqual(['purchase']); release(); await caught; await second;
  expect(order).toEqual(['purchase','switch']);
});
