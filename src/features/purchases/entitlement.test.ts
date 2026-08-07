import { hasActiveEntitlement, isPurchaseCancellation } from './entitlement';

describe('purchase entitlement helpers', () => {
  it('recognizes only the requested entitlement', () => {
    const customerInfo = {
      entitlements: { active: { unlimited_words: { identifier: 'unlimited_words' } } },
    };

    expect(hasActiveEntitlement(customerInfo, 'unlimited_words')).toBe(true);
    expect(hasActiveEntitlement(customerInfo, 'another_entitlement')).toBe(false);
  });

  it('recognizes both supported cancellation shapes', () => {
    expect(isPurchaseCancellation({ userCancelled: true }, 'cancelled')).toBe(true);
    expect(isPurchaseCancellation({ code: 'cancelled' }, 'cancelled')).toBe(true);
    expect(isPurchaseCancellation({ code: 'network' }, 'cancelled')).toBe(false);
  });
});
