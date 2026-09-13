import { AppText } from '@/components/app-text';
import type { Recommendation } from '@/features/recommendations/selector';
import { useAppTheme } from '@/hooks/use-app-theme';

export function RecommendationFallbackNote({ recommendations }: { recommendations: Recommendation[] }) {
  const theme = useAppTheme();
  const generalCount = recommendations.filter(({ topic }) => topic === null).length;
  if (generalCount === 0) return null;
  return <AppText variant="caption" style={{ color: theme.muted }}>
    {generalCount === recommendations.length
      ? 'No unused topic matches remain at your selected levels. This set uses general vocabulary.'
      : `Includes ${generalCount} general vocabulary ${generalCount === 1 ? 'word' : 'words'} at your selected levels to complete the set.`}
  </AppText>;
}
