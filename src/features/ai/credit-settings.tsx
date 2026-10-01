import { useCallback, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppText } from '@/components/app-text';
import { AiButton, AiHeading } from './ai-presentation';
import { useAuth } from '@/providers/auth-provider';
import { spacing } from '@/theme/tokens';
import { fetchAiBalance, type AiBalance } from './client';

export function CreditSettings() {
  const { user } = useAuth();
  return user?.id ? <SignedInCredits key={user.id}/> : <View style={{ gap: spacing.sm }}>
    <AiHeading>AI credits</AiHeading><AppText>Sign in to receive 15 starter credits and keep your balance across devices.</AppText>
    <AiButton label="Sign in for AI credits" onPress={() => router.push('/account')}/>
  </View>;
}
function SignedInCredits() {
  const [account, setAccount] = useState<AiBalance | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const active = useRef(false);
  const refresh = useCallback(async () => {
    try { const value = await fetchAiBalance(true); if (active.current) { setAccount(value); setMessage(null); } }
    catch { if (active.current) setMessage('AI credits could not be refreshed. Check your connection and try again.'); }
    finally { if (active.current) setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { active.current = true; void refresh(); return () => { active.current = false; }; }, [refresh]));
  return <View style={{ gap: spacing.sm }}>
    <AiHeading>AI credits{account ? ` · ${account.balance} remaining` : ''}</AiHeading>
    <AppText>One credit generates a definition, translation, and example. Manual entry and dictionary lookup are free.</AppText>
    <AppText variant="caption">{account?.paidGrant ? 'Includes 75 one-time credits with your lifetime purchase.' : 'Includes 15 one-time starter credits. Verified lifetime purchases receive 60 additional credits.'}</AppText>
    {account?.purchaseVerificationUnavailable ? <AppText>Purchase verification is temporarily unavailable. Your existing credits remain usable.</AppText> : null}
    {account?.purchaseClaimedElsewhere ? <AppText>This purchase’s bonus credits were already claimed by another account.</AppText> : null}
    {message ? <AppText>{message}</AppText> : null}
    {Platform.OS === 'android' ? <AiButton label="Buy AI credits" onPress={() => router.push('/ai-credits')}/> : null}
    <AiButton label="Refresh AI credits" loading={busy} onPress={() => { setBusy(true); void refresh(); }}/>
  </View>;
}
