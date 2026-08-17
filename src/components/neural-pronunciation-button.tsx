import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import { languageLabel, pronunciationLocaleLabel } from '@/domain/languages';
import {
  NeuralPronunciationError,
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';
import {
  startNeuralPronunciation,
  stopPronunciation,
} from '@/features/pronunciation/pronunciation';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

type NeuralStatus = 'idle' | 'preparing' | 'pending' | 'speaking';

type NeuralPronunciationButtonProps = {
  catalogSenseId: string;
  locale: NeuralPronunciationLocale;
  compact?: boolean;
  offlineOnly?: boolean;
};

export function NeuralPronunciationButton({
  catalogSenseId,
  locale,
  compact = false,
  offlineOnly = false,
}: NeuralPronunciationButtonProps) {
  const theme = useAppTheme();
  const [status, setStatus] = useState<NeuralStatus>('idle');
  const statusRef = useRef<NeuralStatus>('idle');
  const requestId = useRef(0);
  const mounted = useRef(true);
  const localeDescription = `${languageLabel('en')} · ${pronunciationLocaleLabel('en', locale)}`;

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
    const message = offlineOnly
      ? 'This downloaded pronunciation is unavailable. Open Settings and resume or download the pack again.'
      : error instanceof NeuralPronunciationError
      ? error.message
      : 'Neural voice preview could not be played. Please try again.';
    Alert.alert(
      'Neural voice did not play',
      `${message}\n\nThe device voice option remains available.`,
    );
  }, [offlineOnly]);

  const play = useCallback(async () => {
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
      const result = await startNeuralPronunciation(catalogSenseId, locale, {
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
      }, { cloudAllowed: !offlineOnly });
      if (!mounted.current || requestId.current !== currentRequest) return;
      if (result.status === 'pending') setStatus('pending');
      else if (result.status === 'stopped') setStatus('idle');
    } catch (error) {
      if (!mounted.current || requestId.current !== currentRequest) return;
      setStatus('idle');
      showPlaybackError(error);
    }
  }, [catalogSenseId, locale, offlineOnly, showPlaybackError, status]);

  const preparing = status === 'preparing';
  const pending = status === 'pending';
  const speaking = status === 'speaking';
  const actionLabel = speaking
    ? `Stop ${localeDescription} neural pronunciation`
    : `${pending ? 'Check' : 'Play'} ${localeDescription} neural pronunciation preview`;

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={preparing ? `Preparing ${localeDescription} neural pronunciation` : actionLabel}
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
        name={preparing ? 'hourglass-outline' : speaking ? 'stop-outline' : 'sparkles-outline'}
        color={theme.accent}
        size={compact ? 17 : 19}
      />
    </View>
    <View style={styles.text}>
      <AppText variant="label" style={{ color: theme.accent }}>
        {preparing || pending
          ? 'Preparing neural voice…'
          : speaking ? 'Playing neural voice…' : offlineOnly ? 'Downloaded neural voice' : 'Neural voice preview'}
      </AppText>
      {!compact ? <AppText variant="caption" style={{ color: theme.muted }}>
        {pending ? 'Tap to check again' : localeDescription}
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
