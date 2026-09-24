import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import { languageLabel, pronunciationLocaleLabel } from '@/domain/languages';
import {
  openAndroidVoiceInstaller,
  resolveExactDeviceVoice,
} from '@/features/pronunciation/device-speech';
import { startPronunciation, stopPronunciation } from '@/features/pronunciation/pronunciation';
import { usePronunciationCacheScope } from '@/features/pronunciation/cache-scope';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export type PronunciationStatus = 'idle' | 'preparing' | 'speaking' | 'stopping';

interface PronunciationButtonProps {
  text: string;
  locale: string;
  compact?: boolean;
  paired?: boolean;
  idleLabel?: string;
  active?: boolean;
  disabled?: boolean;
  align?: 'center' | 'flex-start';
  onStatusChange?(status: PronunciationStatus): void;
}

export function PronunciationButton({ text, locale, compact = false, paired = false, idleLabel, active = true, disabled = false, align = 'center', onStatusChange }: PronunciationButtonProps) {
  const theme = useAppTheme();
  const cacheScope = usePronunciationCacheScope();
  const [status, setStatus] = useState<PronunciationStatus>('idle');
  const statusRef = useRef<PronunciationStatus>('idle');
  const requestId = useRef(0);
  const mounted = useRef(true);
  const changeStatus = useCallback((next: PronunciationStatus) => {
    statusRef.current = next;
    setStatus(next);
    onStatusChange?.(next);
  }, [onStatusChange]);
  const languageCode = locale.split(/[-_]/)[0]?.toLocaleLowerCase('en') ?? locale;
  const localeDescription = `${languageLabel(languageCode)} · ${pronunciationLocaleLabel(languageCode, locale)}`;
  const visibleLocaleDescription = paired && locale === 'en-US' ? 'English · US'
    : paired && locale === 'en-GB' ? 'English · UK' : localeDescription;

  if (!active && status !== 'idle') setStatus('idle');

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    mounted.current = active;
    return () => {
      mounted.current = false;
      requestId.current += 1;
      if (statusRef.current !== 'idle') void stopPronunciation();
    };
  }, [active]);

  const showPlaybackError = useCallback((error: unknown) => {
    const detail = Platform.OS === 'ios'
      ? 'Make sure silent mode is off, then try again.'
      : 'Check the device speech settings and try again.';
    Alert.alert(
      'Pronunciation did not play',
      `${error instanceof Error ? error.message : 'The device speech engine reported an error.'}\n\n${detail}`,
    );
  }, []);

  const play = useCallback(async () => {
    if (!active || disabled) return;
    if (statusRef.current === 'preparing' || statusRef.current === 'stopping') return;
    if (status === 'speaking') {
      requestId.current += 1;
      changeStatus('stopping');
      try {
        await stopPronunciation();
      } catch (error) {
        if (mounted.current) showPlaybackError(error);
      } finally {
        if (mounted.current) changeStatus('idle');
      }
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    changeStatus('preparing');
    try {
      const result = await startPronunciation(text, locale, cacheScope, {
        onStart: () => {
          if (mounted.current && requestId.current === currentRequest) changeStatus('speaking');
        },
        onDone: () => {
          if (mounted.current && requestId.current === currentRequest) changeStatus('idle');
        },
        onStopped: () => {
          if (mounted.current && requestId.current === currentRequest) changeStatus('idle');
        },
        onError: (error) => {
          if (!mounted.current || requestId.current !== currentRequest) return;
          changeStatus('idle');
          showPlaybackError(error);
        },
      });
      if (!mounted.current || requestId.current !== currentRequest) return;
      if (result.status === 'missing_voice') {
        changeStatus('idle');
        showMissingVoice(localeDescription, () => {
          void openAndroidVoiceInstaller().then(async (opened) => {
            if (!mounted.current) return;
            if (!opened) {
              Alert.alert('Voice installer unavailable', 'Open Android Settings → System → Languages → Text-to-speech output and install the requested voice.');
              return;
            }
            const installedVoice = await resolveExactDeviceVoice(locale);
            if (!mounted.current) return;
            Alert.alert(
              installedVoice ? 'Voice is ready' : 'Voice is still unavailable',
              installedVoice
                ? 'The exact voice is installed. Tap the device voice button to play it.'
                : 'The installer did not add the exact requested region. Choose that language and region in the Text-to-speech settings, then try again.',
            );
          }).catch((error) => {
            if (mounted.current) showPlaybackError(error);
          });
        });
      }
    } catch (error) {
      if (!mounted.current || requestId.current !== currentRequest) return;
      changeStatus('idle');
      showPlaybackError(error);
    }
  }, [active, disabled, changeStatus, cacheScope, locale, localeDescription, showPlaybackError, status, text]);

  const stopping = status === 'stopping';
  const preparing = status === 'preparing';
  const speaking = status === 'speaking';
  const actionLabel = speaking ? `Stop ${localeDescription} device pronunciation` : `Play ${localeDescription} device pronunciation for ${text.trim()}`;

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={preparing ? `Preparing ${localeDescription} device pronunciation` : actionLabel}
    accessibilityState={{ busy: preparing || stopping, disabled: disabled || !active || preparing || stopping }}
    disabled={disabled || !active || preparing || stopping}
    onPress={() => void play()}
    style={({ pressed }) => [styles.button, compact && styles.compactButton, paired && styles.pairedButton, {
      alignSelf: align,
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary,
      opacity: disabled || !active || preparing || stopping ? 0.65 : pressed ? 0.78 : 1,
    }]}
  >
    <View style={[styles.icon, compact && styles.compactIcon, { backgroundColor: theme.surface }]}>
      <Ionicons
        name={preparing ? 'hourglass-outline' : speaking ? 'stop-outline' : 'volume-high-outline'}
        color={theme.primary}
        size={compact ? 17 : 19}
      />
    </View>
    <View style={styles.text}>
      <AppText variant="label" style={{ color: theme.primary }}>
        {paired
          ? stopping ? 'Stopping…' : preparing ? 'Preparing…' : speaking ? 'Stop phone' : idleLabel ?? 'Phone voice'
          : stopping ? 'Stopping…' : preparing ? 'Preparing voice…' : speaking ? 'Playing device voice…' : idleLabel ?? '≈ Device voice'}
      </AppText>
      {!compact || paired ? <AppText variant="caption" style={{ color: theme.muted }}>{visibleLocaleDescription}</AppText> : null}
    </View>
  </Pressable>;
}

function showMissingVoice(localeDescription: string, openInstaller: () => void) {
  if (Platform.OS === 'android') {
    Alert.alert(
      `${localeDescription} voice is not installed`,
      'Wordfold will not substitute another language or region. Open the Android voice installer, download the requested voice, then return to Wordfold.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Open voice installer', onPress: openInstaller }],
    );
    return;
  }
  if (Platform.OS === 'ios') {
    Alert.alert(
      `${localeDescription} voice is not installed`,
      'Wordfold will not substitute another language or region. Open Settings → Accessibility → Spoken Content → Voices and download the requested voice. Also make sure silent mode is off when playing pronunciation.',
    );
    return;
  }
  Alert.alert(
    `${localeDescription} voice is unavailable`,
    'Wordfold will not substitute another language or region. Install or enable the exact requested voice in your browser or operating-system speech settings.',
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: spacing.sm,
    borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  pairedButton: { flexBasis: 140, flexGrow: 1, maxWidth: '100%' },
  compactButton: { minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  compactIcon: { width: 26, height: 26, borderRadius: 13 },
  text: { flexShrink: 1 },
});
