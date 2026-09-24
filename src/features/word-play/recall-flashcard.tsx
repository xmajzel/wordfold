import { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { interpolateColor, runOnJS, withDelay, withSequence, cancelAnimation, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import type { Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export function RecallFlashcard({ word, revealed, onReveal, outcome = null, nextWord, onAdvance }: {
  word: Word; revealed: boolean; onReveal(): void;
  outcome?: 'known' | 'practice' | null; nextWord?: Word; onAdvance?(): void;
}) {
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(revealed ? 1 : 0);
  const tint = useSharedValue(0);
  const fade = useSharedValue(1);
  const advanceRef = useRef(onAdvance);
  useEffect(() => { advanceRef.current = onAdvance; }, [onAdvance]);
  const advance = useCallback(() => advanceRef.current?.(), []);
  const color = outcome === 'practice' ? theme.primary : theme.success;
  const frontWord = outcome && nextWord ? nextWord : word;
  const frontTranslation = frontWord.translation?.trim();
  const translation = word.translation?.trim();
  const reverse = Boolean(translation && translation.toLocaleLowerCase() !== word.term.trim().toLocaleLowerCase());
  const prompt = outcome && nextWord
    ? (frontTranslation && frontTranslation.toLocaleLowerCase() !== frontWord.term.trim().toLocaleLowerCase() ? frontTranslation : frontWord.term)
    : reverse ? translation : word.term;

  useEffect(() => {
    if (outcome) return;
    progress.set(reducedMotion ? Number(revealed) : withTiming(Number(revealed), { duration: 360, reduceMotion: ReduceMotion.System }));
    return () => cancelAnimation(progress);
  }, [revealed, reducedMotion, progress, outcome]);

  useEffect(() => {
    if (!outcome) return;
    // Start from the answer face even if a rating interrupts its reveal animation.
    progress.set(1);
    tint.set(withSequence(withTiming(1, { duration: 140 }), withDelay(100, withTiming(0, { duration: 360 }))));
    if (reducedMotion || !nextWord) {
      fade.set(withDelay(reducedMotion ? 140 : 240, withTiming(0, { duration: 120, reduceMotion: ReduceMotion.Never }, (finished) => {
        if (finished) runOnJS(advance)();
      })));
    } else {
      progress.set(withDelay(240, withTiming(2, { duration: 360, reduceMotion: ReduceMotion.System }, (finished) => {
        if (finished) runOnJS(advance)();
      })));
    }
    return () => { cancelAnimation(progress); cancelAnimation(tint); cancelAnimation(fade); };
  }, [outcome, nextWord, reducedMotion, progress, tint, fade, advance]);

  const frameStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0.5 || progress.value >= 1.5 ? 1 : 0,
    backgroundColor: interpolateColor(tint.value * 0.2, [0, 1], [theme.primarySoft, color]),
    transform: [{ perspective: 1000 }, { rotateY: `${progress.value * 180}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: progress.value >= 0.5 && progress.value < 1.5 ? 1 : 0,
    backgroundColor: interpolateColor(tint.value * 0.2, [0, 1], [theme.canvas, color]),
    transform: [{ perspective: 1000 }, { rotateY: `${(progress.value - 1) * 180}deg` }],
  }));

  return <Animated.View testID="recall-flashcard" style={[{ height: Math.max(260, Math.min(420, height * 0.44)) }, frameStyle]}>
    <Animated.View testID="recall-front" collapsable={false} pointerEvents={revealed ? 'none' : 'auto'}
      accessibilityElementsHidden={revealed} importantForAccessibility={revealed ? 'no-hide-descendants' : 'auto'}
      style={[styles.face, { backgroundColor: theme.primarySoft, borderColor: theme.border }, frontStyle]}>
      <ScrollView nestedScrollEnabled contentContainerStyle={styles.scroll}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${prompt}. Reveal answer`} disabled={Boolean(outcome)} onPress={onReveal} style={styles.front}>
          <AppText variant="title" style={styles.center}>{prompt}</AppText>
          {frontWord.partOfSpeech ? <AppText variant="caption" style={styles.center}>{frontWord.partOfSpeech}</AppText> : null}
          <AppText variant="caption" style={[styles.center, { color: theme.muted }]}>Tap to reveal</AppText>
        </Pressable>
      </ScrollView>
    </Animated.View>
    <Animated.View testID="recall-back" collapsable={false} pointerEvents={revealed ? 'auto' : 'none'}
      accessibilityElementsHidden={!revealed} importantForAccessibility={!revealed ? 'no-hide-descendants' : 'auto'}
      style={[styles.face, { backgroundColor: theme.canvas, borderColor: theme.border }, backStyle]}>
      {outcome ? <View accessibilityLiveRegion="polite" style={styles.result}>
        <Ionicons name={outcome === 'known' ? 'checkmark-circle-outline' : 'calendar-outline'} size={56} color={color}/>
        <AppText variant="heading" style={styles.center}>{outcome === 'known' ? 'I know this' : 'Keep learning'}</AppText>
        <AppText style={styles.center}>{word.term}</AppText>
      </View> : <ScrollView nestedScrollEnabled contentContainerStyle={[styles.scroll, styles.back]}>
        <AppText variant="caption" style={{ color: theme.muted }}>Answer</AppText>
        <AppText variant="title">{word.term}</AppText>
        {word.partOfSpeech ? <AppText variant="caption" style={{ color: theme.muted }}>{word.partOfSpeech}</AppText> : null}
        <AppText>{word.definition}</AppText>
        {translation ? <AppText style={{ color: theme.muted }}>{translation}</AppText> : null}
      </ScrollView>}
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  face: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 1, borderRadius: radii.sheet, backfaceVisibility: 'hidden', overflow: 'hidden' },
  scroll: { flexGrow: 1 },
  front: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, minHeight: 48 },
  back: { padding: spacing.xl, justifyContent: 'center', gap: spacing.md },
  result: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  center: { textAlign: 'center' },
});
