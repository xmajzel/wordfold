import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { AppSwitch } from '@/components/app-switch';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { requestReminderPermission } from '@/features/reminders/scheduler';
import { REMINDER_PRESETS } from '@/features/reminders/slots';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function OnboardingScreen() {
  const theme = useAppTheme();
  const { onboardingComplete, contentPacks, toggleContentPack, finishOnboarding, updateReminderSettings } = useAppData();
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  if (onboardingComplete) return <Redirect href="/(tabs)" />;

  const finish = async (enableReminders: boolean) => {
    setBusy(true);
    try {
      if (enableReminders) {
        const allowed = await requestReminderPermission();
        if (!allowed) Alert.alert('Reminders are off', 'You can enable notifications later in Settings.');
        await updateReminderSettings({ enabled: allowed, countPerDay: count, windowStartMinutes: 600, windowEndMinutes: 1200, timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local' });
      }
      await finishOnboarding();
      router.replace('/(tabs)');
    } finally { setBusy(false); }
  };

  return (
    <Screen scroll>
      <Animated.View entering={FadeInDown.springify().damping(17).reduceMotion(ReduceMotion.System)} style={styles.hero}><LinearGradient colors={theme.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.mark, { shadowColor: theme.shadow }]}><AppText variant="title" style={styles.markText}>W</AppText></LinearGradient><AppText variant="display" style={styles.center}>Keep useful words close.</AppText><AppText style={[styles.center, { color: theme.muted }]}>Wordfold brings back vocabulary from your lessons, work, and life without turning learning into another chore.</AppText></Animated.View>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.row}><Ionicons name="language-outline" color={theme.primary} size={24}/><View style={styles.rowText}><AppText variant="heading">English → Slovak</AppText><AppText variant="caption" style={{ color: theme.muted }}>Definitions stay in English. Translation waits behind a hint.</AppText></View></View></View>
      <View><AppText variant="heading">Add optional discovery packs</AppText><AppText style={{ color: theme.muted }}>Your own words remain the priority.</AppText></View>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>{contentPacks.map((pack) => <View key={pack.id} style={styles.packRow}><AppText variant="label" style={styles.rowText}>{pack.name}</AppText><AppSwitch accessibilityLabel={`Enable ${pack.name}`} value={pack.enabled} onValueChange={(enabled) => void toggleContentPack(pack.id, enabled)}/></View>)}</View>
      <View><AppText variant="heading">Choose a gentle rhythm</AppText><AppText style={{ color: theme.muted }}>Preferred times between 10:00 and 20:00. You can change this later.</AppText></View>
      <View style={styles.presets}>{REMINDER_PRESETS.map((preset) => <Pressable key={preset.count} onPress={() => setCount(preset.count)} style={[styles.preset, { backgroundColor: count === preset.count ? theme.primarySoft : theme.surface, borderColor: count === preset.count ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: count === preset.count ? theme.primary : theme.text }}>{preset.label}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{preset.description}</AppText></Pressable>)}</View>
      <PrimaryButton label="Start with reminders" loading={busy} onPress={() => void finish(true)}/>
      <Pressable accessibilityRole="button" style={styles.skipButton} onPress={() => void finish(false)}><AppText variant="label" style={[styles.skip, { color: theme.primary }]}>Start without reminders</AppText></Pressable>
      <AppText variant="caption" style={[styles.center, { color: theme.muted }]}>Everything stays on this device. Wordfold is a temporary development name.</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md }, mark: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }], shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 7 }, markText: { color: '#FFFFFF' }, center: { textAlign: 'center' },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, rowText: { flex: 1 }, packRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  presets: { gap: spacing.sm }, preset: { borderWidth: 1, borderRadius: radii.control, padding: spacing.md, gap: 2 }, skipButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, skip: { textAlign: 'center', padding: spacing.sm },
});
