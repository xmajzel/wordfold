import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { wordBelongsToCourse, type CourseId } from '@/domain/courses';
import type { LearningFilter, Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';
import { MatchingRound } from './matching-round';
import { SentenceRound } from './sentence-round';
import { RecallFlashcard } from './recall-flashcard';
import { WordPlaySaveQueue } from './save-queue';
import { buildWordPlaySession, defaultPlayConfig, playSelection, type PlayConfig, type WordPlayEvent, type WordPlayEventType, type WordPlayMode, type WordPlayRound } from './model';

import { PlaySetup } from './setup';
import { WordCardsSession } from './word-cards-session';

export default function WordPlayScreen({ inTab = false, autoStart = false, initialHaptics = false, initialFilter = 'all', initialConfig }: {
  inTab?: boolean; autoStart?: boolean; initialHaptics?: boolean; initialFilter?: LearningFilter; initialConfig?: PlayConfig;
}) {
  const { words, activeCourseId, activeCourse, wordPlayStats, dataSource, collections } = useAppData();
  const [config, setConfig] = useState<PlayConfig>(initialConfig ?? { ...defaultPlayConfig, filter: initialFilter });
  const selection = useMemo(() => playSelection(words, activeCourseId, config), [words, activeCourseId, config]);
  const ready = dataSource === 'guest' || dataSource === 'synced';
  const createSession = () => {
    if (!ready || !selection.count) return null;
    const rounds = buildWordPlaySession(words, activeCourseId, wordPlayStats, Math.random, config);
    const cards = config.activity === 'cards' ? selection.supported.slice(0, selection.count) : [];
    return { id: Crypto.randomUUID(), courseId: activeCourseId, dataSource, rounds, cards };
  };
  const [session, setSession] = useState(() => autoStart ? createSession() : null);
  const [haptics, setHaptics] = useState(initialHaptics);
  const theme = useAppTheme();
  const start = () => {
    if (!ready || !selection.count) return;
    if (inTab) {
      router.push({ pathname: '/word-play', params: { haptics: haptics ? '1' : '0', ...config } } as never);
      return;
    }
    setSession(createSession());
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
      ? session.cards.length ? <WordCardsSession words={session.cards}/>
        : <PlaySession key={session.id} {...session} haptics={haptics} canPlayAgain={selection.count > 0} onAgain={start}/>
      : <PlaySetup config={config} onChange={setConfig} words={words} courseId={activeCourseId} courseName={activeCourse.displayName}
        collections={collections} ready={ready} onStart={start} inTab={inTab}/>}
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
  const recorded = useRef(new Set<string>());
  const [saveFailed, setSaveFailed] = useState(false);
  // Capture this session's store. Pending writes must not switch accounts or data sources.
  const [saveEvent] = useState(() => recordWordPlayEvent);
  const [queue] = useState(() => new WordPlaySaveQueue(saveEvent, (retry) => {
    Alert.alert('Game progress not saved', 'Your answers are still waiting to save. Please retry.', [
      { text: 'Retry', onPress: () => { void retry().catch(() => undefined); } },
    ]);
  }));
  useEffect(() => queue.subscribe(setSaveFailed), [queue]);
  const allWords = rounds.flatMap((round) => round.words);
  const finished = index === rounds.length;
  const revisited = answered.size;
  const eligibleForRelearning = new Set(words.filter((word) => word.state === 'learned' && wordBelongsToCourse(word, courseId)).map((word) => word.id));
  const selectedCount = [...selected].filter((id) => eligibleForRelearning.has(id)).length;

  const record = async (word: Word, mode: WordPlayMode, type: WordPlayEventType) => {
    const key = `${word.id}:${type}`;
    if (recorded.current.has(key)) return;
    let event = events.current.get(key);
    if (!event) {
      event = { id: Crypto.randomUUID(), sessionId: id, courseId, wordId: word.id, mode,
        sessionMode: rounds.some((round) => round.mode === 'sentence') ? 'sentence' : rounds.some((round) => round.mode === 'matching') ? 'matching' : 'recall', type, occurredAt: new Date().toISOString() };
      events.current.set(key, event);
    }
    if (type === 'game_relearned') {
      await queue.flush();
      await saveEvent(event);
    } else queue.enqueue(event);
    recorded.current.add(key);
    if (type === 'game_answered') setAnswered((current) => new Set([...current, word.id]));
    if (type === 'game_missed') {
      setMissed((current) => new Set([...current, word.id]));
      if (words.some((item) => item.id === word.id && item.state === 'learned' && wordBelongsToCourse(item, courseId))) {
        setSelected((current) => new Set([...current, word.id]));
      }
    }
  };

  const relearn = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(null);
    try {
      for (const word of allWords.filter((item) => selected.has(item.id) && !returned.has(item.id) && words.some((current) => current.id === item.id && current.state === 'learned' && wordBelongsToCourse(current, courseId)))) {
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
    {saveFailed ? <View style={styles.filterGroup}>
      <AppText accessibilityRole="alert" style={{ color: theme.danger }}>Your answers are kept here, but progress could not be saved.</AppText>
      <PrimaryButton label="Retry saving" variant="secondary" onPress={() => { void queue.retry().catch(() => undefined); }}/>
    </View> : null}
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: allWords.length, now: revisited }}
      accessibilityLabel="Words revisited" style={[styles.track, { backgroundColor: theme.primarySoft }]}>
      <View style={[styles.fill, { backgroundColor: theme.primary, width: `${revisited / allWords.length * 100}%` }]}/>
    </View>
    <AppText variant="caption" style={{ color: theme.muted }}>{revisited} of {allWords.length} words revisited</AppText>
    {!finished ? <Round key={index} round={rounds[index]} nextWord={rounds[index + 1]?.mode === 'recall' ? rounds[index + 1].words[0] : undefined} onRecord={record} haptics={haptics} onContinue={() => setIndex((current) => current + 1)}/>
      : <ScrollView contentContainerStyle={styles.scrollContent}><Animated.View entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="ribbon-outline" size={52} color={theme.success}/>
        <AppText variant="heading">A little stronger</AppText>
        <AppText>{allWords.length} words revisited · {missed.size} needed another look</AppText>
        <AppText style={{ color: theme.muted }}>{missed.size ? 'Choose which words to return to regular practice. Your learning schedule only changes for the words you choose.' : 'You made it through! Come back for a different challenge.'}</AppText>
        <View style={styles.chips}>
          {allWords.filter((word) => missed.has(word.id)).map((word) => {
            const current = words.find((item) => item.id === word.id);
            const available = current?.state === 'learned' && wordBelongsToCourse(current, courseId);
            const added = returned.has(word.id);
            return <Pressable key={word.id} accessibilityRole="checkbox" accessibilityLabel={`Practise ${word.term} again`}
              accessibilityState={{ checked: available && selected.has(word.id), disabled: busy || added || !available }} disabled={busy || added || !available}
              onPress={() => setSelected((value) => { const next = new Set(value); if (next.has(word.id)) next.delete(word.id); else if (available) next.add(word.id); return next; })}
              style={[styles.chip, { backgroundColor: selected.has(word.id) ? theme.primarySoft : theme.surface, borderColor: theme.border }]}>
              <Ionicons name={added ? 'checkmark-circle' : selected.has(word.id) ? 'checkbox-outline' : 'square-outline'} size={20} color={theme.primary}/>
              <AppText>{word.term}{added ? ' · added' : !available ? current && wordBelongsToCourse(current, courseId) ? ' · already learning' : ' · unavailable' : ''}</AppText>
            </Pressable>;
          })}
        </View>
        {error ? <AppText accessibilityRole="alert" style={{ color: theme.danger }}>{error}</AppText> : null}
        {selectedCount > 0 ? <PrimaryButton label={`Add ${selectedCount} ${selectedCount === 1 ? 'word' : 'words'} to learning`} loading={busy} onPress={() => void relearn()}/> : null}
        {returned.size > 0 ? <>
          <AppText accessibilityLiveRegion="polite">{returned.size} {returned.size === 1 ? 'word is' : 'words are'} ready in today’s practice.</AppText>
          <PrimaryButton label="Practise now" disabled={busy} onPress={() => {
            void updateLearningFilter('all').then(() => router.replace('/(tabs)')).catch(() => setError('Could not open practice. Please try again.'));
          }}/>
        </> : null}
        <PrimaryButton label="Done" variant="secondary" disabled={busy} onPress={() => router.dismissTo('/(tabs)/play' as never)}/>
        {canPlayAgain
          ? <PrimaryButton label="Play another round" variant="secondary" disabled={busy} onPress={onAgain}/> : null}
      </Animated.View></ScrollView>}
  </>;
}

function Round({ round, nextWord, onRecord, onContinue, haptics }: {
  round: WordPlayRound; nextWord?: Word; onRecord(word: Word, mode: WordPlayMode, type: WordPlayEventType): Promise<void>;
  onContinue(): void; haptics: boolean;
}) {
  const theme = useAppTheme();
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<'known' | 'practice' | null>(null);
  const answered = useRef(new Set<string>());
  const continued = useRef(false);
  const recordRef = useRef(onRecord);
  useEffect(() => { recordRef.current = onRecord; }, [onRecord]);
  const completed = matched.size === round.words.length;

  useEffect(() => {
    for (const word of round.words) void recordRef.current(word, round.mode, 'game_seen');
  }, [round]);

  const answer = (word: Word, needsPractice: boolean) => {
    // Guard synchronously: two taps can arrive before React renders the matched tile.
    if (answered.current.has(word.id)) return;
    answered.current.add(word.id);
    if (needsPractice) void onRecord(word, round.mode, 'game_missed');
    void onRecord(word, round.mode, 'game_answered');
    setMatched(new Set(answered.current));
    setOutcome(needsPractice ? 'practice' : 'known');
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
  };
  if (round.mode === 'matching') return <MatchingRound round={round} haptics={haptics} onRecord={onRecord} onNext={onContinue}/>;
  if (round.mode === 'sentence') return <SentenceRound word={round.words[0]} gap={round.gap} haptics={haptics}
    onRecord={(type) => onRecord(round.words[0], 'sentence', type)} onNext={onContinue}/>;
  const recallWord = round.words[0];
  const translation = recallWord.translation?.trim();
  const reverseRecall = Boolean(translation && translation.toLocaleLowerCase() !== recallWord.term.trim().toLocaleLowerCase());

  return <View style={styles.round}>
    <ScrollView style={styles.roundContent} contentContainerStyle={styles.roundScroll}>
      <View style={styles.recallContent}>
        <AppText variant="heading">Bring it to mind</AppText>
        <AppText style={{ color: theme.muted }}>{reverseRecall ? 'Which word means this? Think of it before revealing.' : 'Can you remember what this word means?'}</AppText>
        <RecallFlashcard word={recallWord} revealed={revealed} onReveal={() => setRevealed(true)} outcome={outcome} nextWord={nextWord} onAdvance={() => { if (!continued.current) { continued.current = true; onContinue(); } }}/>
      </View>
    </ScrollView>
    <SafeAreaView edges={['bottom']} style={styles.footer}>
      <View testID="word-play-actions" style={styles.actions}>
        <View style={styles.actionSlot}>
          {revealed ? <RecallAction label="Keep learning" icon="calendar-outline" color={theme.primary} disabled={completed} onPress={() => answer(recallWord, true)}/> : null}
        </View>
        <View style={styles.actionSlot}>
          {revealed ? <RecallAction label="I know this" icon="checkmark-circle-outline" color={theme.success} disabled={completed} onPress={() => answer(recallWord, false)}/>
            : <PrimaryButton label="Reveal answer" onPress={() => setRevealed(true)}/>}
        </View>
      </View>
    </SafeAreaView>
  </View>;
}

function RecallAction({ label, icon, color, disabled, onPress }: {
  label: string; icon: 'calendar-outline' | 'checkmark-circle-outline'; color: string; disabled: boolean; onPress(): void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={({ pressed }) => [styles.recallAction, { borderColor: `${color}52`, backgroundColor: `${color}0D`, opacity: disabled ? 0.55 : pressed ? 0.82 : 1 }]}>
    <Ionicons name={icon} size={22} color={color} aria-hidden/>
    <AppText variant="label" style={{ color }}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm }, title: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxxl, gap: spacing.lg },
  filterGroup: { gap: spacing.sm },
  round: { flex: 1, minHeight: 0 }, roundContent: { flex: 1 }, roundScroll: { paddingBottom: spacing.lg },
  footer: { paddingVertical: spacing.sm }, actionSlot: { minHeight: 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 60 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: radii.sheet, padding: spacing.lg, gap: spacing.lg },
  track: { height: 8, borderRadius: radii.pill, overflow: 'hidden' }, fill: { height: '100%' },
  recallAction: { minHeight: 50, borderWidth: 1, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: spacing.sm, gap: spacing.sm },
  recallContent: { gap: spacing.lg }, actions: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: spacing.sm, borderWidth: 1, borderRadius: radii.control, padding: spacing.md, minHeight: 48 },
});
