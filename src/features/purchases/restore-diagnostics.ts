import type { CustomerInfo } from 'react-native-purchases';

import { hasActiveEntitlement } from './entitlement';

export function describeRestore(info: CustomerInfo, productId: string, entitlementId: string) {
  if (hasActiveEntitlement(info, entitlementId)) {
    return { ok: true as const, message: 'Your lifetime purchase has been restored.' };
  }
  const lifetimeFound = info.allPurchasedProductIdentifiers.includes(productId)
    || info.nonSubscriptionTransactions.some((transaction) => transaction.productIdentifier === productId);
  return {
    ok: false as const,
    message: lifetimeFound
      ? 'RevenueCat returned a lifetime purchase record, but unlimited words are not active. Open Purchase diagnostics so we can investigate the unlock.'
      : 'Restore completed, but RevenueCat returned no lifetime purchase record or active unlock. This does not mean your promo code failed. Check the Google Play account used to redeem it, then open Purchase diagnostics if it still will not restore. Your Wordfold login email can be different.',
  };
}

// Deliberately select fields: never serialize CustomerInfo or a raw SDK error.
export function formatRestoreDiagnostics(appUserId: string | null, info: CustomerInfo | null, error?: unknown) {
  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    && (typeof error.code === 'number' || (typeof error.code === 'string' && /^\d+$/.test(error.code)))
    ? String(error.code) : 'unavailable';
  return [
    `Checked: ${new Date().toISOString()}`,
    `RevenueCat user ID: ${appUserId ?? 'unavailable'}`,
    `Restore request: ${info ? 'completed' : 'failed'}`,
    `Purchased product IDs: ${info ? info.allPurchasedProductIdentifiers.join(', ') || 'none' : 'unavailable'}`,
    `One-time product IDs: ${info ? [...new Set(info.nonSubscriptionTransactions.map((item) => item.productIdentifier))].join(', ') || 'none' : 'unavailable'}`,
    `Active entitlement IDs: ${info ? Object.keys(info.entitlements.active).join(', ') || 'none' : 'unavailable'}`,
    ...(!info ? [`SDK error code: ${errorCode}`] : []),
  ].join('\n');
}
