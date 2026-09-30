import { useCallback, useEffect } from 'react';
import { AppState, StyleSheet, useColorScheme, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import { ActivityCalendar, MomentumCard, WordGarden } from '@/features/progress/garden-view';
import { localPracticeDate } from '@/features/progress/model';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { languageLabel } from '@/domain/languages';
import { darkStateColors, radii, spacing, stateColors } from '@/theme/tokens';

export default function ProgressScreen() {
  const theme = useAppTheme();
  const colors = useColorScheme() === 'dark' ? darkStateColors : stateColors;
  const { stats, activeCourse, garden, plantGardenTree, refresh } = useAppData();
  const learnedLanguage = languageLabel(activeCourse.sourceLanguageCode);
  const total = Math.max(stats?.totalWords ?? 0, 1);
  useFocusEffect(useCallback(() => {
    void refresh().catch((error) => console.warn('Could not refresh progress.', error));
  }, [refresh]));
  useEffect(() => {
    let date = localPracticeDate();
    const refreshDate = () => {
      const next = localPracticeDate();
      if (next === date) return;
      date = next;
      void refresh().catch((error) => console.warn('Could not refresh progress.', error));
    };
    const timer = setInterval(refreshDate, 60_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refreshDate(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [refresh]);
  return <Screen scroll>
    <View style={styles.header}><AppText variant="title">Look what you’re growing.</AppText><AppText style={{ color: theme.muted }}>A little each day becomes something lasting.</AppText></View>
    {garden ? <><MomentumCard progress={garden}/><WordGarden progress={garden} plantTree={plantGardenTree}/></> : <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><AppText style={{ color: theme.muted }}>Gathering your garden…</AppText></View>}
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.familiarity}><AppText variant="display" style={{ color: theme.primary }}>{(stats?.understoodWords ?? 0) + (stats?.learnedWords ?? 0)}</AppText><View style={styles.flex}><AppText variant="heading">Words growing familiar</AppText><AppText variant="caption" style={{ color: theme.muted }}>{learnedLanguage} · currently familiar or learned</AppText></View></View>
      <AppText variant="caption" style={{ color: theme.muted }}>Memory changes. Every honest answer helps you find what needs another look.</AppText>
      <View style={[styles.bar, { backgroundColor: theme.raised }]} accessibilityRole="summary" accessibilityLabel={`Memory mix: ${stats?.newWords ?? 0} new, ${stats?.difficultWords ?? 0} need practice, ${stats?.understoodWords ?? 0} getting familiar, ${stats?.learnedWords ?? 0} learned`}>
        <BarSegment value={stats?.newWords ?? 0} total={total} color={colors.new}/><BarSegment value={stats?.difficultWords ?? 0} total={total} color={colors.cannot_remember}/><BarSegment value={stats?.understoodWords ?? 0} total={total} color={colors.understood}/><BarSegment value={stats?.learnedWords ?? 0} total={total} color={colors.learned}/>
      </View>
      <Legend color={colors.new} label="New" value={stats?.newWords ?? 0}/><Legend color={colors.cannot_remember} label="Needs practice" value={stats?.difficultWords ?? 0}/><Legend color={colors.understood} label="Getting familiar" value={stats?.understoodWords ?? 0}/><Legend color={colors.learned} label="Learned · review stopped" value={stats?.learnedWords ?? 0}/>
    </View>
    {garden && <ActivityCalendar progress={garden}/>}
    <AppText variant="caption" style={[styles.note, { color: theme.muted }]}>The flame celebrates your rhythm. Your garden keeps your growth, even when you take a break.</AppText>
  </Screen>;
}
function BarSegment({ value, total, color }: { value: number; total: number; color: string }) { return value ? <View style={{ flex: value / total, backgroundColor: color }}/> : null; }
function Legend({ color, label, value }: { color: string; label: string; value: number }) { const theme = useAppTheme(); return <View style={styles.legend}><View style={[styles.dot, { backgroundColor: color }]}/><AppText style={styles.flex}>{label}</AppText><AppText variant="label" style={{ color: theme.muted }}>{value}</AppText></View>; }
const styles = StyleSheet.create({
  header: { paddingVertical: spacing.sm, gap: spacing.xs }, flex: { flex: 1 }, panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  familiarity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, bar: { height: 12, flexDirection: 'row', borderRadius: 6, overflow: 'hidden' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, dot: { width: 8, height: 8, borderRadius: 4 }, note: { textAlign: 'center', paddingHorizontal: spacing.md },
});
