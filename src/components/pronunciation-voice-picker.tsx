import { neuralVoices, type NeuralLocale } from '@/domain/pronunciation-voices';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import { PronunciationButton, type PronunciationStatus } from '@/components/pronunciation-button';
import { languageLabel, pronunciationLocaleLabel } from '@/domain/languages';
import type { PronunciationVoicePreference } from '@/domain/types';
import {
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';
import {
  BUNDLED_VOICE_SAMPLE_TEXT,
  playBundledVoiceSample,
  preloadBundledVoiceSamples,
} from '@/features/pronunciation/voice-samples';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

type VoiceChoice = { id: PronunciationVoicePreference; title: string; detail: string; locale: NeuralPronunciationLocale | null; recommended?: boolean };

const deviceSampleText: Record<string, string> = {
  en: BUNDLED_VOICE_SAMPLE_TEXT,
  es: 'Hola. Aprender un idioma nuevo abre la puerta a nuevas ideas, lugares y conversaciones.',
};

export function PronunciationVoicePicker({
  value,
  onChange,
  disabled = false,
  sourceLanguageCode = 'en',
  pronunciationLocale = 'en-US',
}: {
  value: PronunciationVoicePreference;
  onChange(value: PronunciationVoicePreference): void;
  disabled?: boolean;
  sourceLanguageCode?: string;
  pronunciationLocale?: string;
}) {
  const theme = useAppTheme();
  const [testing, setTesting] = useState<NeuralPronunciationLocale | null>(null);
  const [sampleStatus, setSampleStatus] = useState<'preparing' | 'playing'>('preparing');
  const [phoneStatus, setPhoneStatus] = useState<PronunciationStatus>('idle');
  const sampleRequest = useRef<AbortController | null>(null);
  const phoneBusy = useRef(false);
  const onPhoneStatusChange = useCallback((status: PronunciationStatus) => {
    phoneBusy.current = status !== 'idle';
    setPhoneStatus(status);
  }, []);
  const samplesBusy = testing !== null || phoneStatus !== 'idle';
  useEffect(() => () => { sampleRequest.current?.abort(); }, [sourceLanguageCode]);
  const pronunciationLabel = `${languageLabel(sourceLanguageCode)} · ${pronunciationLocaleLabel(sourceLanguageCode, pronunciationLocale)}`;
  const choices: VoiceChoice[] = [
    ...Object.entries(neuralVoices).filter(([locale]) => locale.split('-')[0] === sourceLanguageCode).map(([locale, voice]) => ({
      id: `neural-${locale}` as PronunciationVoicePreference, title: voice.label,
      detail: sourceLanguageCode === 'en' ? 'Your added catalog words download automatically, then play offline.' : 'Your added catalog words download when audio is available, then play offline.',
      recommended: locale === 'en-US',
      locale: locale as NeuralLocale,
    })),
    {
      id: 'device' as const,
      title: `Phone voice · ${pronunciationLabel}`,
      detail: `Uses only the exact installed ${pronunciationLabel} voice. Voice quality and offline availability depend on the device.`,
      locale: null,
    },
  ];

  useEffect(() => {
    if (sourceLanguageCode === 'en') {
      void preloadBundledVoiceSamples().catch(() => undefined);
    }
  }, [sourceLanguageCode]);

  const testNeural = async (locale: NeuralPronunciationLocale) => {
    if (disabled || sampleRequest.current || phoneBusy.current) return;
    const request = new AbortController();
    sampleRequest.current = request;
    setSampleStatus('preparing');
    setTesting(locale);
    try {
      await playBundledVoiceSample(locale, {
        onStart: () => { if (!request.signal.aborted) setSampleStatus('playing'); },
        onError: (error) => { if (!request.signal.aborted) Alert.alert('Voice sample unavailable', error.message); },
      }, request.signal);
    } catch (error) {
      if (request.signal.aborted) return;
      Alert.alert(
        'Voice sample unavailable',
        error instanceof Error ? error.message : 'The bundled voice sample could not be played. Please try again.',
      );
    } finally {
      if (sampleRequest.current === request) sampleRequest.current = null;
      if (!request.signal.aborted) setTesting(null);
    }
  };

  return <View style={styles.list}>
    {choices.map((choice) => {
      const selected = choice.id === value;
      return <View
        key={choice.id}
        style={[styles.card, {
          backgroundColor: selected ? theme.primarySoft : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
        }]}
      >
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={`Choose ${choice.title}`}
          accessibilityState={{ checked: selected, disabled }}
          disabled={disabled}
          onPress={() => onChange(choice.id)}
          style={({ pressed }) => [styles.choice, { opacity: disabled ? 0.5 : pressed ? 0.72 : 1 }]}
        >
          <View style={[styles.icon, { backgroundColor: theme.raised }]}>
            <Ionicons
              name={choice.locale ? 'sparkles-outline' : 'phone-portrait-outline'}
              color={theme.primary}
              size={22}
            />
          </View>
          <View style={styles.flex}>
            <View style={styles.titleRow}>
              <AppText variant="label">{choice.title}</AppText>
              {choice.recommended ? <AppText variant="caption" style={{ color: theme.primary }}>
                Recommended
              </AppText> : null}
            </View>
            <AppText variant="caption" style={{ color: theme.muted }}>{choice.detail}</AppText>
          </View>
          <Ionicons
            name={selected ? 'radio-button-on' : 'radio-button-off'}
            color={selected ? theme.primary : theme.muted}
            size={22}
          />
        </Pressable>
        <View style={styles.testRow}>
          {choice.locale ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Test ${choice.title}`}
            accessibilityState={{ busy: testing === choice.locale, disabled: disabled || samplesBusy }}
            disabled={disabled || samplesBusy}
            onPress={() => void testNeural(choice.locale!)}
            style={({ pressed }) => [styles.testButton, {
              backgroundColor: theme.raised,
              borderColor: theme.primary,
              opacity: disabled || samplesBusy ? 0.5 : pressed ? 0.72 : 1,
            }]}
          >
            <Ionicons name={testing === choice.locale ? sampleStatus === 'playing' ? 'volume-high-outline' : 'hourglass-outline' : 'play-outline'} color={theme.primary} size={18}/>
            <AppText variant="label" style={{ color: theme.primary }}>
              {testing === choice.locale ? sampleStatus === 'playing' ? 'Playing…' : 'Preparing sample…' : 'Test voice'}
            </AppText>
          </Pressable> : <PronunciationButton
            text={deviceSampleText[sourceLanguageCode] ?? `Test ${languageLabel(sourceLanguageCode)} pronunciation.`}
            locale={pronunciationLocale}
            compact
            align="flex-start"
            disabled={disabled || testing !== null}
            onStatusChange={onPhoneStatusChange}
            idleLabel={`Test ${pronunciationLabel} phone voice`}
          />}
        </View>
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: { borderWidth: 1, borderRadius: radii.card, overflow: 'hidden' },
  choice: { minHeight: 104, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 42, height: 42, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  testRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, alignItems: 'flex-start' },
  testButton: {
    minHeight: 44, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
});
