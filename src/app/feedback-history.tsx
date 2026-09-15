import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { feedbackQueue } from '@/features/feedback/service';
import type { FeedbackHistoryEntry } from '@/features/feedback/queue';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import { feedbackCategories } from '../../supabase/functions/_shared/feedback';

export default function FeedbackHistoryScreen() {
  const theme = useAppTheme();
  const [rows, setRows] = useState<FeedbackHistoryEntry[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void feedbackQueue.history().then((history) => {
        if (active) { setRows(history); setError(''); }
      }).catch(() => { if (active) setError('Could not load your feedback. Please try again.'); });
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const retry = async () => {
    setBusy(true); setError('');
    try { await feedbackQueue.flush(); setRows(await feedbackQueue.history()); }
    catch { setError('Could not send saved feedback. Please try again.'); }
    finally { setBusy(false); }
  };
  const remove = (row: FeedbackHistoryEntry) => {
    Alert.alert('Remove from this device?', row.sentAt
      ? 'This removes your local history entry. The submitted report remains with Wordfold.'
      : 'This removes the local report and stops retries. If it already reached the server, that copy remains with Wordfold.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
        void feedbackQueue.remove(row.report.id).then(() => feedbackQueue.history()).then(setRows)
          .catch(() => setError('Could not remove this feedback. Please try again.'));
      } },
    ]);
  };

  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to feedback" onPress={() => router.back()} style={styles.button}><AppText style={{ color: theme.primary }}>Back</AppText></Pressable>
    </View>
    <FlatList data={rows ?? []} keyExtractor={(row) => row.report.id} contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.intro}>
        <AppText variant="title">My feedback</AppText>
        <AppText style={{ color: theme.muted }}>Feedback submitted on this device. Sent means Wordfold received your report; it does not mean it has been reviewed.</AppText>
        <AppText variant="caption" style={{ color: theme.muted }}>Reports sent before history was added aren’t available here. History doesn’t sync between devices and may be lost when the app is uninstalled.</AppText>
        {error ? <AppText accessibilityRole="alert" style={{ color: theme.danger }}>{error}</AppText> : null}
        {rows?.some((row) => !row.sentAt && !row.error) ? <PrimaryButton label="Try sending saved feedback" variant="secondary" loading={busy} onPress={() => void retry()}/> : null}
      </View>}
      ListEmptyComponent={!error ? <AppText>{rows === null ? 'Loading feedback…' : 'No feedback yet. Reports you submit will appear here.'}</AppText> : null}
      renderItem={({ item: row }) => <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <AppText variant="heading">{feedbackCategories[row.report.category]}</AppText>
        <AppText variant="label" style={{ color: row.sentAt ? theme.success : row.error ? theme.danger : theme.primary }}>
          {row.sentAt ? 'Sent' : row.error ? 'Needs attention' : 'Waiting to send'}
        </AppText>
        <AppText variant="caption" style={{ color: theme.muted }}>{row.submittedAt ? `Submitted ${new Date(row.submittedAt).toLocaleString()}` : 'Submission date unavailable'}</AppText>
        {row.report.context.word ? <AppText variant="label">{row.report.context.word.term}</AppText> : null}
        {row.report.reason ? <AppText>{row.report.reason}</AppText> : null}
        {row.report.message ? <AppText selectable>{row.report.message}</AppText> : null}
        {row.report.requestedItem ? <AppText>Requested: {row.report.requestedItem}{row.report.languageRole === 'learn' ? ' · to learn' : row.report.languageRole === 'hints' ? ' · for hints' : ''}</AppText> : null}
        {row.report.correction ? <AppText>Suggested correction: {row.report.correction}</AppText> : null}
        {row.error ? <AppText style={{ color: theme.danger }}>{row.error}</AppText> : null}
        <AppText selectable variant="caption" style={{ color: theme.muted }}>Reference: {row.report.id}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove feedback from this device" onPress={() => remove(row)} style={styles.button}><AppText variant="caption" style={{ color: theme.danger }}>Remove from this device</AppText></Pressable>
      </View>}/>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.sm }, button: { minHeight: 44, justifyContent: 'center' },
  list: { gap: spacing.lg, paddingBottom: spacing.xxxl }, intro: { gap: spacing.md },
  card: { borderWidth: 1, borderRadius: radii.control, padding: spacing.md, gap: spacing.sm },
});
