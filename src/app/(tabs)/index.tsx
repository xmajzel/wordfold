import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import Animated, { FadeOut, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { SwipeableWordCard } from '@/components/swipeable-word-card';
import { WordCard } from '@/components/word-card';
import type { LearningFilter, LearningRating, Word } from '@/domain/types';
import { buildContinuedLearningFeed, buildLearningFeed, filterWordsByLearningCategory, getAvailableLearningFilters } from '@/features/learning/algorithm';
import { createSerialMutationQueue } from '@/features/learning/mutation-queue';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { spacing } from '@/theme/tokens';

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
  const { words, learningFilter, updateLearningFilter } = useAppData();
  const availableFilters = useMemo(() => getAvailableLearningFilters(words), [words]);
  const activeFilter = availableFilters.includes(learningFilter) ? learningFilter : 'all';
  const sessionKey = `${activeFilter}:${words.map((word) => word.id).sort().join(':')}`;

  useEffect(() => {
    if (activeFilter === learningFilter) return;
    void updateLearningFilter(activeFilter);
  }, [activeFilter, learningFilter, updateLearningFilter]);

  return <LearningSession key={sessionKey} filter={activeFilter} availableFilters={availableFilters}/>;
}

function LearningSession({ filter, availableFilters }: { filter: LearningFilter; availableFilters: LearningFilter[] }) {
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  const { words, collections, updateLearningFilter, rateWord, markViewed, prepareWordTranslation } = useAppData();
  const [sessionFeed, setSessionFeed] = useState<Word[]>(() => buildLearningFeed(words, new Date(), filter));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratingWordId, setRatingWordId] = useState<string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [listHeight, setListHeight] = useState(0);
  const [translationStates, setTranslationStates] = useState<Record<string, 'loading' | 'error'>>({});
  const listRef = useRef<FlatList<Word>>(null);
  const viewedIds = useRef(new Set<string>());
  const [mutationQueue] = useState(createSerialMutationQueue);
  const translatingIds = useRef(new Set<string>());
  const cardHeight = listHeight || Math.max(390, height - 241);
  const denseCards = cardHeight < 500;
  const categoryWords = useMemo(() => filterWordsByLearningCategory(words, filter), [filter, words]);
  const currentWords = useMemo(() => Object.fromEntries(words.map((word) => [word.id, word])), [words]);
  const activeWord = currentWords[sessionFeed[currentIndex]?.id] ?? sessionFeed[currentIndex];
  const continuedSessionFeed = useMemo(() => buildContinuedLearningFeed(
    words,
    sessionFeed.map((word) => word.id),
    new Date(),
    filter,
  ), [filter, sessionFeed, words]);

  const retryTranslation = useCallback((word: Word) => {
    setTranslationStates((current) => ({ ...current, [word.id]: 'loading' }));
  }, []);

  useEffect(() => {
    if (!activeWord || activeWord.translation
      || activeWord.sourceLanguageCode !== 'en' || activeWord.targetLanguageCode !== 'sk'
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
    const word = sessionFeed[currentIndex];
    if (!word || viewedIds.current.has(word.id)) return;
    const timer = setTimeout(() => {
      viewedIds.current.add(word.id);
      void mutationQueue.run(() => markViewed(word.id)).catch(() => {
        viewedIds.current.delete(word.id);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentIndex, markViewed, mutationQueue, sessionFeed]);

  const collectionNames = useMemo(() => Object.fromEntries(collections.map((item) => [item.id, item.name])), [collections]);

  const handleRating = async (word: Word, rating: LearningRating) => {
    if (ratingWordId) return;
    setRatingWordId(word.id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < sessionFeed.length) {
      setCurrentIndex(nextIndex);
      requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: nextIndex, animated: true }));
    } else {
      setSessionComplete(true);
    }
    try {
      await mutationQueue.run(() => rateWord(word, rating));
    } catch {
      setSessionComplete(false);
      setCurrentIndex(currentIndex);
      requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: currentIndex, animated: true }));
      Alert.alert('Progress was not saved', 'Please try rating this word again.');
    } finally {
      setRatingWordId(null);
    }
  };

  const continueLearning = () => {
    if (continuedSessionFeed.length === 0) return;
    viewedIds.current.clear();
    setSessionFeed(continuedSessionFeed);
    setCurrentIndex(0);
    setSessionComplete(false);
  };

  if (sessionComplete) {
    const canContinue = continuedSessionFeed.length > 0;
    return <Screen><Header filter={filter} availableFilters={availableFilters} onSelectFilter={updateLearningFilter}/><Animated.View exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)} style={styles.emptyTransition}><EmptyState title="Session complete" message={`You worked through every ${categoryWordLabel(filter, true)} due in this session.`} actionLabel={canContinue ? 'Continue learning' : 'Browse library'} onAction={canContinue ? continueLearning : () => router.push('/(tabs)/library')}/></Animated.View></Screen>;
  }

  if (sessionFeed.length === 0) {
    const hasCategoryWords = categoryWords.length > 0;
    return <Screen><Header filter={filter} availableFilters={availableFilters} onSelectFilter={updateLearningFilter}/><EmptyState title={hasCategoryWords ? 'You are caught up' : `No ${categoryWordLabel(filter)} yet`} message={hasCategoryWords ? `No ${categoryWordLabel(filter)} are due right now.` : 'Add words from the library or choose another category.'} actionLabel="Browse library" onAction={() => router.push('/(tabs)/library')}/></Screen>;
  }

  return (
    <Screen style={styles.screen}>
      <Header filter={filter} availableFilters={availableFilters} onSelectFilter={updateLearningFilter}/>
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
          const translationStatus = currentWord.id === activeWord?.id && !currentWord.translation
            && currentWord.sourceLanguageCode === 'en' && currentWord.targetLanguageCode === 'sk'
            ? translationStates[currentWord.id] ?? 'loading'
            : undefined;
          return <View style={{ height: cardHeight, marginBottom: spacing.md }}><SwipeableWordCard word={currentWord} active={index === currentIndex} disabled={ratingWordId !== null} onSwipe={(rating) => void handleRating(currentWord, rating)}><WordCard word={currentWord} collectionName={collectionNames[currentWord.collectionId]} dense={denseCards} actionsDisabled={ratingWordId !== null} showPronunciation={index === currentIndex} translationStatus={translationStatus} onRetryTranslation={() => retryTranslation(currentWord)} onRate={(rating) => void handleRating(currentWord, rating)}/></SwipeableWordCard></View>;
        }}
      />
      <AppText variant="caption" style={[styles.position, { color: theme.muted }]}>{Math.min(currentIndex + 1, sessionFeed.length)} of {sessionFeed.length} due now · scroll to skip</AppText>
    </Screen>
  );
}

function Header({ filter, availableFilters, onSelectFilter }: { filter: LearningFilter; availableFilters: LearningFilter[]; onSelectFilter(filter: LearningFilter): Promise<void> }) {
  const theme = useAppTheme();
  return <View style={styles.headerBlock}>
    <View style={styles.header}><View><AppText variant="title">Today’s words</AppText><AppText variant="caption" style={{ color: theme.muted }}>Showing {filter === 'all' ? 'all words' : categoryWordLabel(filter)}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.settings, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}><Ionicons name="options-outline" color={theme.primary} size={22}/></Pressable></View>
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
  settings: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1 }, filters: { gap: spacing.sm },
  filter: { minWidth: 44, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, position: { textAlign: 'center', paddingVertical: spacing.xs },
});
