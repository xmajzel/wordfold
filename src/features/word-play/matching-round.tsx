import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated, { cancelAnimation, FadeInDown, interpolateColor, ReduceMotion, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import type { Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import type { WordPlayEventType, WordPlayMode, WordPlayRound } from './model';

type Resolution = 'matched' | 'practice';
export function MatchingRound({ round, haptics, onRecord, onNext }: {
  round: Extract<WordPlayRound, { mode: 'matching' }>; haptics: boolean;
  onRecord(word: Word, mode: WordPlayMode, type: WordPlayEventType): Promise<void>; onNext(): void;
}) {
  const theme = useAppTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});
  const [mistake, setMistake] = useState<{ word: string; answer: string; revision: number } | null>(null);
  const [feedback, setFeedback] = useState('Choose a word, then find its meaning.');
  const accepted = useRef(new Set<string>());
  const advanced = useRef(false);
  const nextRef = useRef(onNext);
  useEffect(() => { nextRef.current = onNext; }, [onNext]);
  const advance = useCallback(() => { if (!advanced.current) { advanced.current = true; nextRef.current(); } }, []);
  const count = Object.keys(resolved).length;
  const finished = count === round.words.length;
  const hasPractice = Object.values(resolved).includes('practice');
  const exit = useSharedValue(0);
  useEffect(() => {
    if (!finished) return;
    exit.set(withDelay(hasPractice ? 1600 : 800, withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System }, (done) => {
      if (done) runOnJS(advance)();
    }), ReduceMotion.Never));
    return () => cancelAnimation(exit);
  }, [finished, hasPractice, exit, advance]);
  const boardStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));

  const resolve = (word: Word, practice: boolean) => {
    if (accepted.current.has(word.id)) return;
    accepted.current.add(word.id);
    if (practice) void onRecord(word, 'matching', 'game_missed');
    void onRecord(word, 'matching', 'game_answered');
    setResolved((current) => ({ ...current, [word.id]: practice ? 'practice' : 'matched' }));
    setSelected(null); setMistake(null);
    setFeedback(practice ? `${word.term} → ${word.translation}. You can practise it again in the recap.` : `${word.term} → ${word.translation}`);
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
  };
  const match = (answer: Word) => {
    const word = round.words.find((item) => item.id === selected);
    if (!word || accepted.current.has(word.id) || accepted.current.has(answer.id)) return;
    if (word.id === answer.id) { resolve(word, false); return; }
    void onRecord(word, 'matching', 'game_missed');
    setMistake((current) => ({ word: word.id, answer: answer.id, revision: (current?.revision ?? 0) + 1 }));
    setFeedback('Not that pair. Try another meaning, or choose “Need another look”.');
  };

  return <View style={styles.root}>
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Animated.View entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)} style={[styles.content, boardStyle]}>
        <View style={styles.heading}><Ionicons name="extension-puzzle-outline" size={26} color={theme.primary}/><AppText variant="heading">Find the pairs</AppText></View>
        <AppText style={{ color: theme.muted }}>Tap a word on the left, then its meaning on the right.</AppText>
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Pairs reviewed" accessibilityValue={{ min: 0, max: round.words.length, now: count }} style={styles.progress}>
          {round.words.map((word) => <View key={word.id} style={[styles.dot, { backgroundColor: resolved[word.id] === 'matched' ? theme.success : resolved[word.id] === 'practice' ? theme.primary : theme.primarySoft }]}/>)}
          <AppText variant="caption" style={{ color: theme.muted }}>{count} / {round.words.length}</AppText>
        </View>
        <View style={styles.columns}>
          <View style={styles.column}><AppText variant="caption" style={{ color: theme.muted }}>WORDS</AppText>
            {round.words.map((word) => <MatchTile key={word.id} label={word.term} side="Word" selected={selected === word.id} resolution={resolved[word.id]}
              mistake={mistake?.word === word.id ? mistake.revision : 0} disabled={finished} onPress={() => { if (!accepted.current.has(word.id)) { setSelected(word.id); setMistake(null); } }}/>)}</View>
          <View style={styles.column}><AppText variant="caption" style={{ color: theme.muted }}>MEANINGS</AppText>
            {round.answers.map((word) => <MatchTile key={word.id} label={word.translation!} side="Meaning" resolution={resolved[word.id]}
              mistake={mistake?.answer === word.id ? mistake.revision : 0} disabled={!selected || finished} onPress={() => match(word)}/>)}</View>
        </View>
      </Animated.View>
    </ScrollView>
    <SafeAreaView edges={['bottom']} style={styles.footer}>
      <View style={styles.feedback} accessibilityLiveRegion="polite">
        <AppText style={{ color: mistake ? theme.danger : theme.primary }}>{feedback}</AppText>
      </View>
      {finished ? <Animated.View entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)} style={styles.complete} accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle-outline" size={28} color={hasPractice ? theme.primary : theme.success}/>
        <AppText variant="heading">Board complete</AppText>
      </Animated.View> : <PrimaryButton label={selected ? 'Need another look' : 'Select a word to match'} variant="secondary" disabled={!selected || finished}
        icon={<Ionicons name="book-outline" size={20} color={theme.primary}/>} onPress={() => {
          const word = round.words.find((item) => item.id === selected);
          if (word) resolve(word, true);
        }}/>}
    </SafeAreaView>
  </View>;
}

function MatchTile({ label, side, selected = false, resolution, mistake, disabled, onPress }: {
  label: string; side: string; selected?: boolean; resolution?: Resolution; mistake: number; disabled: boolean; onPress(): void;
}) {
  const theme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const lift = useSharedValue(0);
  const pulse = useSharedValue(0);
  const wrong = useSharedValue(0);
  const shake = useSharedValue(0);
  const accent = resolution === 'practice' ? theme.primary : theme.success;
  useEffect(() => {
    lift.set(withTiming(selected ? 1 : 0, { duration: 130, reduceMotion: ReduceMotion.System }));
    return () => cancelAnimation(lift);
  }, [selected, lift]);
  useEffect(() => {
    if (!resolution) return;
    pulse.set(withSequence(withTiming(1, { duration: 140, reduceMotion: ReduceMotion.System }), withDelay(250, withTiming(0, { duration: 280, reduceMotion: ReduceMotion.System }))));
    return () => cancelAnimation(pulse);
  }, [resolution, pulse]);
  useEffect(() => {
    if (mistake) {
      wrong.set(withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 400 })));
      shake.set(withSequence(withTiming(-4, { duration: 70, reduceMotion: ReduceMotion.System }), withTiming(4, { duration: 70, reduceMotion: ReduceMotion.System }), withTiming(0, { duration: 70, reduceMotion: ReduceMotion.System })));
    } else { wrong.set(0); shake.set(0); }
    return () => { cancelAnimation(wrong); cancelAnimation(shake); };
  }, [mistake, wrong, shake]);
  const motion = useAnimatedStyle(() => ({
    transform: [{ translateY: reducedMotion ? 0 : -2 * lift.value }, { translateX: reducedMotion ? 0 : shake.value }, { scale: reducedMotion ? 1 : 1 + pulse.value * 0.025 }],
    backgroundColor: interpolateColor(wrong.value, [0, 1], [interpolateColor(pulse.value * 0.22, [0, 1], [selected ? theme.primarySoft : theme.canvas, accent]), `${theme.danger}30`]),
    borderColor: interpolateColor(wrong.value, [0, 1], [resolution ? accent : selected ? theme.primary : theme.border, theme.danger]),
  }));
  return <Animated.View style={[styles.tile, motion]}>
    <Pressable accessibilityRole={resolution ? 'text' : 'button'} accessibilityLabel={`${side}: ${label}${resolution ? resolution === 'matched' ? ', matched' : ', review again' : ''}`}
      accessibilityState={{ selected, disabled: disabled || Boolean(resolution) }} disabled={disabled || Boolean(resolution)} onPress={onPress} style={styles.tileInner}>
      <AppText variant="label" style={{ textAlign: 'center', color: resolution ? theme.muted : theme.text }}>{label}</AppText>
      <View style={styles.statusIcon} aria-hidden>{resolution ? <Ionicons name={resolution === 'matched' ? 'checkmark-circle' : 'book-outline'} size={18} color={accent}/> : null}</View>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 }, content: { gap: spacing.lg, paddingBottom: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, dot: { flex: 1, height: 6, borderRadius: radii.pill },
  columns: { flexDirection: 'row', gap: spacing.sm }, column: { flex: 1, gap: spacing.sm },
  tile: { minHeight: 82, borderWidth: 2, borderRadius: radii.control }, tileInner: { flex: 1, minHeight: 78, padding: spacing.sm, gap: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  complete: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  statusIcon: { height: 18 },
  footer: { gap: spacing.sm, paddingVertical: spacing.sm }, feedback: { minHeight: 62, gap: spacing.sm },
});
