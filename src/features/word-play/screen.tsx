import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { cefrLevels } from '@/data/cefr-levels';
import { filterWordsByLearningCategory } from '@/features/learning/algorithm';
import { wordBelongsToCourse, type CourseId } from '@/domain/courses';
import type { LearningFilter, Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';
import { buildWordPlaySession, isWordPlayUnlocked, WORD_PLAY_SIZE, type WordPlayEvent, type WordPlayEventType, type WordPlayMode, type WordPlayRound } from './model';

export default function WordPlayScreen({ inTab = false, autoStart = false, initialHaptics = false, initialFilter = 'all' }: {
  inTab?: boolean; autoStart?: boolean; initialHaptics?: boolean; initialFilter?: LearningFilter;
}) {
  const { words, activeCourseId, activeCourse, wordPlayStats, dataSource, collections } = useAppData();
  const [filter, setFilter] = useState<LearningFilter>(initialFilter);
  const learned = words.filter((word) => word.state === 'learned' && wordBelongsToCourse(word, activeCourseId));
  const scopedCount = filterWordsByLearningCategory(learned, filter).length;
  const unlocked = isWordPlayUnlocked(words, activeCourseId, wordPlayStats);
  const [session, setSession] = useState<{ id: string; courseId: CourseId; dataSource: string; rounds: WordPlayRound[] } | null>(() => {
    if (!autoStart || (dataSource !== 'guest' && dataSource !== 'synced')) return null;
    const rounds = buildWordPlaySession(words, activeCourseId, wordPlayStats, Math.random, filter);
    return rounds.length ? { id: Crypto.randomUUID(), courseId: activeCourseId, dataSource, rounds } : null;
  });
  const [haptics, setHaptics] = useState(initialHaptics);
  const theme = useAppTheme();
  const count = learned.length;
  const start = () => {
    if (!unlocked || !scopedCount || (dataSource !== 'guest' && dataSource !== 'synced')) return;
    if (inTab) {
      router.push({ pathname: '/word-play', params: { haptics: haptics ? '1' : '0', filter } } as never);
      return;
    }
    const rounds = buildWordPlaySession(words, activeCourseId, wordPlayStats, Math.random, filter);
    if (rounds.length) setSession({ id: Crypto.randomUUID(), courseId: activeCourseId, dataSource, rounds });
  };

  return <Screen style={styles.screen}>
    <View style={styles.header}>
      {!inTab ? <Pressable accessibilityRole="button" accessibilityLabel="Close Word play" onPress={() => router.dismissTo('/(tabs)/play' as never)} style={styles.close}>
        <Ionicons name="close" size={24} color={theme.primary}/>
      </Pressable> : null}
      <AppText style={styles.title} variant="heading">{inTab ? 'Play' : 'Word play'}</AppText>
      <Pressable accessibilityRole="switch" accessibilityLabel="Haptic feedback" accessibilityState={{ checked: haptics }}
        onPress={() => setHaptics((value) => !value)} style={[styles.close, { backgroundColor: haptics ? theme.primarySoft : 'transparent', borderRadius: radii.control }]}>
        <Ionicons name="phone-portrait-outline" size={22} color={haptics ? theme.primary : theme.muted}/>
        <AppText variant="caption" style={{ color: theme.muted }}>Haptics</AppText>
      </Pressable>
    </View>
    {session && session.courseId === activeCourseId && session.dataSource === dataSource && (dataSource === 'guest' || dataSource === 'synced')
      ? <PlaySession key={session.id} {...session} haptics={haptics} canPlayAgain={unlocked && scopedCount > 0} onAgain={start}/>
      : <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="extension-puzzle-outline" size={52} color={theme.primary}/>
          <AppText variant="heading">Keep your words close</AppText>
          <AppText>Revisit up to 10 learned words in {activeCourse.displayName}. Match pairs or try a recall challenge—each visit brings a different round.</AppText>
          <AppText style={{ color: theme.muted }}>No timer. Take your time, and choose what to practise again at the end.</AppText>
          <AppText variant="label">Choose your words</AppText>
          {[
            { title: 'Review', options: [{ value: 'all' as LearningFilter, label: 'All learned words' }] },
            { title: 'Collections', options: collections.map((collection) => ({ value: `collection:${collection.id}` as LearningFilter, label: collection.name })) },
            { title: 'Level', options: [...cefrLevels.map((level) => ({ value: level as LearningFilter, label: level })), { value: 'personal' as LearningFilter, label: 'No level' }] },
          ].map((group) => <View key={group.title} style={styles.filterGroup}>
            <AppText variant="caption" style={{ color: theme.muted }}>{group.title}</AppText>
            <View style={styles.chips}>{group.options.map((option) => {
              const available = filterWordsByLearningCategory(learned, option.value).length;
              return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${option.label}, ${available} learned words`}
                accessibilityState={{ checked: filter === option.value }} onPress={() => setFilter(option.value)}
                style={[styles.chip, { borderColor: filter === option.value ? theme.primary : theme.border, backgroundColor: filter === option.value ? theme.primarySoft : theme.surface }]}>
                <AppText>{option.label} · {available}</AppText>
              </Pressable>;
            })}</View>
          </View>)}
          <AppText accessibilityLiveRegion="polite">{scopedCount ? `${Math.min(scopedCount, WORD_PLAY_SIZE)} ${Math.min(scopedCount, WORD_PLAY_SIZE) === 1 ? 'word' : 'words'} this round` : 'No learned words in this selection yet. Choose another collection or level.'}</AppText>
          <PrimaryButton label="Let’s play" disabled={!unlocked || scopedCount === 0 || (dataSource !== 'guest' && dataSource !== 'synced')} onPress={start}/>
          {!unlocked ? <>
            <AppText style={{ color: theme.muted }}>Learn {WORD_PLAY_SIZE - count} more words to unlock Word play.</AppText>
            <AppText variant="label">{count} of {WORD_PLAY_SIZE} words learned</AppText>
            <View accessibilityRole="progressbar" accessibilityLabel="Word play unlock progress" accessibilityValue={{ min: 0, max: WORD_PLAY_SIZE, now: count }} style={[styles.track, { backgroundColor: theme.primarySoft }]}>
              <View style={[styles.fill, { backgroundColor: theme.primary, width: `${count / WORD_PLAY_SIZE * 100}%` }]}/>
            </View>
          </> : null}
        </View>
      </ScrollView>}
  </Screen>;
}

function PlaySession({ id, courseId, rounds, haptics, canPlayAgain, onAgain }: {
  id: string; courseId: CourseId; rounds: WordPlayRound[]; haptics: boolean; canPlayAgain: boolean; onAgain(): void;
}) {
  const { recordWordPlayEvent, words, updateLearningFilter } = useAppData();
  const theme = useAppTheme();
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [returned, setReturned] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const events = useRef(new Map<string, WordPlayEvent>());
  const saved = useRef(new Set<string>());
  const recordRef = useRef(recordWordPlayEvent);
  useEffect(() => { recordRef.current = recordWordPlayEvent; }, [recordWordPlayEvent]);
  const allWords = rounds.flatMap((round) => round.words);
  const finished = index === rounds.length;
  const revisited = answered.size;

  const record = async (word: Word, mode: WordPlayMode, type: WordPlayEventType) => {
    const key = `${word.id}:${type}`;
    if (saved.current.has(key)) return;
    let event = events.current.get(key);
    if (!event) {
      event = { id: Crypto.randomUUID(), sessionId: id, courseId, wordId: word.id, mode,
        sessionMode: rounds.some((round) => round.mode === 'matching') ? 'matching' : 'recall', type, occurredAt: new Date().toISOString() };
      events.current.set(key, event);
    }
    await recordRef.current(event);
    saved.current.add(key);
    if (type === 'game_answered') setAnswered((current) => new Set([...current, word.id]));
    if (type === 'game_missed') {
      setMissed((current) => new Set([...current, word.id]));
      setSelected((current) => new Set([...current, word.id]));
    }
  };

  const relearn = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(null);
    try {
      for (const word of allWords.filter((item) => selected.has(item.id) && !returned.has(item.id))) {
        const mode = rounds.find((round) => round.words.some((item) => item.id === word.id))!.mode;
        await record(word, mode, 'game_relearned');
        setReturned((current) => new Set([...current, word.id]));
        setSelected((current) => { const next = new Set(current); next.delete(word.id); return next; });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your choices. Please try again.');
    } finally { pending.current = false; setBusy(false); }
  };

  return <>
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: allWords.length, now: revisited }}
      accessibilityLabel="Words revisited" style={[styles.track, { backgroundColor: theme.primarySoft }]}>
      <View style={[styles.fill, { backgroundColor: theme.primary, width: `${revisited / allWords.length * 100}%` }]}/>
    </View>
    <AppText variant="caption" style={{ color: theme.muted }}>{revisited} of {allWords.length} words revisited</AppText>
    {!finished ? <Round key={index} round={rounds[index]} onRecord={record} haptics={haptics} onContinue={() => setIndex((current) => current + 1)}/>
      : <Animated.View entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="ribbon-outline" size={52} color={theme.success}/>
        <AppText variant="heading">A little stronger</AppText>
        <AppText>{allWords.length} words revisited · {missed.size} needed another look</AppText>
        <AppText style={{ color: theme.muted }}>{missed.size ? 'Choose which words to return to regular practice. Your other words stay learned.' : 'You made it through! Come back for a different challenge.'}</AppText>
        <View style={styles.chips}>
          {allWords.filter((word) => missed.has(word.id)).map((word) => {
            const current = words.find((item) => item.id === word.id);
            const available = current?.state === 'learned' && wordBelongsToCourse(current, courseId);
            const added = returned.has(word.id);
            return <Pressable key={word.id} accessibilityRole="checkbox" accessibilityLabel={`Practise ${word.term} again`}
              accessibilityState={{ checked: selected.has(word.id), disabled: busy || added }} disabled={busy || added}
              onPress={() => setSelected((value) => { const next = new Set(value); if (next.has(word.id)) next.delete(word.id); else if (available) next.add(word.id); return next; })}
              style={[styles.chip, { backgroundColor: selected.has(word.id) ? theme.primarySoft : theme.surface, borderColor: theme.border }]}>
              <Ionicons name={added ? 'checkmark-circle' : selected.has(word.id) ? 'checkbox-outline' : 'square-outline'} size={20} color={theme.primary}/>
              <AppText>{word.term}{added ? ' · added' : !available ? ' · unavailable' : ''}</AppText>
            </Pressable>;
          })}
        </View>
        {error ? <AppText accessibilityRole="alert" style={{ color: theme.danger }}>{error}</AppText> : null}
        {selected.size > 0 ? <PrimaryButton label={`Add ${selected.size} ${selected.size === 1 ? 'word' : 'words'} to learning`} loading={busy} onPress={() => void relearn()}/> : null}
        {returned.size > 0 ? <>
          <AppText accessibilityLiveRegion="polite">{returned.size} {returned.size === 1 ? 'word is' : 'words are'} ready in today’s practice.</AppText>
          <PrimaryButton label="Practise now" disabled={busy} onPress={() => {
            void updateLearningFilter('all').then(() => router.replace('/(tabs)')).catch(() => setError('Could not open practice. Please try again.'));
          }}/>
        </> : null}
        <PrimaryButton label="Done" variant="secondary" disabled={busy} onPress={() => router.dismissTo('/(tabs)/play' as never)}/>
        {canPlayAgain
          ? <PrimaryButton label="Play another round" variant="secondary" disabled={busy} onPress={onAgain}/> : null}
      </Animated.View>}
  </>;
}

function Round({ round, onRecord, onContinue, haptics }: {
  round: WordPlayRound; onRecord(word: Word, mode: WordPlayMode, type: WordPlayEventType): Promise<void>;
  onContinue(): void; haptics: boolean;
}) {
  const theme = useAppTheme();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const pending = useRef(false);
  const recordRef = useRef(onRecord);
  useEffect(() => { recordRef.current = onRecord; }, [onRecord]);
  const completed = matched.size === round.words.length;

  const saveSeen = async () => {
    for (const word of round.words) await recordRef.current(word, round.mode, 'game_seen');
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        for (const word of round.words) await recordRef.current(word, round.mode, 'game_seen');
        if (active) setReady(true);
      } catch { if (active) setError('Could not save this round. Retry before continuing.'); }
    })();
    return () => { active = false; };
  }, [round]);

  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Please try again.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const answer = async (word: Word, needsPractice: boolean) => {
    if (needsPractice) await onRecord(word, round.mode, 'game_missed');
    await onRecord(word, round.mode, 'game_answered');
    setMatched((current) => new Set([...current, word.id]));
    setFeedback(needsPractice ? (round.mode === 'matching' ? `${word.term} → ${word.translation}. You can practise it again at the end.` : 'Good catch. You can practise this one again at the end.') : 'Nicely done!');
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
  };
  const pair = (answerWord: Word) => {
    const word = round.words.find((item) => item.id === selected);
    if (!word) return;
    void run(async () => {
      if (word.id === answerWord.id) { await answer(word, false); setSelected(null); }
      else {
        // Attribute the mistake to the chosen prompt, not the unrelated answer tile.
        await onRecord(word, round.mode, 'game_missed');
        setFeedback('Not that pair. Try another meaning, or choose “Need another look”.');
      }
    });
  };
  const recallWord = round.words[0];
  const translation = recallWord.translation?.trim();
  const reverseRecall = Boolean(translation && translation.toLocaleLowerCase() !== recallWord.term.trim().toLocaleLowerCase());

  return <Animated.View entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <AppText variant="heading">{round.mode === 'matching' ? 'Find the pairs' : 'Bring it to mind'}</AppText>
    <AppText style={{ color: theme.muted }}>{round.mode === 'matching' ? 'Tap a word on the left, then its meaning on the right.' : reverseRecall ? 'Which word means this? Think of it before revealing.' : 'Can you remember what this word means?'}</AppText>
    {!ready ? <>
      {error ? <PrimaryButton label="Retry round" loading={busy} onPress={() => void run(async () => { await saveSeen(); setReady(true); })}/> : <ActivityIndicator color={theme.primary}/>}
    </> : null}
    {round.mode === 'matching' ? <>
      <View style={styles.columns}>
        <View style={styles.column}>{round.words.map((word) => <Tile key={word.id} label={word.term} side="Word" selected={selected === word.id} matched={matched.has(word.id)} disabled={busy || !ready} onPress={() => setSelected(word.id)}/>)}</View>
        <View style={styles.column}>{round.answers.map((word) => <Tile key={word.id} label={word.translation!} side="Meaning" matched={matched.has(word.id)} disabled={busy || !selected || !ready} onPress={() => pair(word)}/>)}</View>
      </View>
      {!completed ? <PrimaryButton label={selected ? 'Need another look' : 'Select a word to match'} variant="secondary" disabled={!selected || busy} onPress={() => void run(async () => {
        const word = round.words.find((item) => item.id === selected)!;
        await answer(word, true); setSelected(null);
      })}/> : null}
    </> : <>
      <View style={[styles.prompt, { backgroundColor: theme.primarySoft }]}>
        <AppText variant="heading">{reverseRecall ? translation : recallWord.term}</AppText>
        {recallWord.partOfSpeech ? <AppText variant="caption">{recallWord.partOfSpeech}</AppText> : null}
      </View>
      {revealed ? <>
        {reverseRecall ? <AppText variant="heading">{recallWord.term}</AppText> : null}
        <AppText>{recallWord.definition}</AppText>
        {translation ? <AppText style={{ color: theme.muted }}>{translation}</AppText> : null}
        {!completed ? <View style={styles.actions}>
          <PrimaryButton label="Got it" disabled={busy} onPress={() => void run(() => answer(recallWord, false))}/>
          <PrimaryButton label="Needs practice" variant="secondary" disabled={busy} onPress={() => void run(() => answer(recallWord, true))}/>
        </View> : null}
      </> : <PrimaryButton label="Reveal answer" disabled={busy || !ready} onPress={() => setRevealed(true)}/>}
    </>}
    {feedback ? <AppText accessibilityLiveRegion="polite" style={{ color: theme.primary }}>{feedback}</AppText> : null}
    {error ? <AppText accessibilityRole="alert" style={{ color: theme.danger }}>{error}</AppText> : null}
    {busy ? <AppText variant="caption">Saving…</AppText> : null}
    {completed ? <PrimaryButton label="Continue" onPress={onContinue} disabled={busy}/> : null}
  </Animated.View>;
}

function Tile({ label, side, selected = false, matched, disabled, onPress }: {
  label: string; side: string; selected?: boolean; matched: boolean; disabled: boolean; onPress(): void;
}) {
  const theme = useAppTheme();
  return <View style={styles.tileSlot}>
    {matched ? <View style={[styles.matched, { borderColor: theme.border }]}><Ionicons name="checkmark" color={theme.success} size={20}/></View>
      : <Animated.View exiting={FadeOut.duration(180).reduceMotion(ReduceMotion.System)} style={styles.tileContent}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${side}: ${label}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
          style={({ pressed }) => [styles.tile, { backgroundColor: selected ? theme.primarySoft : theme.raised, borderColor: selected ? theme.primary : theme.border, opacity: pressed ? 0.7 : 1 }]}>
          <AppText variant="label" style={styles.tileLabel}>{label}</AppText>
        </Pressable>
      </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm }, title: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxxl, gap: spacing.lg },
  filterGroup: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 60 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: radii.sheet, padding: spacing.lg, gap: spacing.lg },
  track: { height: 8, borderRadius: radii.pill, overflow: 'hidden' }, fill: { height: '100%' },
  columns: { flexDirection: 'row', gap: spacing.sm }, column: { flex: 1, gap: spacing.sm },
  tileSlot: { minHeight: 66 }, tileContent: { flex: 1 },
  tile: { flex: 1, minHeight: 66, padding: spacing.sm, borderWidth: 2, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { textAlign: 'center' }, matched: { minHeight: 66, borderWidth: 1, borderStyle: 'dashed', borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  prompt: { padding: spacing.xl, borderRadius: radii.card, gap: spacing.sm }, actions: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: spacing.sm, borderWidth: 1, borderRadius: radii.control, padding: spacing.md, minHeight: 48 },
});
