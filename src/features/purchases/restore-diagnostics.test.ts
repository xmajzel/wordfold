import type { CustomerInfo } from 'react-native-purchases';

import { describeRestore, formatRestoreDiagnostics } from './restore-diagnostics';

const info = (overrides: Partial<CustomerInfo> = {}) => ({
  allPurchasedProductIdentifiers: [],
  nonSubscriptionTransactions: [],
  entitlements: { active: {}, all: {} },
  ...overrides,
}) as CustomerInfo;

it('only reports restoration success for the active unlimited entitlement', () => {
  const customer = info({ entitlements: { active: { unlimited_words: {} } } as unknown as CustomerInfo['entitlements'] });
  expect(describeRestore(customer, 'wordfold_lifetime', 'unlimited_words').ok).toBe(true);
  expect(describeRestore(customer, 'wordfold_lifetime', 'other').ok).toBe(false);
});

it.each([
  { allPurchasedProductIdentifiers: ['wordfold_lifetime'] },
  { nonSubscriptionTransactions: [{ productIdentifier: 'wordfold_lifetime' }] },
])('distinguishes a purchase record without the required entitlement', (record) => {
  const result = describeRestore(info(record as Partial<CustomerInfo>), 'wordfold_lifetime', 'unlimited_words');
  expect(result.ok).toBe(false);
  expect(result.message).toContain('returned a lifetime purchase record');
});

it('does not claim an empty response proves promo redemption failed', () => {
  const result = describeRestore(info(), 'wordfold_lifetime', 'unlimited_words');
  expect(result.ok).toBe(false);
  expect(result.message).toContain('This does not mean your promo code failed');
});

it('includes diagnostic identifiers without serializing receipts or transaction secrets', () => {
  const customer = info({
    allPurchasedProductIdentifiers: ['wordfold_lifetime'],
    nonSubscriptionTransactions: [{ productIdentifier: 'wordfold_lifetime', transactionIdentifier: 'secret-transaction' }] as CustomerInfo['nonSubscriptionTransactions'],
    originalAppUserId: 'other-original-user',
  });
  const report = formatRestoreDiagnostics('current-user', customer);
  expect(report).toContain('RevenueCat user ID: current-user');
  expect(report).toContain('One-time product IDs: wordfold_lifetime');
  expect(report).toContain('Active entitlement IDs: none');
  expect(report).not.toContain('secret-transaction');
  expect(report).not.toContain('other-original-user');
});

it('distinguishes failed requests from empty results and only includes numeric error codes', () => {
  const report = formatRestoreDiagnostics(null, null, { code: '10', message: 'secret-token', userInfo: { receipt: 'secret-receipt' } });
  expect(report).toContain('Restore request: failed');
  expect(report).toContain('Purchased product IDs: unavailable');
  expect(report).toContain('SDK error code: 10');
  expect(report).not.toContain('secret');
  expect(formatRestoreDiagnostics(null, null, { code: 'secret-code' })).toContain('SDK error code: unavailable');
});
