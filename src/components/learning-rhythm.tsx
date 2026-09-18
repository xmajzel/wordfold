import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import type { LearningConfirmationCount } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

const illustrations = {
  1: require('../../assets/images/learning-rhythm/confirmations-1.png'),
  2: require('../../assets/images/learning-rhythm/confirmations-2.png'),
  3: require('../../assets/images/learning-rhythm/confirmations-3.png'),
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const counts = [1, 2, 3] as const;

function RhythmArtwork({ count, position }: { count: LearningConfirmationCount; position: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.abs(count - position.value)),
    transform: [{ translateX: (count - position.value) * 72 }],
  }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, animatedStyle]}>
    <Image source={illustrations[count]} resizeMode="contain" style={styles.image}
      accessible={false} importantForAccessibility="no"/>
  </Animated.View>;
}

function RhythmOption({ count, selected, disabled, onChange }: {
  count: LearningConfirmationCount; selected: boolean; disabled: boolean;
  onChange(value: LearningConfirmationCount): void;
}) {
  const theme = useAppTheme();
  const scale = useSharedValue(1);
  const highlight = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    highlight.set(withTiming(selected ? 1 : 0, { duration: 160, reduceMotion: ReduceMotion.System }));
    return () => cancelAnimation(highlight);
  }, [selected, highlight]);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.value }));
  const press = (value: number) => scale.set(withSpring(value, {
    damping: 16, stiffness: 300, reduceMotion: ReduceMotion.System,
  }));
  return <AnimatedPressable role="radio" accessibilityRole="radio" aria-checked={selected}
    accessibilityLabel={`${count} ${count === 1 ? 'confirmation' : 'confirmations'}${count === 3 ? ', recommended' : ''}`}
    accessibilityState={{ checked: selected, disabled }} disabled={disabled}
    onPressIn={() => press(0.95)} onPressOut={() => press(1)} onPress={() => { if (!selected) onChange(count); }}
    style={[styles.option, { backgroundColor: theme.surface, borderColor: theme.border, opacity: disabled ? 0.5 : 1 }, pressStyle]}>
    <Animated.View pointerEvents="none" style={[styles.optionHighlight, { backgroundColor: theme.primarySoft, borderColor: theme.primary }, highlightStyle]}/>
    <AppText variant="heading">{count}</AppText>
    <AppText variant="caption" style={styles.center}>{count === 3 ? 'Recommended' : count === 1 ? 'One review' : 'Two reviews'}</AppText>
  </AnimatedPressable>;
}

export function LearningRhythmChoice({ value, onChange, disabled = false }: {
  value: LearningConfirmationCount;
  onChange(value: LearningConfirmationCount): void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();
  const position = useSharedValue<number>(value);
  useEffect(() => {
    // Retarget the current animation: rapid taps always settle on the latest choice.
    position.set(withTiming(value, { duration: 200, reduceMotion: ReduceMotion.System }));
    return () => cancelAnimation(position);
  }, [value, position]);
  return <View style={styles.section}>
    <AppText variant="caption" style={{ color: theme.primary }}>YOUR LEARNING RHYTHM</AppText>
    <AppText variant="title">When is a word learned?</AppText>
    <AppText style={[styles.description, { color: theme.muted }]}>Mark a word “I know this” in consecutive reviews to stop seeing it.</AppText>
    <View accessible accessibilityLabel={`${value} separate ${value === 1 ? 'review' : 'reviews'} of the same word, then learned. Reviews stop.`}
      style={[styles.illustration, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.artwork} aria-hidden>
        {counts.map((count) => <RhythmArtwork key={count} count={count} position={position}/>)}
      </View>
      <AppText variant="label" style={{ color: theme.success }}>Learned · reviews stop</AppText>
    </View>
    <AppText variant="label">Confirmations needed</AppText>
    <View role="radiogroup" accessibilityRole="radiogroup" style={styles.options}>
      {counts.map((count) => <RhythmOption key={count} count={count} selected={value === count}
        disabled={disabled} onChange={onChange}/>)}
    </View>
    <View style={[styles.note, { backgroundColor: theme.primarySoft }]}>
      <AppText variant="caption">{value === 1 ? 'One “I know this” stops reviews.' : 'Confirm in separate reviews. “Keep learning” resets the count.'}</AppText>
    </View>
    <AppText variant="caption" style={{ color: theme.muted }}>All learning languages on this device · Change anytime in Settings.</AppText>
  </View>;
}

export function LearningRhythmIntroduction() {
  const { onboardingComplete, rhythmIntroduced, learningConfirmations, saveLearningRhythm } = useAppData();
  const [choice, setChoice] = useState<LearningConfirmationCount | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await saveLearningRhythm(choice ?? learningConfirmations); }
    catch (error) { Alert.alert('Could not save learning rhythm', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  };
  if (onboardingComplete !== true || rhythmIntroduced !== false) return null;
  return <Modal visible animationType="fade" onRequestClose={() => undefined}>
    <Screen scroll style={styles.screen}>
      <AppText variant="label">New in Wordfold</AppText>
      <LearningRhythmChoice value={choice ?? learningConfirmations} onChange={setChoice} disabled={saving}/>
      <AppText variant="caption">Words you already know stay learned.</AppText>
      <PrimaryButton label="Save and continue" loading={saving} onPress={() => void save()}/>
    </Screen>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  section: { gap: spacing.sm },
  description: { fontSize: 14, lineHeight: 20 },
  illustration: { borderWidth: 1, borderRadius: radii.card, padding: spacing.sm, gap: spacing.xs, alignItems: 'center' },
  // Show the central 60% of the original canvas without changing the PNGs.
  artwork: { width: '100%', maxWidth: 400, aspectRatio: 2.5, overflow: 'hidden' },
  image: { position: 'absolute', top: '-33.3333%', width: '100%', height: '166.6667%' },
  options: { flexDirection: 'row', gap: spacing.sm },
  option: { flex: 1, minHeight: 64, borderWidth: 1, borderRadius: radii.control, padding: spacing.sm, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  optionHighlight: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderWidth: 1, borderRadius: radii.control - 1 },
  center: { textAlign: 'center' },
  note: { borderRadius: radii.control, padding: spacing.sm },
});
