import { Platform, StyleSheet, View } from 'react-native';

import { NeuralPronunciationButton } from '@/components/neural-pronunciation-button';
import { PronunciationButton } from '@/components/pronunciation-button';
import {
  getNeuralPronunciationEligibility,
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';
import { usePronunciationCacheScope } from '@/features/pronunciation/cache-scope';
import { spacing } from '@/theme/tokens';

type PronunciationControlsProps = {
  text: string;
  sourceLanguageCode: string;
  locale: string;
  catalogSenseId: string | null;
  compact?: boolean;
};

export function PronunciationControls(props: PronunciationControlsProps) {
  const eligibility = Platform.OS === 'web' ? null : getNeuralPronunciationEligibility(props);
  return <View style={styles.controls}>
    <PronunciationButton text={props.text} locale={props.locale} compact={props.compact}/>
    {eligibility ? <SignedInNeuralControl
      catalogSenseId={eligibility.catalogSenseId}
      locale={eligibility.locale}
      compact={props.compact}
    /> : null}
  </View>;
}

function SignedInNeuralControl({ catalogSenseId, locale, compact }: {
  catalogSenseId: string;
  locale: NeuralPronunciationLocale;
  compact?: boolean;
}) {
  const cacheScope = usePronunciationCacheScope();
  if (cacheScope.type !== 'account') return null;
  return <NeuralPronunciationButton
    catalogSenseId={catalogSenseId}
    locale={locale}
    compact={compact}
  />;
}

const styles = StyleSheet.create({
  controls: { alignItems: 'center', gap: spacing.sm },
});
