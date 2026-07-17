import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { requestReminderPermission } from '@/features/reminders/scheduler';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

const confetti = [
  { x: 6, y: 30, color: 'accent', rotation: '-24deg', delay: 80 },
  { x: 34, y: 2, color: 'primary', rotation: '18deg', delay: 160 },
  { x: 68, y: 20, color: 'success', rotation: '40deg', delay: 40 },
  { x: 164, y: 26, color: 'accent', rotation: '22deg', delay: 120 },
  { x: 190, y: 58, color: 'primary', rotation: '-18deg', delay: 220 },
  { x: 150, y: 4, color: 'success', rotation: '-36deg', delay: 260 },
  { x: 20, y: 104, color: 'success', rotation: '32deg', delay: 300 },
  { x: 176, y: 110, color: 'accent', rotation: '-12deg', delay: 340 },
] as const;

export default function OnboardingReadyScreen() {
  const theme = useAppTheme();
  const { count } = useLocalSearchParams<{ count?: string }>();
  const { onboardingComplete, updateReminderSettings } = useAppData();
  const [busy, setBusy] = useState(false);
  const wordCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  if (onboardingComplete === false) return <Redirect href="/onboarding" />;

  const finish = () => router.replace('/(tabs)');
  const enableReminders = async () => {
    setBusy(true);
    try {
      const allowed = Platform.OS === 'web' ? false : await requestReminderPermission();
      if (!allowed) {
        Alert.alert('Reminders are off', Platform.OS === 'web'
          ? 'Reminders can be enabled from the mobile app later.'
          : 'You can enable notifications later in Settings.');
        finish();
        return;
      }
      await updateReminderSettings({
        enabled: true,
        countPerDay: 2,
        windowStartMinutes: 600,
        windowEndMinutes: 1200,
        timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
      });
      finish();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.content}>
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.celebration}>
          {confetti.map((piece, index) => <View
            key={`${piece.x}-${piece.y}`}
            style={[styles.confettiPosition, {
              left: piece.x,
              top: piece.y,
              transform: [{ rotate: piece.rotation }],
            }]}>
            <Animated.View
              entering={FadeInDown.delay(piece.delay).duration(520).reduceMotion(ReduceMotion.System)}
              style={[styles.confetti, {
                backgroundColor: theme[piece.color],
                borderRadius: index % 3 === 0 ? 6 : 2,
              }]}
            />
          </View>)}
          <Animated.View entering={ZoomIn.springify().damping(12).reduceMotion(ReduceMotion.System)}>
            <LinearGradient colors={theme.primaryGradient} style={styles.successMark}>
              <Ionicons name="checkmark" color="#FFFFFF" size={42}/>
            </LinearGradient>
          </Animated.View>
        </View>
        <Animated.View entering={FadeInDown.delay(180).duration(420).reduceMotion(ReduceMotion.System)} style={styles.heading}>
          <AppText variant="display" style={styles.center}>Your first words are ready.</AppText>
          <AppText style={[styles.center, { color: theme.muted }]}>{wordCount} carefully selected {wordCount === 1 ? 'word is' : 'words are'} waiting in your library.</AppText>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(280).duration(460).reduceMotion(ReduceMotion.System)} style={[styles.reminderCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Ionicons name="notifications-outline" color={theme.primary} size={27}/></View>
          <AppText variant="heading" style={styles.center}>Would a gentle reminder help?</AppText>
          <AppText style={[styles.center, { color: theme.muted }]}>Two words between 10:00 and 20:00. You can adjust the rhythm or turn it off whenever you like.</AppText>
          <View style={styles.fullWidth}><PrimaryButton label="Enable gentle reminders" loading={busy} onPress={() => void enableReminders()} icon={<Ionicons name="notifications" color="#FFFFFF" size={18}/>}/></View>
          <Pressable accessibilityRole="button" onPress={finish} style={styles.laterButton}><AppText variant="label" style={{ color: theme.primary }}>Maybe later</AppText></Pressable>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { width: '100%', maxWidth: 560, alignSelf: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  content: { alignItems: 'center', gap: spacing.xl },
  celebration: { width: 212, height: 130, alignItems: 'center', justifyContent: 'center' },
  confettiPosition: { position: 'absolute' },
  confetti: { width: 10, height: 18 },
  successMark: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  heading: { gap: spacing.sm },
  center: { textAlign: 'center' },
  reminderCard: { width: '100%', borderWidth: 1, borderRadius: radii.sheet, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  icon: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  laterButton: { minHeight: 44, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
});
