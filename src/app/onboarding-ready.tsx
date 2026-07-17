import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
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

type ReminderSetupState =
  | { status: 'idle' }
  | { status: 'enabled'; scheduledCount: number }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'error' }
  | { status: 'unsupported' };

export default function OnboardingReadyScreen() {
  const theme = useAppTheme();
  const { count } = useLocalSearchParams<{ count?: string }>();
  const { onboardingComplete, updateReminderSettings } = useAppData();
  const [busy, setBusy] = useState(false);
  const [reminderState, setReminderState] = useState<ReminderSetupState>(() => Platform.OS === 'web'
    ? { status: 'unsupported' }
    : { status: 'idle' });
  const wordCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  if (onboardingComplete === false) return <Redirect href="/onboarding" />;

  const finish = () => router.replace('/(tabs)');
  const enableReminders = async () => {
    setBusy(true);
    try {
      const permission = await requestReminderPermission();
      if (!permission.granted) {
        setReminderState({ status: 'denied', canAskAgain: permission.canAskAgain });
        return;
      }
      const scheduledCount = await updateReminderSettings({
        enabled: true,
        countPerDay: 2,
        windowStartMinutes: 600,
        windowEndMinutes: 1200,
        timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
      });
      setReminderState({ status: 'enabled', scheduledCount });
    } catch {
      setReminderState({ status: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reminderPresentation = reminderState.status === 'enabled'
    ? {
      icon: 'checkmark-circle-outline' as const,
      iconColor: theme.success,
      title: 'Reminders are on.',
      body: `Two words a day between 10:00 and 20:00. ${reminderState.scheduledCount} ${reminderState.scheduledCount === 1 ? 'reminder is' : 'reminders are'} scheduled ahead.`,
    }
    : reminderState.status === 'denied'
      ? {
        icon: 'notifications-off-outline' as const,
        iconColor: theme.danger,
        title: 'Reminders are off.',
        body: reminderState.canAskAgain
          ? 'Wordfold needs notification permission before it can schedule gentle reminders.'
          : 'Notifications are blocked for Wordfold. You can allow them in your device settings.',
      }
      : reminderState.status === 'error'
        ? {
          icon: 'alert-circle-outline' as const,
          iconColor: theme.danger,
          title: 'Reminders could not be scheduled.',
          body: 'Your words are ready. You can try scheduling again now or continue without reminders.',
        }
        : reminderState.status === 'unsupported'
          ? {
            icon: 'phone-portrait-outline' as const,
            iconColor: theme.primary,
            title: 'Reminders are available in the mobile app.',
            body: 'Continue to your words here. You can set a reminder rhythm later from Wordfold on your phone.',
          }
          : {
            icon: 'notifications-outline' as const,
            iconColor: theme.primary,
            title: 'Would a gentle reminder help?',
            body: 'Two words between 10:00 and 20:00. You can adjust the rhythm or turn it off whenever you like.',
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
        <Animated.View
          accessibilityLiveRegion="polite"
          entering={FadeInDown.delay(280).duration(460).reduceMotion(ReduceMotion.System)}
          style={[styles.reminderCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Ionicons name={reminderPresentation.icon} color={reminderPresentation.iconColor} size={27}/></View>
          <AppText variant="heading" style={styles.center}>{reminderPresentation.title}</AppText>
          <AppText style={[styles.center, { color: theme.muted }]}>{reminderPresentation.body}</AppText>

          {reminderState.status === 'idle' ? <>
            <View style={styles.fullWidth}><PrimaryButton label="Enable gentle reminders" loading={busy} onPress={() => void enableReminders()} icon={<Ionicons name="notifications" color="#FFFFFF" size={18}/>}/></View>
            <TextAction label="Maybe later" onPress={finish}/>
          </> : null}

          {reminderState.status === 'enabled' ? <View style={styles.fullWidth}><PrimaryButton label="Start learning" onPress={finish} icon={<Ionicons name="arrow-forward" color="#FFFFFF" size={18}/>}/></View> : null}

          {reminderState.status === 'denied' ? <>
            <View style={styles.fullWidth}><PrimaryButton
              label={reminderState.canAskAgain ? 'Try again' : 'Open system settings'}
              loading={busy}
              onPress={() => reminderState.canAskAgain ? void enableReminders() : void Linking.openSettings()}
              icon={<Ionicons name={reminderState.canAskAgain ? 'refresh' : 'settings-outline'} color="#FFFFFF" size={18}/>}
            /></View>
            <TextAction label="Continue to my words" onPress={finish}/>
          </> : null}

          {reminderState.status === 'error' ? <>
            <View style={styles.fullWidth}><PrimaryButton label="Try again" loading={busy} onPress={() => void enableReminders()} icon={<Ionicons name="refresh" color="#FFFFFF" size={18}/>}/></View>
            <TextAction label="Continue to my words" onPress={finish}/>
          </> : null}

          {reminderState.status === 'unsupported' ? <View style={styles.fullWidth}><PrimaryButton label="Continue to my words" onPress={finish} icon={<Ionicons name="arrow-forward" color="#FFFFFF" size={18}/>}/></View> : null}
        </Animated.View>
      </View>
    </Screen>
  );
}

function TextAction({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.laterButton}><AppText variant="label" style={{ color: theme.primary }}>{label}</AppText></Pressable>;
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
