import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { AppSwitch } from '@/components/app-switch';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import type { ReminderSettings } from '@/domain/types';
import { topicOptions } from '@/features/recommendations/selector';
import { requestReminderPermission } from '@/features/reminders/scheduler';
import { formatMinutes, REMINDER_PRESETS } from '@/features/reminders/slots';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const theme = useAppTheme();
  const { reminderSettings, learningPreferences, updateReminderSettings } = useAppData();
  const [draft, setDraft] = useState<ReminderSettings>(() => reminderSettings ?? ({ enabled: false, countPerDay: 1, windowStartMinutes: 600, windowEndMinutes: 1200, timeZoneId: 'local' }));
  const [saving, setSaving] = useState(false);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const toggleEnabled = async (enabled: boolean) => {
    if (!enabled) { setDraft({ ...draft, enabled: false }); return; }
    const allowed = await requestReminderPermission();
    if (!allowed) {
      Alert.alert('Notifications are disabled', 'Enable Wordfold notifications in system settings to use reminders.', [{ text: 'Not now' }, { text: 'Open settings', onPress: () => void Linking.openSettings() }]);
    }
    setDraft({ ...draft, enabled: allowed });
  };

  const adjustTime = (field: 'windowStartMinutes' | 'windowEndMinutes', amount: number) => {
    const next = Math.max(0, Math.min(1435, draft[field] + amount));
    const candidate = { ...draft, [field]: next };
    if (candidate.windowStartMinutes < candidate.windowEndMinutes) setDraft(candidate);
  };

  const save = async () => {
    setSaving(true);
    try {
      const count = await updateReminderSettings({ ...draft, timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local' });
      setScheduledCount(count);
    } finally { setSaving(false); }
  };

  return (
    <Screen scroll>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={[styles.close, { backgroundColor: theme.surface }]}><Ionicons name="close" color={theme.text} size={22}/></Pressable><AppText variant="title">Settings</AppText><View style={styles.close}/></View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit learning preferences"
        onPress={() => router.push('/preferences' as never)}
        style={({ pressed }) => [styles.preferenceCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.76 : 1 }]}>
        <View style={[styles.preferenceIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="options-outline" color={theme.primary} size={24}/></View>
        <View style={styles.flex}>
          <AppText variant="heading">Learning preferences</AppText>
          <AppText variant="caption" style={{ color: theme.muted }}>{learningPreferences.levels.length > 0
            ? `${learningPreferences.levels.join(', ')} · ${topicOptions.filter((topic) => learningPreferences.topics.includes(topic.id)).map((topic) => topic.title).join(', ') || 'Choose interests'}`
            : 'Choose levels and interests for recommendations'}</AppText>
        </View>
        <Ionicons name="chevron-forward" color={theme.primary} size={20}/>
      </Pressable>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.switchRow}><View style={styles.flex}><AppText variant="heading">Word reminders</AppText><AppText style={{ color: theme.muted }}>Fresh words at preferred times.</AppText></View><AppSwitch accessibilityLabel="Enable word reminders" value={draft.enabled} onValueChange={(value) => void toggleEnabled(value)}/></View></View>
      <View><AppText variant="heading">How often?</AppText><AppText style={{ color: theme.muted }}>One to three gentle presets, or your own rhythm up to six.</AppText></View>
      <View style={styles.countGrid}>{[1, 2, 3, 4, 5, 6].map((count) => { const preset = REMINDER_PRESETS.find((item) => item.count === count); const selected = draft.countPerDay === count; return <Pressable key={count} onPress={() => setDraft({ ...draft, countPerDay: count })} style={[styles.countCard, { backgroundColor: selected ? theme.primarySoft : theme.surface, borderColor: selected ? theme.primary : theme.border }]}><AppText variant="heading" style={{ color: selected ? theme.primary : theme.text }}>{count}</AppText><AppText variant="caption" numberOfLines={1} style={{ color: theme.muted }}>{preset?.label ?? 'My rhythm'}</AppText></Pressable>; })}</View>
      <View><AppText variant="heading">Preferred window</AppText><AppText style={{ color: theme.muted }}>Multiple reminders are spaced evenly from first to last.</AppText></View>
      <TimeControl label="First word" value={draft.windowStartMinutes} onMinus={() => adjustTime('windowStartMinutes', -30)} onPlus={() => adjustTime('windowStartMinutes', 30)}/>
      <TimeControl label="Last word" value={draft.windowEndMinutes} onMinus={() => adjustTime('windowEndMinutes', -30)} onPlus={() => adjustTime('windowEndMinutes', 30)}/>
      <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}><Ionicons name="time-outline" color={theme.primary} size={20}/><AppText style={styles.flex}>Times are preferences. Android may delay a reminder to protect battery life.</AppText></View>
      <PrimaryButton label="Save reminder rhythm" loading={saving} onPress={() => void save()}/>
      {scheduledCount !== null ? <AppText variant="label" style={[styles.center, { color: theme.success }]}>{draft.enabled ? `${scheduledCount} word reminders scheduled ahead.` : 'Reminders are off.'}</AppText> : null}
      <View style={styles.divider}/>
      <AppText variant="heading">Content and privacy</AppText>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><InfoRow icon="phone-portrait-outline" title="Local by default" body="Your words and learning history remain on this device."/><InfoRow icon="book-outline" title="Open English WordNet 2025" body="Definitions under CC BY 4.0."/><InfoRow icon="list-outline" title="NGSL discovery packs" body="Spoken, Business, and Academic lists under CC BY-SA 4.0."/></View>
      <AppText variant="caption" style={{ color: theme.muted }}>Wordfold is a temporary development name. No account, cloud sync, analytics, or payment system is included.</AppText>
    </Screen>
  );
}

function TimeControl({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus(): void; onPlus(): void }) { const theme = useAppTheme(); return <View style={[styles.timeControl, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.flex}><AppText variant="label">{label}</AppText><AppText variant="title" style={{ color: theme.primary }}>{formatMinutes(value)}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel={`Earlier ${label}`} onPress={onMinus} style={[styles.adjust, { backgroundColor: theme.primarySoft }]}><Ionicons name="remove" color={theme.primary} size={22}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Later ${label}`} onPress={onPlus} style={[styles.adjust, { backgroundColor: theme.primarySoft }]}><Ionicons name="add" color={theme.primary} size={22}/></Pressable></View>; }
function InfoRow({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) { const theme = useAppTheme(); return <View style={styles.infoRow}><Ionicons name={icon} color={theme.primary} size={22}/><View style={styles.flex}><AppText variant="label">{title}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{body}</AppText></View></View>; }

const styles = StyleSheet.create({
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.lg }, switchRow: { flexDirection: 'row', alignItems: 'center' }, flex: { flex: 1 },
  preferenceCard: { minHeight: 96, borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, preferenceIcon: { width: 48, height: 48, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, countCard: { width: '31%', minHeight: 76, borderWidth: 1, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  timeControl: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, adjust: { width: 48, height: 48, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' }, notice: { borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', gap: spacing.sm }, center: { textAlign: 'center' }, divider: { height: 1, marginVertical: spacing.sm }, infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
