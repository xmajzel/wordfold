import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import { languageLabel, pronunciationLocaleLabel } from '@/domain/languages';
import type { PronunciationCacheScope } from '@/features/pronunciation/cache';
import {
  PrivateNeuralPronunciationError,
  type PrivateNeuralPronunciationLocale,
} from '@/features/pronunciation/private-cloud';
import {
  startPrivateNeuralPronunciation,
  stopPronunciation,
} from '@/features/pronunciation/pronunciation';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

type PrivateNeuralStatus = 'idle' | 'preparing' | 'pending' | 'speaking';

type PrivatePronunciationButtonProps = {
  text: string;
  locale: PrivateNeuralPronunciationLocale;
  scope: Extract<PronunciationCacheScope, { type: 'account' }>;
  consentEnabled: boolean;
  deletionPending?: boolean;
  compact?: boolean;
  onReviewConsent(): void;
};

export function PrivatePronunciationButton({
  text,
  locale,
  scope,
  consentEnabled,
  deletionPending = false,
  compact = false,
  onReviewConsent,
}: PrivatePronunciationButtonProps) {
  const theme = useAppTheme();
  const [status, setStatus] = useState<PrivateNeuralStatus>('idle');
  const statusRef = useRef<PrivateNeuralStatus>('idle');
  const requestId = useRef(0);
  const mounted = useRef(true);
  const languageCode = locale === 'sk-SK' ? 'sk' : 'en';
  const localeDescription = `${languageLabel(languageCode)} · `
    + pronunciationLocaleLabel(languageCode, locale);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
      if (statusRef.current === 'preparing' || statusRef.current === 'speaking') {
        void stopPronunciation();
      }
    };
  }, []);

  const showPlaybackError = useCallback((error: unknown) => {
    const message = error instanceof PrivateNeuralPronunciationError
      ? error.message
      : 'Cloud neural pronunciation could not be played. Please try again.';
    Alert.alert(
      'Cloud neural voice did not play',
      `${message}\n\nThe device voice option remains available.`,
    );
  }, []);

  const play = useCallback(async () => {
    if (!consentEnabled) {
      onReviewConsent();
      return;
    }
    if (status === 'preparing') return;
    if (status === 'speaking') {
      requestId.current += 1;
      setStatus('idle');
      await stopPronunciation();
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setStatus('preparing');
    try {
      const result = await startPrivateNeuralPronunciation(text, locale, scope, {
        onStart: () => {
          if (mounted.current && requestId.current === currentRequest) setStatus('speaking');
        },
        onDone: () => {
          if (mounted.current && requestId.current === currentRequest) setStatus('idle');
        },
        onStopped: () => {
          if (mounted.current && requestId.current === currentRequest) setStatus('idle');
        },
        onError: (error) => {
          if (!mounted.current || requestId.current !== currentRequest) return;
          setStatus('idle');
          showPlaybackError(error);
        },
      });
      if (!mounted.current || requestId.current !== currentRequest) return;
      if (result.status === 'pending') setStatus('pending');
      else if (result.status === 'stopped') setStatus('idle');
    } catch (error) {
      if (!mounted.current || requestId.current !== currentRequest) return;
      setStatus('idle');
      showPlaybackError(error);
    }
  }, [consentEnabled, locale, onReviewConsent, scope, showPlaybackError, status, text]);

  const preparing = status === 'preparing';
  const pending = status === 'pending';
  const speaking = status === 'speaking';
  const actionLabel = !consentEnabled
    ? deletionPending
      ? `Review pending cloud pronunciation deletion for ${localeDescription}`
      : `Review cloud neural pronunciation for ${localeDescription}`
    : speaking
      ? `Stop ${localeDescription} private neural pronunciation`
      : `${pending ? 'Check' : 'Play'} ${localeDescription} private neural pronunciation`;

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={preparing ? `Preparing ${localeDescription} private neural pronunciation` : actionLabel}
    accessibilityState={{ busy: preparing, disabled: preparing }}
    disabled={preparing}
    onPress={() => void play()}
    style={({ pressed }) => [styles.button, compact && styles.compactButton, {
      backgroundColor: theme.raised,
      borderColor: theme.accent,
      opacity: preparing ? 0.65 : pressed ? 0.78 : 1,
    }]}
  >
    <View style={[styles.icon, compact && styles.compactIcon, { backgroundColor: theme.surface }]}>
      <Ionicons
        name={!consentEnabled
          ? deletionPending ? 'alert-circle-outline' : 'lock-closed-outline'
          : preparing ? 'hourglass-outline' : speaking ? 'stop-outline' : 'sparkles-outline'}
        color={theme.accent}
        size={compact ? 17 : 19}
      />
    </View>
    <View style={styles.text}>
      <AppText variant="label" style={{ color: theme.accent }}>
        {!consentEnabled
          ? deletionPending ? 'Cloud deletion needs attention' : 'Enable cloud neural voice'
          : preparing || pending
            ? 'Preparing cloud neural voice…'
            : speaking ? 'Playing cloud neural voice…' : 'Private neural voice'}
      </AppText>
      {!compact ? <AppText variant="caption" style={{ color: theme.muted }}>
        {!consentEnabled
          ? deletionPending ? 'Tap to retry deletion' : 'Off until you review and opt in'
          : pending ? 'Tap to check again' : localeDescription}
      </AppText> : null}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: spacing.sm,
    borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  compactButton: { minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  compactIcon: { width: 26, height: 26, borderRadius: 13 },
  text: { flexShrink: 1 },
});
