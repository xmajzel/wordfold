import { act, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import { PurchaseProvider, usePurchase } from './purchase-provider';

const identityA = '11111111-1111-4111-8111-111111111111';
const identityB = '22222222-2222-4222-8222-222222222222';
let mockUser: { id: string } | null = { id: 'a' };
const mockIdentity = jest.fn();
const mockBalance = jest.fn();
const mockConfirmation = jest.fn();
const mockSDK = {
  isConfigured: jest.fn(async () => true), configure: jest.fn(), setLogLevel: jest.fn(),
  getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
  getOfferings: jest.fn(async () => ({ current: { availablePackages: [] } })),
  getProducts: jest.fn(), getAppUserID: jest.fn(),
  purchaseStoreProduct: jest.fn(), purchasePackage: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(), removeCustomerInfoUpdateListener: jest.fn(),
};
jest.mock('react-native-purchases', () => ({ __esModule: true, get default() { return mockSDK; }, LOG_LEVEL: { DEBUG: 'DEBUG' },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'CANCELLED', PAYMENT_PENDING_ERROR: '20' }, PRODUCT_CATEGORY: { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION' } }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ status: 'ready', user: mockUser }) }));
jest.mock('@/features/ai/client', () => ({ fetchAiBalance: (...args: unknown[]) => mockBalance(...args),
  fetchCreditPurchaseStatus: (...args: unknown[]) => mockConfirmation(...args) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/features/purchases/identity', () => ({
  withPurchaseLock: jest.requireActual('@/features/purchases/identity').withPurchaseLock,
  revenuecatIdentity: (...args: unknown[]) => mockIdentity(...args), reconcilePurchaseIdentity: jest.fn(),
}));
let latest: ReturnType<typeof usePurchase>;
function Probe() { const value = usePurchase(); useEffect(() => { latest = value; }, [value]); return null; }
const product = { identifier: 'wordfold_ai_credits_100', priceString: '€1.99' };
const completed = { customerInfo: { entitlements: { active: {} } }, transaction: { originalJson: '{"orderId":"GPA.order-1"}' } };
const platform = Platform.OS;
const previousKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
beforeEach(() => {
  jest.clearAllMocks(); mockUser = { id: 'a' };
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = 'test-public-key';
  mockIdentity.mockImplementation(async (id: string) => id === 'a' ? identityA : identityB);
  mockSDK.getAppUserID.mockImplementation(async () => mockUser?.id === 'a' ? identityA : identityB);
  mockSDK.getProducts.mockResolvedValue([product]);
  mockBalance.mockImplementation(async () => ({ balance: 15, revenuecatId: mockUser?.id === 'a' ? identityA : identityB, paidGrant: false }));
  mockSDK.purchaseStoreProduct.mockResolvedValue(completed);
  mockConfirmation.mockResolvedValue({ balance: 115, creditPurchaseStatus: 'credited' });
});
afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: platform, configurable: true });
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  else process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = previousKey;
});
async function ready() {
  const view = await render(<PurchaseProvider><Probe/></PurchaseProvider>);
  await waitFor(() => expect(latest.creditPackPriceLabel).toBe('€1.99'));
  return view;
}
it('loads a consumable separately from the lifetime offering and confirms its store order', async () => {
  await ready();
  let result; await act(async () => { result = await latest.purchaseCreditPack(); });
  expect(mockSDK.getProducts).toHaveBeenCalledWith(['wordfold_ai_credits_100'], 'NON_SUBSCRIPTION');
  expect(mockSDK.purchaseStoreProduct).toHaveBeenCalledWith(product);
  expect(mockSDK.purchasePackage).not.toHaveBeenCalled();
  expect(mockConfirmation).toHaveBeenCalledWith('GPA.order-1');
  expect(result).toMatchObject({ ok: true, message: '100 AI credits have been added to your account.' });
});
it('requires a signed-in, verified RevenueCat identity before charging', async () => {
  mockIdentity.mockResolvedValue(null); await ready();
  const result = await latest.purchaseCreditPack();
  expect(result.ok).toBe(false); expect(mockSDK.purchaseStoreProduct).not.toHaveBeenCalled();
});
it('rejects an SDK or wallet identity mismatch before payment', async () => {
  await ready(); mockSDK.getAppUserID.mockResolvedValueOnce('wrong');
  expect((await latest.purchaseCreditPack()).ok).toBe(false);
  mockBalance.mockResolvedValueOnce({ balance: 15, revenuecatId: identityB, paidGrant: false });
  expect((await latest.purchaseCreditPack()).ok).toBe(false);
  expect(mockSDK.purchaseStoreProduct).not.toHaveBeenCalled();
});
it('reports completed payment as pending when fulfillment or connectivity is delayed', async () => {
  await ready(); mockConfirmation.mockResolvedValueOnce({ creditPurchaseStatus: 'pending' });
  let result; await act(async () => { result = await latest.purchaseCreditPack(); });
  expect(result).toMatchObject({ ok: true, pending: true, transactionId: 'GPA.order-1' });
  mockConfirmation.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { result = await latest.purchaseCreditPack(); });
  expect(result).toMatchObject({ ok: true, pending: true, transactionId: 'GPA.order-1' });
});
it('handles cancellation without promising credits', async () => {
  await ready(); mockSDK.purchaseStoreProduct.mockRejectedValueOnce({ userCancelled: true });
  expect(await latest.purchaseCreditPack()).toMatchObject({ ok: false, cancelled: true });
  expect(mockConfirmation).not.toHaveBeenCalled();
});
it('retains a pending Google Play payment without inviting another checkout', async () => {
  await ready(); mockSDK.purchaseStoreProduct.mockRejectedValueOnce({ code: '20' });
  expect(await latest.purchaseCreditPack()).toMatchObject({ ok: true, pending: true });
  expect(mockConfirmation).not.toHaveBeenCalled();
});
it('can relink the signed-in wallet when initial identity verification was offline', async () => {
  mockIdentity.mockResolvedValueOnce(null); await ready();
  expect((await latest.purchaseCreditPack()).ok).toBe(false);
  await act(async () => { await latest.refreshCreditProduct(); });
  await waitFor(() => expect(mockIdentity).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(latest.creditPackPriceLabel).toBe('€1.99'));
  let result; await act(async () => { result = await latest.purchaseCreditPack(); });
  expect(result).toMatchObject({ ok: true });
});
it('ignores confirmation for an account changed during checkout', async () => {
  const view = await ready(); let finish!: (value: typeof completed) => void;
  mockSDK.purchaseStoreProduct.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let resultPromise!: ReturnType<typeof latest.purchaseCreditPack>;
  await act(async () => { resultPromise = latest.purchaseCreditPack(); });
  await waitFor(() => expect(mockSDK.purchaseStoreProduct).toHaveBeenCalledTimes(1));
  mockUser = { id: 'b' }; await view.rerender(<PurchaseProvider><Probe/></PurchaseProvider>);
  let result; await act(async () => { finish(completed); result = await resultPromise; });
  expect(result).toMatchObject({ ok: true, pending: true }); expect(mockConfirmation).not.toHaveBeenCalled();
});
it('blocks duplicate checkout presses while payment is open', async () => {
  await ready(); let finish!: (value: typeof completed) => void;
  mockSDK.purchaseStoreProduct.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = latest.purchaseCreditPack();
  expect((await latest.purchaseCreditPack()).ok).toBe(false);
  await waitFor(() => expect(mockSDK.purchaseStoreProduct).toHaveBeenCalledTimes(1));
  await act(async () => { finish(completed); await first; });
});
