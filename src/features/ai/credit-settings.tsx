import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/app-text';
import { AiButton, AiHeading } from './ai-presentation';
import { useAuth } from '@/providers/auth-provider';
import { spacing } from '@/theme/tokens';
import { fetchAiBalance, type AiBalance } from './client';

export function CreditSettings() {
  const { user } = useAuth();
  return user?.id ? <SignedInCredits key={user.id}/> : <View style={{ gap: spacing.sm }}>
    <AiHeading>AI credits</AiHeading><AppText>Sign in to receive 10 starter credits and keep your balance across devices.</AppText>
    <AiButton label="Sign in for AI credits" onPress={() => router.push('/account')}/>
  </View>;
}
function SignedInCredits() {
  const [account, setAccount] = useState<AiBalance | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const refresh = useCallback(async () => {
    try { setAccount(await fetchAiBalance(true)); setMessage(null); }
    catch { setMessage('AI credits could not be refreshed. Check your connection and try again.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  return <View style={{ gap: spacing.sm }}>
    <AiHeading>AI credits{account ? ` · ${account.balance} remaining` : ''}</AiHeading>
    <AppText>One credit generates a definition, translation, and example. Manual entry and dictionary lookup are free.</AppText>
    <AppText variant="caption">{account?.paidGrant ? 'Includes 50 one-time credits with your lifetime purchase.' : 'Includes 10 one-time starter credits. Verified lifetime purchases receive 40 additional credits.'}</AppText>
    {account?.purchaseVerificationUnavailable ? <AppText>Purchase verification is temporarily unavailable. Your existing credits remain usable.</AppText> : null}
    {account?.purchaseClaimedElsewhere ? <AppText>This purchase’s bonus credits were already claimed by another account.</AppText> : null}
    {message ? <AppText>{message}</AppText> : null}
    <AiButton label="Refresh AI credits" loading={busy} onPress={() => { setBusy(true); void refresh(); }}/>
  </View>;
}
