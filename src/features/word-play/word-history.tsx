import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import { emptyWordPlayStats, type WordPlayStats } from './model';

export function WordPlayHistory({ stats = emptyWordPlayStats }: { stats?: WordPlayStats }) {
  const theme = useAppTheme();
  const rows = [
    ['Games played', stats.gamesPlayed],
    ['Needed another look', stats.needsPractice],
    ['Returned to learning', stats.returnedToLearning],
    ['Last played', stats.lastPlayedAt ? new Date(stats.lastPlayedAt).toLocaleDateString() : 'Not yet'],
  ] as const;
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <AppText variant="label">Word play history</AppText>
    {rows.map(([label, value]) => <View key={label} style={styles.row}><AppText style={styles.label}>{label}</AppText><AppText variant="label">{value}</AppText></View>)}
    <AppText variant="caption" style={{ color: theme.muted }}>Counted once per word in each session. Returns to learning are from Word play.</AppText>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderWidth: 1, borderRadius: radii.card, gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg }, label: { flex: 1 },
});
