import { useCallback, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAuth } from '@/providers/auth-provider';
import { usePurchase } from '@/providers/purchase-provider';
import { AI_CREDIT_PACK_SIZE } from '@/features/purchases/credit-pack';
import { spacing } from '@/theme/tokens';
import { AiButton, AiHeading, AiSurface } from './ai-presentation';
import { fetchAiBalance, fetchCreditPurchaseStatus, type AiBalance } from './client';

export function CreditShop() {
  const { user } = useAuth();
  return <Screen scroll>
    <PrimaryButton label="Back" variant="secondary" onPress={() => router.back()}/>
    <AppText variant="title">AI credits</AppText>
    {user ? <SignedInCreditShop key={user.id}/> : <>
      <AppText>Sign in to buy AI credits and keep your balance across devices.</AppText>
      <AiButton label="Sign in for AI credits" onPress={() => router.push('/account')}/>
    </>}
  </Screen>;
}

function SignedInCreditShop() {
  const purchase = usePurchase();
  const [account, setAccount] = useState<AiBalance | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'refresh' | 'purchase' | null>('refresh');
  const [pending, setPending] = useState(false);
  const transactionId = useRef<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const previousPackCount = useRef<number | undefined>(undefined);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (mounted.current) setBusy('refresh');
    try {
      const currentTransaction = transactionId.current;
      const value = currentTransaction ? await fetchCreditPurchaseStatus(currentTransaction) : await fetchAiBalance(true);
      if (!mounted.current) return;
      setAccount(value);
      if ('creditPurchaseStatus' in value && value.creditPurchaseStatus !== 'pending') {
        setPending(false); transactionId.current = null;
        setMessage(value.creditPurchaseStatus === 'credited' ? '100 AI credits have been added to your account.' : 'This purchase was refunded. Your balance is up to date.');
      } else if (!currentTransaction && previousPackCount.current !== undefined && value.creditPackCount !== undefined && value.creditPackCount > previousPackCount.current) {
        setPending(false); previousPackCount.current = undefined;
        setMessage('Your purchased credits have been added to your account.');
      }
    } catch { if (mounted.current) setMessage('Your balance could not be refreshed. Check your connection and try again.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(null); }
  }, []);
  useFocusEffect(useCallback(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]));
  const buy = async () => {
    if (inFlight.current || pending) return;
    inFlight.current = true; setBusy('purchase'); setMessage(null);
    try {
      const result = await purchase.purchaseCreditPack();
      if (!mounted.current) return;
      if (!result.ok && result.cancelled) return;
      setMessage(result.message);
      if (result.ok) {
        previousPackCount.current = result.previousPackCount;
        setPending(Boolean(result.pending)); transactionId.current = result.transactionId ?? null;
        try {
          const value = await fetchAiBalance();
          if (mounted.current) setAccount(value);
        } catch { /* Preserve the payment result; Refresh balance recovers confirmation. */ }
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(null); }
  };
  return <View style={{ gap: spacing.lg }}>
    <AiHeading>{account ? `${account.balance} credits remaining` : 'Your AI balance'}</AiHeading>
    <AiSurface>
      <AppText variant="title">{AI_CREDIT_PACK_SIZE} AI credits</AppText>
      <AppText>One credit generates a definition, translation, and example. Buy this pack whenever you need more.</AppText>
      <AppText variant="caption">One-time purchase. Credits do not expire and belong to your signed-in Wordfold account.</AppText>
      {Platform.OS === 'android' ? <AiButton
        label={purchase.creditPackPriceLabel ? `Buy ${AI_CREDIT_PACK_SIZE} credits · ${purchase.creditPackPriceLabel}` : `Buy ${AI_CREDIT_PACK_SIZE} credits with Google Play`}
        loading={busy === 'purchase'}
        disabled={busy !== null || pending || !account || purchase.status !== 'ready' || !purchase.creditPackPriceLabel}
        onPress={() => void buy()}/>
        : <AppText>AI credit purchases are available in the Android app.</AppText>}
      {Platform.OS === 'android' && purchase.creditPackMessage ? <AppText>{purchase.creditPackMessage}</AppText> : null}
    </AiSurface>
    {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
    <AiButton label="Refresh balance" loading={busy === 'refresh'} disabled={busy !== null} onPress={() => {
      void refresh();
      void purchase.refreshCreditProduct();
    }}/>
    <AppText variant="caption">Payments are handled by Google Play. Confirmed credits remain available across devices when you sign in to the same Wordfold account. Manual entry and dictionary lookup are free.</AppText>
  </View>;
}
