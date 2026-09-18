import { useAuth } from '@/providers/auth-provider';
import { fetchAiBalance } from '@/features/ai/client';
import { reconcilePurchaseIdentity, revenuecatIdentity, withPurchaseLock } from '@/features/purchases/identity';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
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
import { describeRestore, formatRestoreDiagnostics } from '@/features/purchases/restore-diagnostics';

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
  restoreDiagnostics: string | null;
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
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const currentUser = useRef(userId);
  useLayoutEffect(() => { currentUser.current = userId; }, [userId]);
  const [boundUser, setBoundUser] = useState<string | null>(null);
  const identityReady = useRef(false);
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
  const available = Platform.OS === 'android' && Boolean(apiKey);
  const [status, setStatus] = useState<PurchaseContextValue['status']>(available ? 'loading' : 'unavailable');
  const [unlimited, setUnlimited] = useState(false);
  const [lifetimePackage, setLifetimePackage] = useState<PurchasesPackage | null>(null);
  const [restoreDiagnostics, setRestoreDiagnostics] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(available ? null : unavailableMessage());

  const applyCustomerInfo = useCallback((customerInfo: CustomerInfo) => {
    setUnlimited(hasUnlimitedEntitlement(customerInfo));
  }, []);

  const refresh = useCallback(async () => {
    if (!available) return;
    const customerInfo = await Purchases.getCustomerInfo();
    if (currentUser.current !== userId) return;
    applyCustomerInfo(customerInfo);
    try {
      const offerings = await Purchases.getOfferings();
      if (currentUser.current !== userId) return;
      const packageValue = offerings.current?.availablePackages.find(
        (candidate) => candidate.product.identifier === LIFETIME_PRODUCT_ID,
      ) ?? null;
      setLifetimePackage(packageValue);
      setMessage(packageValue ? null : 'The lifetime product is not available from Google Play yet.');
    } catch {
      if (currentUser.current !== userId) return;
      setLifetimePackage(null);
      setMessage(hasUnlimitedEntitlement(customerInfo)
        ? null
        : 'Google Play products could not be loaded. Try again when you are online.');
    }
    if (currentUser.current !== userId) return;
    setBoundUser(userId);
    setStatus('ready');
  }, [applyCustomerInfo, available, userId]);

  useEffect(() => {
    if (!available || !apiKey || auth.status === 'loading') return;
    identityReady.current = false;
    let active = true;
    const listener = (customerInfo: CustomerInfo) => {
      if (active && identityReady.current) applyCustomerInfo(customerInfo);
    };
    void withPurchaseLock(async () => {
      if (!active) return;
      setStatus('loading'); setUnlimited(false);
      try {
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        if (!(await Purchases.isConfigured())) Purchases.configure({ apiKey });
        const identity = userId ? await revenuecatIdentity(userId) : null;
        if (!active) return;
        await reconcilePurchaseIdentity(Purchases, identity);
        if (!active) return;
        identityReady.current = true;
        Purchases.addCustomerInfoUpdateListener(listener);
        await refresh();
        if (identity && active) void fetchAiBalance(true).catch(() => undefined);
      } catch {
        if (!active) return;
        setStatus('unavailable');
        setMessage('Google Play purchases could not be reached. Try again when you are online.');
      }
    });
    return () => {
      active = false;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [apiKey, applyCustomerInfo, available, refresh, userId, auth.status]);

  const purchaseLifetime = useCallback(async (): Promise<PurchaseActionResult> => {
    if (!available || !identityReady.current || status !== 'ready' || !lifetimePackage) {
      return { ok: false, message: message ?? unavailableMessage() };
    }
    try {
      const result = await withPurchaseLock(async () => {
        if (currentUser.current !== userId || !identityReady.current) throw new Error('Account changed');
        return Purchases.purchasePackage(lifetimePackage);
      });
      if (currentUser.current !== userId) return { ok: false, message: 'Your account changed. Restore the purchase after signing in.' };
      if (userId) void fetchAiBalance(true).catch(() => undefined);
      applyCustomerInfo(result.customerInfo);
      if (!hasUnlimitedEntitlement(result.customerInfo)) {
        return { ok: false, message: 'Google Play completed the purchase, but the unlock is still being confirmed. Use Restore purchase in a moment.' };
      }
      return { ok: true, message: 'Unlimited words are unlocked on this device.' };
    } catch (error) {
      if (isCancelledPurchase(error)) return { ok: false, cancelled: true, message: 'Purchase cancelled.' };
      return { ok: false, message: 'The purchase could not be completed. Check Google Play and try again.' };
    }
  }, [applyCustomerInfo, available, lifetimePackage, message, status, userId]);

  const restorePurchases = useCallback(async (): Promise<PurchaseActionResult> => {
    if (!available || !identityReady.current) return { ok: false, message: 'Purchases are not ready yet. Please try again.' };
    setRestoreDiagnostics(null);
    // A diagnostic lookup must not prevent restoration if it fails.
    const appUserId = await Purchases.getAppUserID().catch(() => null);
    try {
      const customerInfo = await withPurchaseLock(async () => {
        if (currentUser.current !== userId) throw new Error('Account changed');
        const identity = userId ? await revenuecatIdentity(userId) : null;
        await reconcilePurchaseIdentity(Purchases, identity);
        return Purchases.restorePurchases();
      });
      if (currentUser.current !== userId) return { ok: false, message: 'Your account changed. Please try again.' };
      if (userId) void fetchAiBalance(true).catch(() => undefined);
      applyCustomerInfo(customerInfo);
      setRestoreDiagnostics(formatRestoreDiagnostics(appUserId, customerInfo));
      return describeRestore(customerInfo, LIFETIME_PRODUCT_ID, UNLIMITED_WORDS_ENTITLEMENT);
    } catch (error) {
      setRestoreDiagnostics(formatRestoreDiagnostics(appUserId, null, error));
      return { ok: false, message: 'The restore request failed. Check your connection and try again. Purchase diagnostics contains the error code; this failure does not mean you do not own the lifetime unlock.' };
    }
  }, [applyCustomerInfo, available, userId]);

  const value = useMemo<PurchaseContextValue>(() => ({
    status: available && boundUser !== userId && status !== 'unavailable' ? 'loading' : status,
    unlimited: boundUser === userId && unlimited,
    priceLabel: lifetimePackage?.product.priceString ?? null,
    message,
    restoreDiagnostics,
    purchaseLifetime,
    restorePurchases,
  }), [available, boundUser, userId, lifetimePackage?.product.priceString, message, restoreDiagnostics, purchaseLifetime, restorePurchases, status, unlimited]);

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase() {
  const value = useContext(PurchaseContext);
  if (!value) throw new Error('usePurchase must be used inside PurchaseProvider');
  return value;
}
