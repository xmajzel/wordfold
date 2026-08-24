import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import { PronunciationButton } from '@/components/pronunciation-button';
import type { PronunciationVoicePreference } from '@/domain/types';
import {
  neuralVoiceLabel,
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';
import {
  BUNDLED_VOICE_SAMPLE_TEXT,
  playBundledVoiceSample,
  preloadBundledVoiceSamples,
} from '@/features/pronunciation/voice-samples';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

const choices: {
  id: PronunciationVoicePreference;
  title: string;
  detail: string;
  locale: NeuralPronunciationLocale | null;
  recommended?: boolean;
}[] = [
  {
    id: 'neural-en-US',
    title: neuralVoiceLabel('en-US'),
    detail: 'Recommended. Your added catalog words download automatically, then play offline.',
    locale: 'en-US',
    recommended: true,
  },
  {
    id: 'neural-en-GB',
    title: neuralVoiceLabel('en-GB'),
    detail: 'Your added catalog words download automatically, then play offline.',
    locale: 'en-GB',
  },
  {
    id: 'device',
    title: 'Phone voice',
    detail: 'May take a few seconds to start the first time. Works offline once the exact system voice is installed.',
    locale: null,
  },
];

export function PronunciationVoicePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PronunciationVoicePreference;
  onChange(value: PronunciationVoicePreference): void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();
  const [testing, setTesting] = useState<NeuralPronunciationLocale | null>(null);

  useEffect(() => {
    void preloadBundledVoiceSamples().catch(() => undefined);
  }, []);

  const testNeural = async (locale: NeuralPronunciationLocale) => {
    setTesting(locale);
    try {
      await playBundledVoiceSample(locale);
    } catch (error) {
      Alert.alert(
        'Voice sample unavailable',
        error instanceof Error ? error.message : 'The bundled voice sample could not be played. Please try again.',
      );
    } finally {
      setTesting(null);
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
            accessibilityState={{ busy: testing === choice.locale, disabled: disabled || testing !== null }}
            disabled={disabled || testing !== null}
            onPress={() => void testNeural(choice.locale!)}
            style={({ pressed }) => [styles.testButton, {
              backgroundColor: theme.raised,
              borderColor: theme.primary,
              opacity: disabled || testing !== null ? 0.5 : pressed ? 0.72 : 1,
            }]}
          >
            <Ionicons name={testing === choice.locale ? 'hourglass-outline' : 'play-outline'} color={theme.primary} size={18}/>
            <AppText variant="label" style={{ color: theme.primary }}>
              {testing === choice.locale ? 'Preparing sample…' : 'Test voice'}
            </AppText>
          </Pressable> : <PronunciationButton
            text={BUNDLED_VOICE_SAMPLE_TEXT}
            locale="en-US"
            compact
            idleLabel="Test phone voice"
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
