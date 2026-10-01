import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated, { cancelAnimation, FadeInDown, interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import type { Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import type { WordPlayEventType } from './model';
import { normalizeSentenceAnswer, type SentenceGap } from './sentence';

export function SentenceRound({ word, gap, haptics, onRecord, onNext }: {
  word: Word; gap: SentenceGap; haptics: boolean;
  onRecord(type: WordPlayEventType): Promise<void>; onNext(): void;
}) {
  const theme = useAppTheme();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'correct' | 'shown' | null>(null);
  const [hadMiss, setHadMiss] = useState(false);
  const [incorrect, setIncorrect] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const completed = useRef(false);
  const missed = useRef(false);
  const advanced = useRef(false);
  const pulse = useSharedValue(0);
  const shake = useSharedValue(0);
  useEffect(() => () => { cancelAnimation(pulse); cancelAnimation(shake); }, [pulse, shake]);
  const accent = result === 'correct' ? theme.success : theme.primary;
  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pulse.value * 0.18, [0, 1], [theme.canvas, accent]),
    transform: [{ translateX: shake.value }, { scale: 1 + pulse.value * 0.015 }],
  }));
  const markMissed = () => {
    if (missed.current) return;
    missed.current = true;
    setHadMiss(true);
    void onRecord('game_missed');
  };
  const finish = (shown: boolean) => {
    if (completed.current) return;
    completed.current = true;
    if (shown) markMissed();
    void onRecord('game_answered');
    setIncorrect(false);
    setResult(shown ? 'shown' : 'correct');
    Keyboard.dismiss();
    pulse.set(withSequence(withTiming(1, { duration: 180, reduceMotion: ReduceMotion.System }), withTiming(0, { duration: 420, reduceMotion: ReduceMotion.System })));
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
  };
  const check = () => {
    if (completed.current || !input.trim()) return;
    if (normalizeSentenceAnswer(input) === normalizeSentenceAnswer(gap.answer)) { finish(false); return; }
    markMissed();
    setIncorrect(true);
    shake.set(withSequence(withTiming(-5, { duration: 65, reduceMotion: ReduceMotion.System }), withTiming(5, { duration: 65, reduceMotion: ReduceMotion.System }), withTiming(0, { duration: 65, reduceMotion: ReduceMotion.System })));
    inputRef.current?.focus();
  };
  const clue = word.translation?.trim();
  const showClue = clue && normalizeSentenceAnswer(clue) !== normalizeSentenceAnswer(word.term);

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.heading}>
        <Ionicons name="create-outline" size={26} color={theme.primary}/>
        <AppText variant="heading">Fill the gap</AppText>
      </View>
      <AppText style={{ color: theme.muted }}>Which learned word completes this sentence?</AppText>
      <Animated.View entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)} style={[styles.card, { borderColor: result ? accent : theme.border }, cardStyle]}>
        <AppText variant="caption" style={{ color: theme.muted }}>IN CONTEXT</AppText>
        <AppText style={styles.sentence} accessibilityLabel={`${gap.before}${result ? gap.answer : ' blank '}${gap.after}`}>
          {gap.before}<AppText style={[styles.blank, { color: result ? accent : theme.primary }]}
            accessibilityRole={result ? undefined : 'button'} accessibilityLabel={result ? undefined : 'Enter missing word'}
            onPress={result ? undefined : () => inputRef.current?.focus()}>{result ? gap.answer : ' ______ '}</AppText>{gap.after}
        </AppText>
        {showClue && !result ? <View style={[styles.clue, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="bulb-outline" size={18} color={theme.primary}/>
          <AppText style={styles.clueText}>Meaning: {clue}</AppText>
        </View> : null}
        {!result ? <>
          <AppText variant="label">Your answer</AppText>
          <TextInput ref={inputRef} accessibilityLabel="Missing word" value={input} onChangeText={(value) => { setInput(value); setIncorrect(false); }}
            placeholder="Type the missing word" placeholderTextColor={theme.muted} autoCorrect={false} autoCapitalize="none" spellCheck={false}
            returnKeyType="done" submitBehavior="submit" onSubmitEditing={check}
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: incorrect ? theme.danger : theme.border }]}/>
          {incorrect ? <AppText accessibilityRole="alert" style={{ color: theme.danger }}>Not the word we’re looking for. Try again, or show the answer.</AppText> : null}
        </> : <Animated.View entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)} style={styles.explanation}>
          <View style={styles.heading} accessibilityLiveRegion="polite">
            <Ionicons name={result === 'correct' ? 'checkmark-circle-outline' : 'book-outline'} size={30} color={accent}/>
            <AppText variant="label" style={{ color: accent }}>{result === 'correct' ? 'That’s the word!' : 'A word to revisit'}</AppText>
          </View>
          <AppText variant="title">{word.term}</AppText>
          {word.partOfSpeech ? <AppText variant="caption" style={{ color: theme.muted }}>{word.partOfSpeech}</AppText> : null}
          <AppText>{word.definition}</AppText>
          {clue ? <AppText style={{ color: theme.muted }}>{clue}</AppText> : null}
          {hadMiss ? <AppText variant="caption" style={{ color: theme.muted }}>You can choose to practise this word again in the recap.</AppText> : null}
        </Animated.View>}
      </Animated.View>
    </ScrollView>
    <SafeAreaView edges={['bottom']} style={styles.footer}>
      {result ? <PrimaryButton label="Next word" icon={<Ionicons name="arrow-forward" size={20} color="#FFFFFF"/>} onPress={() => { if (!advanced.current) { advanced.current = true; onNext(); } }}/>
        : <>
          <PrimaryButton label="Check answer" disabled={!input.trim()} onPress={check} icon={<Ionicons name="checkmark" size={20} color="#FFFFFF"/>}/>
          <PrimaryButton label="Show answer" variant="secondary" onPress={() => finish(true)}/>
        </>}
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 }, content: { gap: spacing.lg, paddingBottom: spacing.lg },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: { padding: spacing.xl, gap: spacing.lg, borderWidth: 1, borderRadius: radii.sheet },
  sentence: { fontSize: 22, lineHeight: 34 }, blank: { fontSize: 22, lineHeight: 34, fontWeight: '600' },
  clue: { padding: spacing.md, borderRadius: radii.control, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, clueText: { flex: 1 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radii.control, padding: spacing.md, fontSize: 18, fontFamily: 'Inter_400Regular' },
  explanation: { gap: spacing.sm }, footer: { paddingVertical: spacing.sm, gap: spacing.sm },
});
