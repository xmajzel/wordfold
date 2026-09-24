import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import type { LearningConfirmationCount, Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { spacing } from '@/theme/tokens';

export function ConfirmationProgress({ word, confirmations, detailed = false }: {
  word: Pick<Word, 'state' | 'knownStreak' | 'nextReviewAt'>;
  confirmations: LearningConfirmationCount;
  detailed?: boolean;
}) {
  const theme = useAppTheme();
  if (confirmations === 1 || word.state === 'learned') return null;

  const completed = Math.min(Math.max(word.knownStreak ?? 0, 0), confirmations);
  // Lowering the rhythm target does not mark an active word learned.
  const remaining = Math.max(1, confirmations - completed);
  const progress = `${completed} of ${confirmations} confirmations`;
  const detail = `${remaining} more “I know this” ${remaining === 1 ? 'confirmation' : 'confirmations'} to mark as learned.`;
  const nextReview = word.nextReviewAt ? new Date(word.nextReviewAt) : null;
  const reviewLabel = nextReview && Number.isFinite(nextReview.getTime())
    ? `Next review: ${nextReview.toLocaleDateString()}` : null;

  return <View style={styles.container}>
    <View accessible accessibilityRole="progressbar" accessibilityLabel={progress}
      accessibilityValue={{ min: 0, max: confirmations, now: completed, text: `${progress}. ${detail}` }}
      style={styles.summary}>
      <View aria-hidden style={styles.segments}>
        {Array.from({ length: confirmations }, (_, index) => <View key={index}
          style={[styles.segment, { backgroundColor: index < completed ? theme.primary : theme.border }]}/>)}
      </View>
      <AppText variant="caption" style={{ color: theme.muted }}>{progress}</AppText>
    </View>
    {detailed || completed >= confirmations ? <AppText variant="caption" style={{ color: theme.muted }}>{detail}</AppText> : null}
    {detailed && reviewLabel ? <AppText variant="caption" style={{ color: theme.muted }}>{reviewLabel}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { width: 24, height: 6, borderRadius: 3 },
});
