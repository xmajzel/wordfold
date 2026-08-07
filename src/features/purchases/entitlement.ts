type CustomerEntitlements = {
  entitlements: {
    active: Record<string, unknown>;
  };
};

export function hasActiveEntitlement(
  customerInfo: CustomerEntitlements,
  entitlementId: string,
) {
  return customerInfo.entitlements.active[entitlementId] !== undefined;
}

export function isPurchaseCancellation(error: unknown, cancellationCode: string | number) {
  return typeof error === 'object' && error !== null
    && (('userCancelled' in error && error.userCancelled === true)
      || ('code' in error && error.code === cancellationCode));
}
