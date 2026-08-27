import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SwipeableWordCard } from '@/components/swipeable-word-card';
import { WordCard } from '@/components/word-card';
import { wordBelongsToCourse } from '@/domain/courses';
import { languageLabel } from '@/domain/languages';
import type { LearningFilter, LearningPreferences, LearningRating, Word } from '@/domain/types';
import { buildContinuedLearningFeed, buildLearningFeed, buildNotificationLearningSession, filterWordsByLearningCategory, getAvailableLearningFilters } from '@/features/learning/algorithm';
import { createSerialMutationQueue } from '@/features/learning/mutation-queue';
import { WordCapacityExceededError } from '@/features/purchases/capacity';
import { buildRecommendations, topicOptions, type Recommendation } from '@/features/recommendations/selector';
import { isOnDeviceTranslationPairSupported } from '@/features/translation/translator';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

const filterOptions: { id: LearningFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'personal', label: 'Personal' },
  { id: 'A1', label: 'A1' },
  { id: 'A2', label: 'A2' },
  { id: 'B1', label: 'B1' },
  { id: 'B2', label: 'B2' },
  { id: 'C1', label: 'C1' },
  { id: 'C2', label: 'C2' },
];

export default function LearnScreen() {
  const { words, activeCourseId, learningFilter, updateLearningFilter } = useAppData();
  const activeWords = useMemo(() => words.filter((word) => wordBelongsToCourse(word, activeCourseId)), [activeCourseId, words]);
  const { notificationWordId: notificationWordIdParam } = useLocalSearchParams<{
    notificationWordId?: string | string[];
  }>();
  const requestedNotificationWordId = Array.isArray(notificationWordIdParam)
    ? notificationWordIdParam[0]
    : notificationWordIdParam;
  const notificationWordId = requestedNotificationWordId
    && words.some((word) => word.id === requestedNotificationWordId)
    ? requestedNotificationWordId
    : null;
  const availableFilters = useMemo(() => getAvailableLearningFilters(activeWords), [activeWords]);
  const activeFilter = availableFilters.includes(learningFilter) ? learningFilter : 'all';
  const sessionFilter = notificationWordId ? 'all' : activeFilter;
  const sessionKey = `${activeCourseId}:${sessionFilter}:${notificationWordId ?? 'regular'}:${activeWords.map((word) => word.id).sort().join(':')}`;

  const selectFilter = useCallback(async (filter: LearningFilter) => {
    if (requestedNotificationWordId) router.setParams({ notificationWordId: '' });
    await updateLearningFilter(filter);
  }, [requestedNotificationWordId, updateLearningFilter]);

  useEffect(() => {
    if (activeFilter === learningFilter) return;
    void updateLearningFilter(activeFilter);
  }, [activeFilter, learningFilter, updateLearningFilter]);

  return <LearningSession
    key={sessionKey}
    filter={sessionFilter}
    availableFilters={availableFilters}
    notificationWordId={notificationWordId}
    onSelectFilter={selectFilter}
  />;
}

function LearningSession({ filter, availableFilters, notificationWordId, onSelectFilter }: {
  filter: LearningFilter;
  availableFilters: LearningFilter[];
  notificationWordId: string | null;
  onSelectFilter(filter: LearningFilter): Promise<void>;
}) {
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  const {
    words,
    collections,
    activeCourse,
    activeCourseId,
    learningPreferences,
    wordCapacity,
    addRecommendedWords,
    rateWord,
    markViewed,
    prepareWordTranslation,
  } = useAppData();
  const activeWords = useMemo(() => words.filter((word) => wordBelongsToCourse(word, activeCourseId)), [activeCourseId, words]);
  const [initialSession] = useState(() => {
    if (!notificationWordId) return { feed: buildLearningFeed(activeWords, new Date(), filter), reviewWord: null };
    const notificationWord = words.find((word) => word.id === notificationWordId) ?? null;
    if (notificationWord && !wordBelongsToCourse(notificationWord, activeCourseId)) {
      return { feed: buildLearningFeed(activeWords, new Date(), 'all'), reviewWord: notificationWord };
    }
    return buildNotificationLearningSession(activeWords, notificationWordId, new Date());
  });
  const [sessionFeed, setSessionFeed] = useState<Word[]>(initialSession.feed);
  const [notificationReviewWord, setNotificationReviewWord] = useState<Word | null>(initialSession.reviewWord);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [listHeight, setListHeight] = useState(0);
  const [translationStates, setTranslationStates] = useState<Record<string, 'loading' | 'error'>>({});
  const [recommendationsBusy, setRecommendationsBusy] = useState(false);
  const listRef = useRef<FlatList<Word>>(null);
  const viewedIds = useRef(new Set<string>());
  const submittedRatings = useRef(new Map<string, LearningRating>());
  const sessionFeedLengthRef = useRef(sessionFeed.length);
  const sessionCompleteRef = useRef(false);
  const [mutationQueue] = useState(createSerialMutationQueue);
  const translatingIds = useRef(new Set<string>());
  const cardHeight = listHeight || Math.max(390, height - 241);
  const denseCards = cardHeight < 500;
  const categoryWords = useMemo(() => filterWordsByLearningCategory(activeWords, filter), [activeWords, filter]);
  const currentWords = useMemo(() => Object.fromEntries(words.map((word) => [word.id, word])), [words]);
  const currentNotificationReviewWord = notificationReviewWord
    ? currentWords[notificationReviewWord.id] ?? notificationReviewWord
    : null;
  const activeWord = currentNotificationReviewWord
    ?? currentWords[sessionFeed[currentIndex]?.id]
    ?? sessionFeed[currentIndex];
  const continuedSessionFeed = useMemo(() => buildContinuedLearningFeed(
    activeWords,
    sessionFeed.map((word) => word.id),
    new Date(),
    filter,
  ), [activeWords, filter, sessionFeed]);
  const recommendationPreview = useMemo(() => activeCourse.capabilities.recommendations ? buildRecommendations(
    learningPreferences,
    activeWords.map((word) => word.normalizedTerm),
    10,
  ) : [], [activeCourse.capabilities.recommendations, activeWords, learningPreferences]);
  const hasRecommendationPreferences = learningPreferences.levels.length > 0
    && learningPreferences.topics.length > 0;
  const recommendationAddCount = wordCapacity.remaining === null
    ? recommendationPreview.length
    : Math.min(recommendationPreview.length, wordCapacity.remaining);
  const canAddRecommendations = hasRecommendationPreferences
    && recommendationPreview.length > 0
    && recommendationAddCount > 0;

  const retryTranslation = useCallback((word: Word) => {
    setTranslationStates((current) => ({ ...current, [word.id]: 'loading' }));
  }, []);

  useEffect(() => {
    if (!activeWord || activeWord.translation
      || !isOnDeviceTranslationPairSupported(activeWord.sourceLanguageCode, activeWord.targetLanguageCode)
      || translatingIds.current.has(activeWord.id)
      || translationStates[activeWord.id] === 'error') return;
    translatingIds.current.add(activeWord.id);
    const translationRequest = prepareWordTranslation(activeWord);
    void translationRequest.then(() => {
      translatingIds.current.delete(activeWord.id);
      setTranslationStates((current) => {
        const next = { ...current };
        delete next[activeWord.id];
        return next;
      });
    }, () => {
      translatingIds.current.delete(activeWord.id);
      setTranslationStates((current) => ({ ...current, [activeWord.id]: 'error' }));
    });
  }, [activeWord, prepareWordTranslation, translationStates]);

  useEffect(() => {
    if (currentNotificationReviewWord) return;
    const word = sessionFeed[currentIndex];
    if (!word || viewedIds.current.has(word.id)) return;
    const timer = setTimeout(() => {
      viewedIds.current.add(word.id);
      void mutationQueue.run(() => markViewed(word.id)).catch(() => {
        viewedIds.current.delete(word.id);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentIndex, currentNotificationReviewWord, markViewed, mutationQueue, sessionFeed]);

  const collectionNames = useMemo(() => Object.fromEntries(collections.map((item) => [item.id, item.name])), [collections]);

  const updateSessionComplete = (complete: boolean) => {
    sessionCompleteRef.current = complete;
    setSessionComplete(complete);
  };

  const handleRating = (word: Word, rating: LearningRating) => {
    if (submittedRatings.current.has(word.id)) return;
    submittedRatings.current.set(word.id, rating);
    const nextIndex = currentIndex + 1;
    if (nextIndex < sessionFeed.length) {
      setCurrentIndex(nextIndex);
      requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: nextIndex, animated: true }));
    } else {
      updateSessionComplete(true);
    }

    // Keep successful words submitted for this session so an outgoing card cannot be rated twice.
    void mutationQueue.run(() => rateWord(word, rating)).catch(() => {
      submittedRatings.current.delete(word.id);
      const retryIndex = sessionFeedLengthRef.current;
      sessionFeedLengthRef.current += 1;
      setSessionFeed((current) => [...current, word]);
      if (sessionCompleteRef.current) {
        updateSessionComplete(false);
        setCurrentIndex(retryIndex);
        requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: retryIndex, animated: true }));
      }
      Alert.alert('Progress was not saved', `${word.term} was returned to this session. Please try again.`);
    });
  };

  const continueLearning = () => {
    if (continuedSessionFeed.length === 0) return;
    viewedIds.current.clear();
    submittedRatings.current.clear();
    sessionFeedLengthRef.current = continuedSessionFeed.length;
    setSessionFeed(continuedSessionFeed);
    setCurrentIndex(0);
    updateSessionComplete(false);
  };

  const addRecommendationsAndContinue = async () => {
    if (!canAddRecommendations || recommendationsBusy) return;
    setRecommendationsBusy(true);
    try {
      const count = await addRecommendedWords(recommendationAddCount);
      if (count === 0) {
        Alert.alert('Recommendations unavailable', 'There are no unused recommendations for these preferences right now.');
        return;
      }
      if (filter !== 'all') await onSelectFilter('all');
    } catch (error) {
      const message = error instanceof WordCapacityExceededError
        ? error.message
        : error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Recommendations unavailable', message);
    } finally {
      setRecommendationsBusy(false);
    }
  };

  if (currentNotificationReviewWord) {
    const canContinue = sessionFeed.length > 0;
    const translationStatus = !currentNotificationReviewWord.translation
      && isOnDeviceTranslationPairSupported(
        currentNotificationReviewWord.sourceLanguageCode,
        currentNotificationReviewWord.targetLanguageCode,
      )
      ? translationStates[currentNotificationReviewWord.id] ?? 'loading'
      : undefined;
    return (
      <Screen style={styles.screen}>
        <Header filter={filter} availableFilters={availableFilters} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)} onSelectFilter={onSelectFilter}/>
        <View style={styles.notificationReviewIntro}>
          <AppText variant="heading">{canContinue ? 'Already reviewed' : 'You are caught up'}</AppText>
          <AppText style={[styles.notificationReviewMessage, { color: theme.muted }]}>
            {canContinue
              ? 'You already reviewed this reminder word. Looking at it again will not change your progress.'
              : 'Today’s session is complete. You can review this reminder word without changing your progress.'}
          </AppText>
        </View>
        <View style={styles.notificationReviewCard}>
          <WordCard
            word={currentNotificationReviewWord}
            collectionName={collectionNames[currentNotificationReviewWord.collectionId]}
            dense={denseCards}
            showPronunciation
            translationStatus={translationStatus}
            onRetryTranslation={() => retryTranslation(currentNotificationReviewWord)}
          />
        </View>
        {canContinue
          ? <PrimaryButton label="Continue today’s words" onPress={() => setNotificationReviewWord(null)}/>
          : null}
      </Screen>
    );
  }

  if (sessionComplete) {
    const canContinue = continuedSessionFeed.length > 0;
    return <Screen><Header filter={filter} availableFilters={availableFilters} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)} onSelectFilter={onSelectFilter}/><Animated.View exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)} style={styles.emptyTransition}>{canContinue ? <EmptyState title="Session complete" message={`You worked through every ${categoryWordLabel(filter, true)} due in this session.`} actionLabel="Continue learning" onAction={continueLearning}/> : <LearningEmptyState title="Session complete" message={`You worked through every ${categoryWordLabel(filter, true)} due in this session.`} recommendations={canAddRecommendations ? recommendationPreview.slice(0, recommendationAddCount) : []} learningPreferences={learningPreferences} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)} busy={recommendationsBusy} onAdd={() => void addRecommendationsAndContinue()}/>}</Animated.View></Screen>;
  }

  if (sessionFeed.length === 0) {
    const hasCategoryWords = categoryWords.length > 0;
    return <Screen><Header filter={filter} availableFilters={availableFilters} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)} onSelectFilter={onSelectFilter}/><LearningEmptyState title={hasCategoryWords ? 'You are caught up' : `No ${categoryWordLabel(filter)} yet`} message={hasCategoryWords ? `No ${categoryWordLabel(filter)} are due right now.` : `Add ${languageLabel(activeCourse.sourceLanguageCode).toLowerCase()} words from the library or choose another category.`} recommendations={canAddRecommendations ? recommendationPreview.slice(0, recommendationAddCount) : []} learningPreferences={learningPreferences} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)} busy={recommendationsBusy} onAdd={() => void addRecommendationsAndContinue()}/></Screen>;
  }

  return (
    <Screen style={styles.screen}>
      <Header filter={filter} availableFilters={availableFilters} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)} onSelectFilter={onSelectFilter}/>
      <FlatList
        ref={listRef}
        data={sessionFeed}
        extraData={currentWords}
        onLayout={(event) => setListHeight(Math.round(event.nativeEvent.layout.height))}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        showsVerticalScrollIndicator={false}
        snapToInterval={cardHeight + spacing.md}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: cardHeight + spacing.md, offset: (cardHeight + spacing.md) * index, index })}
        onMomentumScrollEnd={(event) => setCurrentIndex(Math.round(event.nativeEvent.contentOffset.y / (cardHeight + spacing.md)))}
        renderItem={({ item, index }) => {
          const currentWord = currentWords[item.id] ?? item;
          const sessionRating = submittedRatings.current.get(currentWord.id);
          const translationStatus = currentWord.id === activeWord?.id && !currentWord.translation
            && isOnDeviceTranslationPairSupported(currentWord.sourceLanguageCode, currentWord.targetLanguageCode)
            ? translationStates[currentWord.id] ?? 'loading'
            : undefined;
          return <View style={{ height: cardHeight, marginBottom: spacing.md }}><SwipeableWordCard word={currentWord} active={index === currentIndex} disabled={sessionRating !== undefined} onSwipe={(rating) => handleRating(currentWord, rating)}><WordCard word={currentWord} collectionName={collectionNames[currentWord.collectionId]} dense={denseCards} sessionRating={sessionRating} showPronunciation={index === currentIndex} translationStatus={translationStatus} onRetryTranslation={() => retryTranslation(currentWord)} onRate={sessionRating === undefined ? (rating) => handleRating(currentWord, rating) : undefined}/></SwipeableWordCard></View>;
        }}
      />
      <AppText variant="caption" style={[styles.position, { color: theme.muted }]}>{Math.min(currentIndex + 1, sessionFeed.length)} of {sessionFeed.length} due now · scroll to skip</AppText>
    </Screen>
  );
}

function LearningEmptyState({ title, message, recommendations, learningPreferences, learnedLanguage, busy, onAdd }: {
  title: string;
  message: string;
  recommendations: Recommendation[];
  learningPreferences: LearningPreferences;
  learnedLanguage: string;
  busy: boolean;
  onAdd(): void;
}) {
  const theme = useAppTheme();
  if (recommendations.length === 0) {
    return <EmptyState title={title} message={message} actionLabel="Browse library" actionVariant="secondary" compactAction onAction={() => router.push('/(tabs)/library')}/>;
  }
  const topics = topicOptions
    .filter((topic) => learningPreferences.topics.includes(topic.id))
    .map((topic) => topic.title)
    .join(' · ');
  const statusTitle = title === 'You are caught up' ? 'You’re caught up' : title;
  const wordLabel = recommendations.length === 1 ? 'word' : 'words';
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.learningEmptyContent}>
    <Animated.View
      entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
      testID="today-recommendations"
      style={[styles.nextBatchCardShadow, { shadowColor: theme.shadow }]}
    >
      <View style={[styles.nextBatchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.completionStatus, { backgroundColor: `${theme.success}12`, borderBottomColor: `${theme.success}2E` }]}>
          <View aria-hidden style={[styles.completionIcon, { backgroundColor: theme.surface }]}>
            <Ionicons name="checkmark" color={theme.success} size={20}/>
          </View>
          <View style={styles.recommendationText}>
            <AppText variant="label">{statusTitle}</AppText>
            <AppText variant="caption" style={{ color: theme.muted }}>{message}</AppText>
          </View>
        </View>
        <View style={styles.nextBatchBody}>
          <AppText variant="heading">Start a fresh batch</AppText>
          <View style={styles.recommendationHeading}>
            <View aria-hidden style={[styles.recommendationIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="sparkles-outline" color={theme.primary} size={20}/></View>
            <View style={styles.recommendationText}>
              <AppText variant="label">{learningPreferences.levels.join(', ')} {learnedLanguage}</AppText>
              <AppText variant="caption" style={{ color: theme.muted }}>{topics} · {recommendations.length} {wordLabel}</AppText>
            </View>
          </View>
          <View style={styles.recommendationWords}>{recommendations.slice(0, 3).map(({ entry }) => <View key={entry.id} style={[styles.recommendationWord, { backgroundColor: theme.primarySoft }]}><AppText variant="label">{entry.term}</AppText><AppText variant="caption">{entry.level}</AppText></View>)}</View>
          <PrimaryButton testID="add-today-recommendations" label={`Add ${recommendations.length} ${wordLabel} & start learning`} loading={busy} onPress={onAdd} icon={<Ionicons name="add" color="#FFFFFF" size={18}/>}/>
        </View>
      </View>
    </Animated.View>
  </ScrollView>;
}

function Header({ filter, availableFilters, learnedLanguage, onSelectFilter }: { filter: LearningFilter; availableFilters: LearningFilter[]; learnedLanguage: string; onSelectFilter(filter: LearningFilter): Promise<void> }) {
  const theme = useAppTheme();
  return <View style={styles.headerBlock}>
    <View style={styles.header}><View><AppText variant="title">Today’s {learnedLanguage.toLowerCase()}</AppText><AppText variant="caption" style={{ color: theme.muted }}>Showing {filter === 'all' ? `all ${learnedLanguage.toLowerCase()} words` : categoryWordLabel(filter)}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.settings, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}><Ionicons name="options-outline" color={theme.primary} size={22}/></Pressable></View>
    <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {filterOptions.filter((option) => availableFilters.includes(option.id)).map((option) => <Pressable key={option.id} accessibilityRole="tab" accessibilityLabel={`Show ${option.label} words`} accessibilityState={{ selected: filter === option.id }} aria-selected={filter === option.id} onPress={() => void onSelectFilter(option.id)} style={[styles.filter, { backgroundColor: filter === option.id ? theme.primary : theme.surface, borderColor: filter === option.id ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: filter === option.id ? '#FFFFFF' : theme.text }}>{option.label}</AppText></Pressable>)}
    </ScrollView>
  </View>;
}

function categoryWordLabel(filter: LearningFilter, singular = false) {
  const word = singular ? 'word' : 'words';
  if (filter === 'all') return word;
  if (filter === 'personal') return `personal ${word}`;
  return `${filter} ${word}`;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.lg }, headerBlock: { gap: spacing.sm, paddingBottom: spacing.sm }, header: { minHeight: 76, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyTransition: { flex: 1 },
  notificationReviewIntro: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  notificationReviewMessage: { textAlign: 'center' },
  notificationReviewCard: { flex: 1, paddingVertical: spacing.sm },
  learningEmptyContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  nextBatchCardShadow: { width: '100%', maxWidth: 560, alignSelf: 'center', borderRadius: radii.sheet, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 22, elevation: 4 },
  nextBatchCard: { overflow: 'hidden', borderWidth: 1, borderRadius: radii.sheet },
  completionStatus: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1 },
  completionIcon: { width: 40, height: 40, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  nextBatchBody: { padding: spacing.xl, gap: spacing.lg },
  recommendationHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recommendationIcon: { width: 40, height: 40, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  recommendationText: { flex: 1, gap: 2 },
  recommendationWords: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recommendationWord: { minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  settings: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1 }, filters: { gap: spacing.sm },
  filter: { minWidth: 44, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, position: { textAlign: 'center', paddingVertical: spacing.xs },
});
