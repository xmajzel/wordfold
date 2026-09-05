import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
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
import { usePrivatePronunciationConsent } from '@/features/pronunciation/private-consent';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import { useAppData } from '@/providers/app-data-provider';

type PronunciationControlsProps = {
  text: string;
  sourceLanguageCode: string;
  locale: string;
  catalogSenseId: string | null;
  compact?: boolean;
  active?: boolean;
};

export function PronunciationControls(props: PronunciationControlsProps) {
  const active = props.active ?? true;
  const { pronunciationVoicePreference } = useAppData();
  const cacheScope = usePronunciationCacheScope();
  const offlineDownloads = useOfflinePronunciationDownloads();
  const [failedNaturalKey, setFailedNaturalKey] = useState<string | null>(null);
  const naturalVoiceSelected = pronunciationVoicePreference !== 'device';
  const preferredLocale = props.sourceLanguageCode === 'en'
    ? pronunciationVoicePreference === 'neural-en-US' ? 'en-US'
      : pronunciationVoicePreference === 'neural-en-GB' ? 'en-GB' : props.locale
    : props.locale;
  const effectiveProps = { ...props, locale: preferredLocale };
  const publicEligibility = Platform.OS === 'web' ? null : getNeuralPronunciationEligibility(effectiveProps);
  const naturalVoiceAvailable = naturalVoiceSelected && publicEligibility !== null
    && (cacheScope.type === 'account'
      || offlineDownloads.hasAsset(publicEligibility.catalogSenseId, publicEligibility.locale));
  const privateEligibility = Platform.OS === 'web' || publicEligibility
    ? null
    : getPrivateNeuralPronunciationEligibility(effectiveProps);
  const naturalKey = `${pronunciationVoicePreference}:${publicEligibility?.catalogSenseId ?? 'none'}:${preferredLocale}`;
  const showDeviceFallback = failedNaturalKey === naturalKey;

  // Keep the same layout on pre-rendered cards; only the current card can play audio.
  return <View style={styles.controls} pointerEvents={active ? 'auto' : 'none'}
    aria-hidden={!active} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
    {naturalVoiceAvailable && publicEligibility ? <NeuralControl
      catalogSenseId={publicEligibility.catalogSenseId}
      locale={publicEligibility.locale}
      compact={props.compact}
      active={active}
      offlineOnly={cacheScope.type !== 'account'}
      availableOffline={offlineDownloads.hasAsset(publicEligibility.catalogSenseId, publicEligibility.locale)}
      onUnavailable={() => setFailedNaturalKey(naturalKey)}
    /> : null}
    {!naturalVoiceAvailable || showDeviceFallback ? <PronunciationButton
      text={props.text}
      active={active}
      locale={props.locale}
      compact={showDeviceFallback || props.compact}
      idleLabel={showDeviceFallback ? 'Use phone voice instead' : 'Phone voice'}
    /> : null}
    {privateEligibility ? <PrivateControl
      text={privateEligibility.text}
      active={active}
      locale={privateEligibility.locale}
      compact={props.compact}
    /> : null}
  </View>;
}

function NeuralControl({
  catalogSenseId,
  locale,
  compact,
  active,
  offlineOnly,
  availableOffline,
  onUnavailable,
}: {
  catalogSenseId: string;
  locale: NeuralPronunciationLocale;
  compact?: boolean;
  active: boolean;
  offlineOnly: boolean;
  availableOffline: boolean;
  onUnavailable(): void;
}) {
  return <NeuralPronunciationButton
    catalogSenseId={catalogSenseId}
    locale={locale}
    compact={compact}
    active={active}
    offlineOnly={offlineOnly}
    availableOffline={availableOffline}
    onUnavailable={onUnavailable}
  />;
}

function PrivateControl({ text, locale, compact, active }: {
  text: string;
  locale: PrivateNeuralPronunciationLocale;
  compact?: boolean;
  active: boolean;
}) {
  const cacheScope = usePronunciationCacheScope();
  const consent = usePrivatePronunciationConsent();
  if (cacheScope.type !== 'account') return null;
  if (consent.userId !== cacheScope.userId || consent.status === 'loading') {
    return <PrivateControlPlaceholder compact={compact}/>;
  }
  return <PrivatePronunciationButton
    text={text}
    locale={locale}
    scope={cacheScope}
    compact={compact}
    active={active}
    consentEnabled={consent.status === 'enabled'}
    deletionPending={consent.status === 'deletion_pending'}
    onReviewConsent={() => router.push('/private-pronunciation' as never)}
  />;
}

function PrivateControlPlaceholder({ compact = false }: { compact?: boolean }) {
  const theme = useAppTheme();
  return <View
    testID="private-pronunciation-loading"
    accessibilityRole="progressbar"
    accessibilityLabel="Checking cloud pronunciation"
    style={[styles.privatePlaceholder, compact && styles.compactPrivatePlaceholder, {
      backgroundColor: theme.raised,
      borderColor: theme.accent,
    }]}
  >
    <View style={[styles.placeholderIcon, compact && styles.compactPlaceholderIcon, { backgroundColor: theme.surface }]}><ActivityIndicator color={theme.accent} size="small"/></View>
    <View style={styles.placeholderText}><AppText variant="label" style={{ color: theme.accent }}>Checking cloud voice…</AppText>{!compact ? <AppText variant="caption" style={{ color: theme.muted }}>Pronunciation controls are loading</AppText> : null}</View>
  </View>;
}

const styles = StyleSheet.create({
  controls: { alignItems: 'center', gap: spacing.sm },
  privatePlaceholder: { minHeight: 52, flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  compactPrivatePlaceholder: { minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  placeholderIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  compactPlaceholderIcon: { width: 26, height: 26, borderRadius: 13 },
  placeholderText: { flexShrink: 1 },
});
