import { rememberFeedbackOrigin } from '@/features/feedback/context';
import { FeedbackLink } from '@/features/feedback/feedback-link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { FlippingSubtitle, SlidingFilterTabs } from '@/components/today-filter-motion';
import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { RecommendationFallbackNote } from '@/components/recommendation-fallback-note';
import { Screen } from '@/components/screen';
import { WordCardStack } from '@/components/word-card-stack';
import { WordCard } from '@/components/word-card';
import { wordBelongsToCourse } from '@/domain/courses';
import { languageLabel } from '@/domain/languages';
import type { Collection, LearningFilter, LearningPreferences, LearningRating, Word } from '@/domain/types';
import { buildContinuedLearningFeed, buildLearningFeed, buildNotificationLearningSession, filterWordsByLearningCategory, getAvailableLearningFilters } from '@/features/learning/algorithm';
import { createSerialMutationQueue } from '@/features/learning/mutation-queue';
import { WordCapacityExceededError } from '@/features/purchases/capacity';
import { buildRecommendations, normalizeLearningPreferences, topicOptions, type Recommendation } from '@/features/recommendations/selector';
import { isOnDeviceTranslationPairSupported } from '@/features/translation/translator';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function LearnScreen() {
  const { words, collections, activeCourse, activeCourseId, learningFilter, updateLearningFilter } = useAppData();
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
  const availableFilters = useMemo(() => getAvailableLearningFilters(activeWords, collections), [activeWords, collections]);
  const activeFilter = availableFilters.includes(learningFilter) ? learningFilter : 'all';
  const sessionFilter = notificationWordId ? 'all' : activeFilter;
  const collectionMembership = sessionFilter.startsWith('collection:')
    ? filterWordsByLearningCategory(activeWords, sessionFilter).map((word) => word.id).sort().join(':')
    : '';
  const sessionKey = `${activeCourseId}:${sessionFilter}:${notificationWordId ?? 'regular'}:${collectionMembership}:${activeWords.map((word) => word.id).sort().join(':')}`;

  const selectFilter = useCallback(async (filter: LearningFilter) => {
    if (requestedNotificationWordId) router.setParams({ notificationWordId: '' });
    await updateLearningFilter(filter);
  }, [requestedNotificationWordId, updateLearningFilter]);

  useEffect(() => {
    if (activeFilter === learningFilter) return;
    void updateLearningFilter(activeFilter);
  }, [activeFilter, learningFilter, updateLearningFilter]);

  return <Screen style={styles.screen}>
    <Header filter={sessionFilter} availableFilters={availableFilters} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)} onSelectFilter={selectFilter}/>
    <LearningSession
      key={sessionKey}
      filter={sessionFilter}
      notificationWordId={notificationWordId}
      onSelectFilter={selectFilter}
    />
  </Screen>;
}

function LearningSession({ filter, notificationWordId, onSelectFilter }: {
  filter: LearningFilter;
  notificationWordId: string | null;
  onSelectFilter(filter: LearningFilter): Promise<void>;
}) {
  const theme = useAppTheme();
  const { learningConfirmations } = useAppData();
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
  const [sessionWordIds, setSessionWordIds] = useState(() => new Set(initialSession.feed.map((word) => word.id)));
  const [notificationReviewWord, setNotificationReviewWord] = useState<Word | null>(initialSession.reviewWord);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const atBatchEnd = currentIndex === sessionFeed.length;
  const [stackHeight, setStackHeight] = useState(0);
  const [translationStates, setTranslationStates] = useState<Record<string, 'loading' | 'error'>>({});
  const [recommendationsBusy, setRecommendationsBusy] = useState(false);
  const viewedIds = useRef(new Set<string>());
  const [pendingRatings, setPendingRatings] = useState<Set<string>>(() => new Set());
  const submittedRatings = useRef(new Map<string, LearningRating>());
  const sessionFeedLengthRef = useRef(sessionFeed.length);
  const previousWords = useRef(activeWords);
  useEffect(() => {
    const previousStates = new Map(previousWords.current.map((word) => [word.id, word.state]));
    previousWords.current = activeWords;
    const resumed = filterWordsByLearningCategory(activeWords, filter).filter((word) =>
      previousStates.get(word.id) === 'learned' && word.state === 'cannot_remember'
      && word.nextReviewAt !== null && new Date(word.nextReviewAt) <= new Date());
    if (resumed.length === 0) return;
    const resumedIds = new Set(resumed.map((word) => word.id));
    // Keep the current card, removing old occurrences before adding a fresh attempt.
    const removedBeforeCurrent = sessionFeed.slice(0, currentIndexRef.current)
      .filter((word) => resumedIds.has(word.id)).length;
    const nextFeed = [...sessionFeed.filter((word) => !resumedIds.has(word.id)), ...resumed];
    for (const id of resumedIds) {
      submittedRatings.current.delete(id);
      viewedIds.current.delete(id);
    }
    sessionFeedLengthRef.current = nextFeed.length;
    currentIndexRef.current -= removedBeforeCurrent;
    // A library action can reactivate words while this mounted session is open.
    setSessionFeed(nextFeed);
    setCurrentIndex(currentIndexRef.current);
    setSessionWordIds((current) => new Set([...current, ...resumedIds]));
  }, [activeWords, filter, sessionFeed]);
  const [mutationQueue] = useState(createSerialMutationQueue);
  const translatingIds = useRef(new Set<string>());
  const viewportHeight = stackHeight || Math.max(390, height - 241);
  // Leave room inside the viewport for the card's downward shadow.
  const cardHeight = viewportHeight - spacing.md;
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
    sessionWordIds,
    new Date(),
    filter,
  ), [activeWords, filter, sessionWordIds]);
  // Refreshes and rating/view saves replace objects without changing eligibility.
  // Keep the random preview (and its wrapped height) stable for equivalent inputs.
  const recommendationInputs = JSON.stringify({
    preferences: normalizeLearningPreferences(learningPreferences),
    terms: [...new Set(activeWords.map((word) => word.normalizedTerm))].sort(),
  });
  const recommendationPreview = useMemo(() => {
    if (!activeCourse.capabilities.recommendations) return [];
    const { preferences, terms } = JSON.parse(recommendationInputs) as {
      preferences: LearningPreferences;
      terms: string[];
    };
    return buildRecommendations(preferences, terms, 10, activeCourseId);
  }, [activeCourseId, activeCourse.capabilities.recommendations, recommendationInputs]);
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

  const navigateTo = (fromIndex: number, toIndex: number) => {
    if (fromIndex !== currentIndexRef.current) return;
    const nextIndex = Math.max(0, Math.min(sessionFeedLengthRef.current, toIndex));
    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);
  };

  const handleRating = (word: Word, rating: LearningRating) => {
    if (sessionFeed[currentIndexRef.current]?.id !== word.id || submittedRatings.current.has(word.id)) return;
    submittedRatings.current.set(word.id, rating);
    setPendingRatings((current) => new Set(current).add(word.id));
    navigateTo(currentIndexRef.current, currentIndexRef.current + 1);

    // Keep successful words submitted for this session so an outgoing card cannot be rated twice.
    void mutationQueue.run(() => rateWord(word, rating)).catch(() => {
      submittedRatings.current.delete(word.id);
      sessionFeedLengthRef.current += 1;
      setSessionFeed((current) => [...current, word]);
      // At the end card, the appended retry occupies the same index automatically.
      Alert.alert('Progress was not saved', `${word.term} was returned to this session. Please try again.`);
    }).finally(() => setPendingRatings((current) => { const next = new Set(current); next.delete(word.id); return next; }));
  };

  const continueLearning = () => {
    if (continuedSessionFeed.length === 0) return;
    viewedIds.current.clear();
    submittedRatings.current.clear();
    setSessionWordIds((current) => new Set([
      ...current,
      ...continuedSessionFeed.map((word) => word.id),
    ]));
    sessionFeedLengthRef.current = continuedSessionFeed.length;
    setSessionFeed(continuedSessionFeed);
    currentIndexRef.current = 0;
    setCurrentIndex(0);
  };

  const addRecommendationsAndContinue = async () => {
    if (!canAddRecommendations || recommendationsBusy) return;
    setRecommendationsBusy(true);
    try {
      const count = await addRecommendedWords(recommendationAddCount, recommendationPreview.slice(0, recommendationAddCount));
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
      <>
        <View style={styles.notificationReviewIntro}>
          <AppText variant="heading">{canContinue ? 'Already reviewed' : 'You are caught up'}</AppText>
          <AppText style={[styles.notificationReviewMessage, { color: theme.muted }]}>
            {canContinue
              ? 'You already reviewed this reminder word. Looking at it again will not change your progress.'
              : 'Today’s session is complete. You can review this reminder word without changing your progress.'}
          </AppText>
        </View>
        <View style={styles.notificationReviewCard}>
          <WordCard confirmations={learningConfirmations}
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
      </>
    );
  }

  if (sessionFeed.length === 0) {
    const hasCategoryWords = categoryWords.length > 0;
    return <View style={styles.emptySession}><LearningEmptyState title={hasCategoryWords ? 'You are caught up' : `No ${categoryWordLabel(filter, collections)} yet`} message={hasCategoryWords ? `No ${categoryWordLabel(filter, collections)} are due right now.` : `Add ${languageLabel(activeCourse.sourceLanguageCode).toLowerCase()} words from the library or choose another category.`} recommendations={canAddRecommendations ? recommendationPreview.slice(0, recommendationAddCount) : []} learningPreferences={learningPreferences} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)} showManualCourseSetup={activeWords.length === 0 && !activeCourse.capabilities.recommendations} busy={recommendationsBusy} onAdd={() => void addRecommendationsAndContinue()}/></View>;
  }

  return (
    <>
      <View testID="today-words-stack" style={styles.wordStack}
        onLayout={(event) => setStackHeight(Math.round(event.nativeEvent.layout.height))}>
        <View style={styles.stackContent}>
          <WordCardStack
            words={sessionFeed.map((item) => currentWords[item.id] ?? item)}
            index={currentIndex}
            isRated={(word) => submittedRatings.current.has(word.id)}
            onRate={handleRating}
            onNavigate={navigateTo}
            renderWord={(item, active, rate) => {
              const word = currentWords[item.id] ?? item;
              const sessionRating = submittedRatings.current.get(word.id);
              const translationStatus = !word.translation
                && isOnDeviceTranslationPairSupported(word.sourceLanguageCode, word.targetLanguageCode)
                ? translationStates[word.id] ?? 'loading'
                : undefined;
              return <WordCard confirmations={learningConfirmations} onReport={() => { router.push({ pathname: '/feedback', params: { origin: rememberFeedbackOrigin('today', word) } } as never); }} animateEntrance={false} word={word}
                collectionName={collectionNames[word.collectionId]} dense={denseCards}
                sessionRating={sessionRating} sessionSaving={pendingRatings.has(word.id)} showPronunciation pronunciationActive={active}
                translationStatus={translationStatus} onRetryTranslation={() => retryTranslation(word)}
                onRate={sessionRating === undefined ? rate : undefined}/>;
            }}
            renderEnd={() => <View style={[styles.batchEnd,
              !canAddRecommendations && (continuedSessionFeed.length > 0 || hasRecommendationPreferences)
                && [styles.batchEndSurface, { backgroundColor: theme.surface }],
            ]}>
              {!canAddRecommendations && continuedSessionFeed.length > 0
                ? <EmptyState title="End of batch"
                  message="You reached the end of this batch. Skipped words remain unrated."
                  actionLabel="Continue learning" onAction={continueLearning}/>
                : wordCapacity.remaining === 0 && hasRecommendationPreferences && recommendationPreview.length > 0
                  ? <EmptyState title="Free library full"
                    message={`Your free library includes ${wordCapacity.limit} words. Unlock unlimited words to add your next batch.`}
                    actionLabel="Unlock unlimited words" onAction={() => router.push('/upgrade' as never)}/>
                : <LearningEmptyState title={canAddRecommendations ? "Ready for more?" : "End of batch"}
                  message="Add your next words and keep learning."
                  animateEntrance={false}
                  recommendations={canAddRecommendations ? recommendationPreview.slice(0, recommendationAddCount) : []}
                  learningPreferences={learningPreferences} learnedLanguage={languageLabel(activeCourse.sourceLanguageCode)}
                  showManualCourseSetup={false} busy={recommendationsBusy}
                  onAdd={() => void addRecommendationsAndContinue()}/>}
            </View>}
          />
        </View>
      </View>
      <View style={styles.navigation}>
        <Pressable accessibilityRole="button" accessibilityLabel={atBatchEnd ? 'Back to last word' : 'Previous word'}
          disabled={currentIndex === 0} accessibilityState={{ disabled: currentIndex === 0 }}
          onPress={() => navigateTo(currentIndex, currentIndex - 1)}
          style={[styles.navigationButton, { opacity: currentIndex === 0 ? 0.35 : 1 }]}>
          <Ionicons name="arrow-down" size={18} color={theme.primary}/><AppText variant="caption">Back</AppText>
        </Pressable>
        <AppText variant="caption" style={[styles.position, { color: theme.muted }]}>
          {atBatchEnd ? 'End of batch · swipe down to go back' : `${currentIndex + 1} of ${sessionFeed.length} · Skip to move on`}
        </AppText>
        {!atBatchEnd ? <Pressable accessibilityRole="button" accessibilityLabel="Skip word"
          onPress={() => navigateTo(currentIndex, currentIndex + 1)} style={styles.navigationButton}>
          <AppText variant="caption">Skip</AppText><Ionicons name="arrow-up" size={18} color={theme.primary}/>
        </Pressable> : null}
      </View>
    </>
  );
}

function LearningEmptyState({ title, message, recommendations, learningPreferences, learnedLanguage, showManualCourseSetup, busy, onAdd, animateEntrance = true }: {
  title: string;
  message: string;
  recommendations: Recommendation[];
  learningPreferences: LearningPreferences;
  learnedLanguage: string;
  showManualCourseSetup: boolean;
  busy: boolean;
  onAdd(): void;
  animateEntrance?: boolean;
}) {
  const theme = useAppTheme();
  if (recommendations.length === 0 && showManualCourseSetup) {
    return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.learningEmptyContent}>
      <Animated.View
        entering={animateEntrance ? FadeInDown.duration(220).reduceMotion(ReduceMotion.System) : undefined}
        testID="today-course-empty"
        style={[styles.nextBatchCardShadow, { shadowColor: theme.shadow }]}
      >
        <View style={[styles.nextBatchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.completionStatus, { backgroundColor: `${theme.primary}0D`, borderBottomColor: `${theme.primary}2E` }]}>
            <View aria-hidden style={[styles.completionIcon, { backgroundColor: theme.surface }]}>
              <Ionicons name="language-outline" color={theme.primary} size={20}/>
            </View>
            <View style={styles.recommendationText}>
              <AppText variant="label">No {learnedLanguage} words yet</AppText>
              <AppText variant="caption" style={{ color: theme.muted }}>Each language keeps its own library and progress.</AppText>
            </View>
          </View>
          <View style={styles.nextBatchBody}>
            <AppText variant="heading">Start your {learnedLanguage} library</AppText>
            <View style={styles.courseEmptyActions}>
              <PrimaryButton label={`Add a ${learnedLanguage} word`} onPress={() => router.push('/word/new')} icon={<Ionicons name="add" color="#FFFFFF" size={18}/>}/>
              <PrimaryButton label="Bulk paste" variant="secondary" onPress={() => router.push('/import')} icon={<Ionicons name="clipboard-outline" color={theme.primary} size={18}/>}/>
            </View>
          </View>
        </View>
      </Animated.View>
    </ScrollView>;
  }
  if (recommendations.length === 0 && !showManualCourseSetup
    && (learningPreferences.levels.length === 0 || learningPreferences.topics.length === 0)) {
    return <ScrollView testID="today-personalize" showsVerticalScrollIndicator={false}
      style={[styles.batchEnd, styles.batchEndSurface, { backgroundColor: theme.surface }]}
      contentContainerStyle={styles.personalizeContent}>
      <Ionicons name="layers-outline" size={38} color={theme.primary}/>
      <AppText variant="heading" style={styles.notificationReviewMessage}>Personalize your {learnedLanguage} words</AppText>
      <AppText style={[styles.notificationReviewMessage, { color: theme.muted }]}>Choose your levels and interests to get your next set of words.</AppText>
      <View style={styles.personalizeAction}>
        <PrimaryButton label="Choose my preferences" onPress={() => router.push('/preferences')}/>
      </View>
    </ScrollView>;
  }
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
      entering={animateEntrance ? FadeInDown.duration(220).reduceMotion(ReduceMotion.System) : undefined}
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
          <RecommendationFallbackNote recommendations={recommendations}/>
          <View style={styles.recommendationWords}>{recommendations.map(({ entry }) => <View key={entry.id} style={[styles.recommendationWord, { backgroundColor: theme.primarySoft }]}><AppText variant="label">{entry.term}</AppText><AppText variant="caption">{entry.level}</AppText></View>)}</View>
          <PrimaryButton testID="add-today-recommendations" label={`Add ${recommendations.length} ${wordLabel} & start learning`} loading={busy} onPress={onAdd} icon={<Ionicons name="add" color="#FFFFFF" size={18}/>}/>
        </View>
      </View>
    </Animated.View>
  </ScrollView>;
}

function Header({ filter, availableFilters, learnedLanguage, onSelectFilter }: { filter: LearningFilter; availableFilters: LearningFilter[]; learnedLanguage: string; onSelectFilter(filter: LearningFilter): Promise<void> }) {
  const theme = useAppTheme();
  const { collections } = useAppData();
  const filterOptions = availableFilters.map((id) => ({
    id,
    label: id === 'all' ? 'All' : id === 'personal' ? 'No level'
      : id.startsWith('collection:') ? collections.find((item) => item.id === id.slice('collection:'.length))?.name ?? 'Collection' : id,
  }));
  const subtitle = `Showing ${filter === 'all' ? `all ${learnedLanguage.toLowerCase()} words` : categoryWordLabel(filter, collections)}`;
  return <View style={styles.headerBlock}>
    <View style={styles.header}><View style={styles.headerCopy}><AppText variant="title">Today’s {learnedLanguage.toLowerCase()}</AppText><FlippingSubtitle text={subtitle}/></View><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.settings, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}><Ionicons name="options-outline" color={theme.primary} size={22}/></Pressable></View>
    <View style={styles.filterRow}>
      <SlidingFilterTabs options={filterOptions} selected={filter} onSelect={onSelectFilter}/>
      <FeedbackLink screen="today" label="Help improve Wordfold" iconOnly/>
    </View>
  </View>;
}

function categoryWordLabel(filter: LearningFilter, collections: Collection[]) {
  const word = 'words';
  if (filter.startsWith('collection:')) {
    const name = collections.find((item) => item.id === filter.slice('collection:'.length))?.name;
    return name ? `words in “${name}”` : 'collection words';
  }
  if (filter === 'all') return word;
  if (filter === 'personal') return `${word} with no assigned level`;
  return `${filter} ${word}`;
}

const styles = StyleSheet.create({
  headerCopy: { flex: 1, paddingRight: spacing.sm },
  emptySession: { flex: 1, paddingBottom: spacing.md },
  screen: { paddingHorizontal: spacing.lg }, headerBlock: { gap: spacing.sm, paddingBottom: spacing.sm }, header: { minHeight: 76, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordStack: { flex: 1, marginHorizontal: -spacing.lg, overflow: 'hidden' },
  stackContent: { flex: 1, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  batchEnd: { flex: 1 },
  batchEndSurface: { borderRadius: radii.sheet, overflow: 'hidden' },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  navigationButton: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  notificationReviewIntro: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  notificationReviewMessage: { textAlign: 'center' },
  notificationReviewCard: { flex: 1, paddingVertical: spacing.sm },
  learningEmptyContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  personalizeContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  personalizeAction: { width: '100%', maxWidth: 360, flexGrow: 0, flexShrink: 0 },
  nextBatchCardShadow: { width: '100%', maxWidth: 560, alignSelf: 'center', borderRadius: radii.sheet, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 22, elevation: 4 },
  nextBatchCard: { overflow: 'hidden', borderWidth: 1, borderRadius: radii.sheet },
  completionStatus: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1 },
  completionIcon: { width: 40, height: 40, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  nextBatchBody: { padding: spacing.xl, gap: spacing.lg },
  courseEmptyActions: { gap: spacing.sm },
  recommendationHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recommendationIcon: { width: 40, height: 40, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  recommendationText: { flex: 1, gap: 2 },
  recommendationWords: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recommendationWord: { minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  settings: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  position: { flex: 1, textAlign: 'center', paddingVertical: spacing.xs },
});
