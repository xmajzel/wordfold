import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { NeuralPronunciationButton } from '@/components/neural-pronunciation-button';
import { PrivatePronunciationButton } from '@/components/private-pronunciation-button';
import { PronunciationButton } from '@/components/pronunciation-button';
import {
  getNeuralPronunciationEligibility,
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';
import { usePronunciationCacheScope } from '@/features/pronunciation/cache-scope';
import { useOfflinePronunciationDownloads } from '@/features/pronunciation/offline-downloads-provider';
import {
  getPrivateNeuralPronunciationEligibility,
  type PrivateNeuralPronunciationLocale,
} from '@/features/pronunciation/private-cloud';
import { usePrivatePronunciationConsent } from '@/features/pronunciation/private-consent-provider';
import { spacing } from '@/theme/tokens';

type PronunciationControlsProps = {
  text: string;
  sourceLanguageCode: string;
  locale: string;
  catalogSenseId: string | null;
  compact?: boolean;
};

export function PronunciationControls(props: PronunciationControlsProps) {
  const publicEligibility = Platform.OS === 'web' ? null : getNeuralPronunciationEligibility(props);
  const privateEligibility = Platform.OS === 'web' || publicEligibility
    ? null
    : getPrivateNeuralPronunciationEligibility(props);
  return <View style={styles.controls}>
    <PronunciationButton text={props.text} locale={props.locale} compact={props.compact}/>
    {publicEligibility ? <NeuralControl
      catalogSenseId={publicEligibility.catalogSenseId}
      locale={publicEligibility.locale}
      compact={props.compact}
    /> : null}
    {privateEligibility ? <PrivateControl
      text={privateEligibility.text}
      locale={privateEligibility.locale}
      compact={props.compact}
    /> : null}
  </View>;
}

function NeuralControl({ catalogSenseId, locale, compact }: {
  catalogSenseId: string;
  locale: NeuralPronunciationLocale;
  compact?: boolean;
}) {
  const cacheScope = usePronunciationCacheScope();
  const offlineDownloads = useOfflinePronunciationDownloads();
  const offlineOnly = cacheScope.type !== 'account';
  if (offlineOnly && !offlineDownloads.hasAsset(catalogSenseId, locale)) return null;
  return <NeuralPronunciationButton
    catalogSenseId={catalogSenseId}
    locale={locale}
    compact={compact}
    offlineOnly={offlineOnly}
  />;
}

function PrivateControl({ text, locale, compact }: {
  text: string;
  locale: PrivateNeuralPronunciationLocale;
  compact?: boolean;
}) {
  const cacheScope = usePronunciationCacheScope();
  const consent = usePrivatePronunciationConsent();
  if (cacheScope.type !== 'account' || consent.status === 'loading') return null;
  return <PrivatePronunciationButton
    text={text}
    locale={locale}
    scope={cacheScope}
    compact={compact}
    consentEnabled={consent.status === 'enabled'}
    deletionPending={consent.status === 'deletion_pending'}
    onReviewConsent={() => router.push('/private-pronunciation' as never)}
  />;
}

const styles = StyleSheet.create({
  controls: { alignItems: 'center', gap: spacing.sm },
});
