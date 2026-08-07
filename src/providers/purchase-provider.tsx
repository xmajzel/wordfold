import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import { hasActiveEntitlement, isPurchaseCancellation } from '@/features/purchases/entitlement';

export const LIFETIME_PRODUCT_ID = 'wordfold_lifetime';
export const UNLIMITED_WORDS_ENTITLEMENT = 'unlimited_words';

type PurchaseActionResult =
  | { ok: true; message: string }
  | { ok: false; cancelled?: boolean; message: string };

type PurchaseContextValue = {
  status: 'loading' | 'ready' | 'unavailable';
  unlimited: boolean;
  priceLabel: string | null;
  message: string | null;
  purchaseLifetime(): Promise<PurchaseActionResult>;
  restorePurchases(): Promise<PurchaseActionResult>;
};

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

function hasUnlimitedEntitlement(customerInfo: CustomerInfo) {
  return hasActiveEntitlement(customerInfo, UNLIMITED_WORDS_ENTITLEMENT);
}

function isCancelledPurchase(error: unknown) {
  return isPurchaseCancellation(error, PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
}

function unavailableMessage() {
  if (Platform.OS !== 'android') return 'Lifetime purchases are available in the Android app.';
  return 'Google Play purchases are not configured for this build.';
}

export function PurchaseProvider({ children }: PropsWithChildren) {
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
  const available = Platform.OS === 'android' && Boolean(apiKey);
  const [status, setStatus] = useState<PurchaseContextValue['status']>(available ? 'loading' : 'unavailable');
  const [unlimited, setUnlimited] = useState(false);
  const [lifetimePackage, setLifetimePackage] = useState<PurchasesPackage | null>(null);
  const [message, setMessage] = useState<string | null>(available ? null : unavailableMessage());

  const applyCustomerInfo = useCallback((customerInfo: CustomerInfo) => {
    setUnlimited(hasUnlimitedEntitlement(customerInfo));
  }, []);

  const refresh = useCallback(async () => {
    if (!available) return;
    const customerInfo = await Purchases.getCustomerInfo();
    applyCustomerInfo(customerInfo);
    try {
      const offerings = await Purchases.getOfferings();
      const packageValue = offerings.current?.availablePackages.find(
        (candidate) => candidate.product.identifier === LIFETIME_PRODUCT_ID,
      ) ?? null;
      setLifetimePackage(packageValue);
      setMessage(packageValue ? null : 'The lifetime product is not available from Google Play yet.');
    } catch {
      setLifetimePackage(null);
      setMessage(hasUnlimitedEntitlement(customerInfo)
        ? null
        : 'Google Play products could not be loaded. Try again when you are online.');
    }
    setStatus('ready');
  }, [applyCustomerInfo, available]);

  useEffect(() => {
    if (!available || !apiKey) return;
    let active = true;
    const listener = (customerInfo: CustomerInfo) => {
      if (active) applyCustomerInfo(customerInfo);
    };
    void (async () => {
      try {
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        if (!(await Purchases.isConfigured())) Purchases.configure({ apiKey });
        Purchases.addCustomerInfoUpdateListener(listener);
        await refresh();
      } catch {
        if (!active) return;
        setStatus('unavailable');
        setMessage('Google Play purchases could not be reached. Try again when you are online.');
      }
    })();
    return () => {
      active = false;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [apiKey, applyCustomerInfo, available, refresh]);

  const purchaseLifetime = useCallback(async (): Promise<PurchaseActionResult> => {
    if (!available || status !== 'ready' || !lifetimePackage) {
      return { ok: false, message: message ?? unavailableMessage() };
    }
    try {
      const result = await Purchases.purchasePackage(lifetimePackage);
      applyCustomerInfo(result.customerInfo);
      if (!hasUnlimitedEntitlement(result.customerInfo)) {
        return { ok: false, message: 'Google Play completed the purchase, but the unlock is still being confirmed. Use Restore purchase in a moment.' };
      }
      return { ok: true, message: 'Unlimited words are unlocked on this device.' };
    } catch (error) {
      if (isCancelledPurchase(error)) return { ok: false, cancelled: true, message: 'Purchase cancelled.' };
      return { ok: false, message: 'The purchase could not be completed. Check Google Play and try again.' };
    }
  }, [applyCustomerInfo, available, lifetimePackage, message, status]);

  const restorePurchases = useCallback(async (): Promise<PurchaseActionResult> => {
    if (!available) return { ok: false, message: unavailableMessage() };
    try {
      const customerInfo = await Purchases.restorePurchases();
      applyCustomerInfo(customerInfo);
      return hasUnlimitedEntitlement(customerInfo)
        ? { ok: true, message: 'Your lifetime purchase has been restored.' }
        : { ok: false, message: 'No lifetime purchase was found for this Google Play account.' };
    } catch {
      return { ok: false, message: 'Purchases could not be restored. Check your connection and Google Play account.' };
    }
  }, [applyCustomerInfo, available]);

  const value = useMemo<PurchaseContextValue>(() => ({
    status,
    unlimited,
    priceLabel: lifetimePackage?.product.priceString ?? null,
    message,
    purchaseLifetime,
    restorePurchases,
  }), [lifetimePackage?.product.priceString, message, purchaseLifetime, restorePurchases, status, unlimited]);

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase() {
  const value = useContext(PurchaseContext);
  if (!value) throw new Error('usePurchase must be used inside PurchaseProvider');
  return value;
}
