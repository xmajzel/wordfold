import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { ModalHeader } from '@/app/word/new';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { FREE_WORD_LIMIT } from '@/features/purchases/capacity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePurchase } from '@/providers/purchase-provider';
import { radii, spacing } from '@/theme/tokens';

export default function UpgradeScreen() {
  const theme = useAppTheme();
  const purchase = usePurchase();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);

  const buy = async () => {
    setBusy('purchase');
    try {
      const result = await purchase.purchaseLifetime();
      if (result.ok) {
        Alert.alert('Unlimited words unlocked', result.message, [{ text: 'Continue', onPress: () => router.back() }]);
      } else if (!result.cancelled) Alert.alert('Purchase unavailable', result.message);
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const result = await purchase.restorePurchases();
      Alert.alert(result.ok ? 'Purchase restored' : 'Nothing to restore', result.message, result.ok
        ? [{ text: 'Continue', onPress: () => router.back() }]
        : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll>
      <ModalHeader title="Unlimited Wordfold" />
      <View testID="lifetime-paywall" style={[styles.hero, { backgroundColor: theme.primarySoft }]}>
        <View style={[styles.icon, { backgroundColor: theme.surface }]}>
          <Ionicons name="infinite-outline" color={theme.primary} size={34}/>
        </View>
        <AppText variant="title" style={styles.center}>Keep every word</AppText>
        <AppText style={[styles.center, { color: theme.muted }]}>Use Wordfold free for your first {FREE_WORD_LIMIT} words, then unlock an unlimited library forever.</AppText>
      </View>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Benefit icon="checkmark-circle-outline" text="One purchase, not a subscription" />
        <Benefit icon="cloud-done-outline" text="Works with local and synchronized vocabulary" />
        <Benefit icon="shield-checkmark-outline" text="No ads and no sale of personal data" />
      </View>
      {purchase.unlimited ? (
        <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="checkmark-circle" color={theme.success} size={22}/>
          <AppText style={styles.flex}>Unlimited words are already unlocked.</AppText>
        </View>
      ) : (
        <PrimaryButton
          testID="lifetime-purchase-button"
          label={purchase.priceLabel ? `Unlock forever · ${purchase.priceLabel}` : 'Unlock forever with Google Play'}
          loading={busy === 'purchase'}
          disabled={purchase.status !== 'ready'}
          onPress={() => void buy()}
        />
      )}
      {purchase.message && !purchase.unlimited ? <AppText variant="caption" style={[styles.center, { color: theme.muted }]}>{purchase.message}</AppText> : null}
      <PrimaryButton
        testID="restore-purchases-button"
        label="Restore purchase"
        variant="secondary"
        loading={busy === 'restore'}
        disabled={purchase.status === 'loading'}
        onPress={() => void restore()}
      />
      <AppText variant="caption" style={[styles.center, { color: theme.muted }]}>Your purchase is handled by Google Play. A Wordfold cloud account is not required.</AppText>
    </Screen>
  );
}

function Benefit({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const theme = useAppTheme();
  return <View style={styles.row}><Ionicons name={icon} color={theme.primary} size={22}/><AppText style={styles.flex}>{text}</AppText></View>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.card, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  icon: { width: 64, height: 64, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notice: { borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
});
