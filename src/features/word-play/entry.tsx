import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import { useAppData } from '@/providers/app-data-provider';

export function WordPlayEntry() {
  const theme = useAppTheme();
  const { activeCourseId, dismissWordPlayIntroduction } = useAppData();
  const [busy, setBusy] = useState(false);
  const dismiss = async (open: boolean) => {
    setBusy(true);
    try {
      await dismissWordPlayIntroduction(activeCourseId);
      if (open) router.navigate('/(tabs)/play' as never);
    } catch { Alert.alert('Could not save your choice', 'Please try again.'); }
    finally { setBusy(false); }
  };
  return <View style={[styles.entry, { backgroundColor: theme.primarySoft }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Word play: refresh 10 learned words" disabled={busy}
      onPress={() => void dismiss(true)} style={({ pressed }) => [styles.open, { opacity: pressed ? 0.75 : 1 }]}>
    <Ionicons name="extension-puzzle-outline" size={22} color={theme.primary}/>
    <View style={styles.text}><AppText variant="label">Word play is ready</AppText><AppText variant="caption" style={{ color: theme.muted }}>Find your learned words in Play</AppText></View>
    <Ionicons name="arrow-forward" size={20} color={theme.primary}/>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss Word play introduction" disabled={busy} onPress={() => void dismiss(false)} style={styles.dismiss}>
      <Ionicons name="close" size={20} color={theme.primary}/>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.control, padding: spacing.md, marginBottom: spacing.sm, minHeight: 56 },
  text: { flex: 1 },
  open: { flex: 1, flexDirection: 'row', gap: spacing.md, alignItems: 'center', minHeight: 44 },
  dismiss: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
