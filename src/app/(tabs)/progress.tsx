import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing, stateColors } from '@/theme/tokens';

export default function ProgressScreen() {
  const theme = useAppTheme();
  const { stats } = useAppData();
  const stateTotal = stats ? Math.max(stats.totalWords, 1) : 1;
  return (
    <Screen scroll>
      <View style={styles.header}><AppText variant="title">Your progress</AppText><AppText style={{ color: theme.muted }}>A quiet record of words becoming familiar.</AppText></View>
      <ActivityChart activity={stats?.recentActivity ?? []} viewedToday={stats?.viewedToday ?? 0} viewedLifetime={stats?.viewedLifetime ?? 0}/>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.panelTitle}><AppText variant="heading">Memory mix</AppText><AppText variant="caption" style={{ color: theme.muted }}>{stats?.totalWords ?? 0} total {(stats?.totalWords ?? 0) === 1 ? 'word' : 'words'}</AppText></View>
        <View style={[styles.bar, { backgroundColor: theme.raised }]}>
          <BarSegment value={stats?.newWords ?? 0} total={stateTotal} color={stateColors.new}/>
          <BarSegment value={stats?.difficultWords ?? 0} total={stateTotal} color={stateColors.cannot_remember}/>
          <BarSegment value={stats?.understoodWords ?? 0} total={stateTotal} color={stateColors.understood}/>
          <BarSegment value={stats?.learnedWords ?? 0} total={stateTotal} color={stateColors.learned}/>
        </View>
        <Legend color={stateColors.new} label="New" value={stats?.newWords ?? 0}/>
        <Legend color={stateColors.cannot_remember} label="Needs practice" value={stats?.difficultWords ?? 0}/>
        <Legend color={stateColors.understood} label="Getting there" value={stats?.understoodWords ?? 0}/>
        <Legend color={stateColors.learned} label="Learned" value={stats?.learnedWords ?? 0}/>
      </View>
      <View style={[styles.panel, { backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }]}><AppText variant="heading" style={{ color: theme.primary }}>Reminders that worked</AppText><AppText variant="display" style={{ color: theme.primary }}>{stats?.notificationOpens ?? 0}</AppText><AppText style={{ color: theme.muted }}>notification opens recorded on this device</AppText></View>
      <AppText variant="caption" style={[styles.note, { color: theme.muted }]}>Wordfold avoids streak pressure. Progress comes from encounters, honest recall, and returning when a word needs another look.</AppText>
    </Screen>
  );
}

function ActivityChart({ activity, viewedToday, viewedLifetime }: {
  activity: { date: string; count: number }[];
  viewedToday: number;
  viewedLifetime: number;
}) {
  const theme = useAppTheme();
  const maximum = Math.max(1, ...activity.map((day) => day.count));
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.panelTitle}><View><AppText variant="heading">Last 7 days</AppText><AppText variant="caption" style={{ color: theme.muted }}>Cards that reached your attention</AppText></View><AppText variant="label" style={{ color: theme.primary }}>{viewedToday} today</AppText></View>
    <View style={styles.chart} accessibilityRole="summary" accessibilityLabel={`${viewedToday} cards today, ${viewedLifetime} cards all time`}>
      {activity.map((day) => {
        const date = new Date(`${day.date}T12:00:00`);
        const label = new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(date);
        const height = day.count === 0 ? 4 : Math.max(12, Math.round((day.count / maximum) * 88));
        return <View key={day.date} style={styles.chartDay} accessibilityLabel={`${label}, ${day.count} cards`}>
          <AppText variant="caption" style={{ color: theme.muted }}>{day.count || ''}</AppText>
          <View style={[styles.chartTrack, { backgroundColor: theme.raised }]}><View style={[styles.chartBar, { height, backgroundColor: theme.primary }]}/></View>
          <AppText variant="caption" style={{ color: theme.muted }}>{label}</AppText>
        </View>;
      })}
    </View>
    <View style={styles.activityFooter}><AppText variant="caption" style={{ color: theme.muted }}>All-time encounters</AppText><AppText variant="label" style={{ color: theme.text }}>{viewedLifetime}</AppText></View>
  </View>;
}
function BarSegment({ value, total, color }: { value: number; total: number; color: string }) { return value ? <View style={{ flex: value / total, backgroundColor: color }}/> : null; }
function Legend({ color, label, value }: { color: string; label: string; value: number }) { const theme = useAppTheme(); return <View style={styles.legend}><View style={[styles.dot, { backgroundColor: color }]}/><AppText style={styles.legendLabel}>{label}</AppText><AppText variant="label" style={{ color: theme.muted }}>{value}</AppText></View>; }

const styles = StyleSheet.create({
  header: { minHeight: 84, justifyContent: 'center', gap: spacing.xs },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md }, panelTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chart: { height: 136, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }, chartDay: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs }, chartTrack: { width: '100%', height: 88, borderRadius: radii.pill, justifyContent: 'flex-end', overflow: 'hidden' }, chartBar: { width: '100%', borderRadius: radii.pill }, activityFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bar: { height: 14, flexDirection: 'row', borderRadius: 7, overflow: 'hidden' }, legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, dot: { width: 10, height: 10, borderRadius: 5 }, legendLabel: { flex: 1 }, note: { textAlign: 'center', paddingHorizontal: spacing.xl },
});
