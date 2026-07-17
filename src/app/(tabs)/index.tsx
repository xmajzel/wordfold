import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { WordCard } from '@/components/word-card';
import type { LearningFilter, LearningRating, Word } from '@/domain/types';
import { buildLearningFeed, filterWordsByLearningCategory, insertSessionRetry } from '@/features/learning/algorithm';
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
  const { words, learningFilter } = useAppData();
  const sessionKey = `${learningFilter}:${words.map((word) => word.id).sort().join(':')}`;
  return <LearningSession key={sessionKey} />;
}

function LearningSession() {
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  const { words, collections, learningFilter, updateLearningFilter, rateWord, markViewed } = useAppData();
  const [sessionFeed, setSessionFeed] = useState<Word[]>(() => buildLearningFeed(words, new Date(), learningFilter));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratingWordId, setRatingWordId] = useState<string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const listRef = useRef<FlatList<Word>>(null);
  const viewedIds = useRef(new Set<string>());
  const retriedIds = useRef(new Set<string>());
  const cardHeight = Math.max(540, height - 150);
  const categoryWords = useMemo(() => filterWordsByLearningCategory(words, learningFilter), [learningFilter, words]);

  useEffect(() => {
    const word = sessionFeed[currentIndex];
    if (!word || viewedIds.current.has(word.id)) return;
    const timer = setTimeout(() => {
      viewedIds.current.add(word.id);
      void markViewed(word.id);
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentIndex, markViewed, sessionFeed]);

  const collectionNames = useMemo(() => Object.fromEntries(collections.map((item) => [item.id, item.name])), [collections]);

  const handleRating = async (word: Word, rating: LearningRating) => {
    if (ratingWordId) return;
    setRatingWordId(word.id);
    let nextFeed = sessionFeed;
    const insertedRetry = rating === 'again' && !retriedIds.current.has(word.id);
    if (insertedRetry) {
      retriedIds.current.add(word.id);
      nextFeed = insertSessionRetry(sessionFeed, word, currentIndex);
      setSessionFeed(nextFeed);
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex < nextFeed.length) {
      setCurrentIndex(nextIndex);
      requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: nextIndex, animated: true }));
    } else {
      setSessionComplete(true);
    }
    try {
      await rateWord(word, rating);
    } catch {
      if (insertedRetry) retriedIds.current.delete(word.id);
      setSessionFeed(sessionFeed);
      setSessionComplete(false);
      setCurrentIndex(currentIndex);
      requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: currentIndex, animated: true }));
      Alert.alert('Progress was not saved', 'Please try rating this word again.');
    } finally {
      setRatingWordId(null);
    }
  };

  if (sessionComplete) {
    return <Screen><Header filter={learningFilter} onSelectFilter={updateLearningFilter}/><EmptyState title="Session complete" message={`You worked through every ${categoryWordLabel(learningFilter, true)} due in this session.`} actionLabel="Browse library" onAction={() => router.push('/(tabs)/library')}/></Screen>;
  }

  if (sessionFeed.length === 0) {
    const hasCategoryWords = categoryWords.length > 0;
    return <Screen><Header filter={learningFilter} onSelectFilter={updateLearningFilter}/><EmptyState title={hasCategoryWords ? 'You are caught up' : `No ${categoryWordLabel(learningFilter)} yet`} message={hasCategoryWords ? `No ${categoryWordLabel(learningFilter)} are due right now.` : 'Add words from the library or choose another category.'} actionLabel="Browse library" onAction={() => router.push('/(tabs)/library')}/></Screen>;
  }

  return (
    <Screen style={styles.screen}>
      <Header filter={learningFilter} onSelectFilter={updateLearningFilter}/>
      <FlatList
        ref={listRef}
        data={sessionFeed}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        showsVerticalScrollIndicator={false}
        snapToInterval={cardHeight + spacing.md}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: cardHeight + spacing.md, offset: (cardHeight + spacing.md) * index, index })}
        onMomentumScrollEnd={(event) => setCurrentIndex(Math.round(event.nativeEvent.contentOffset.y / (cardHeight + spacing.md)))}
        renderItem={({ item }) => <View style={{ height: cardHeight, marginBottom: spacing.md }}><WordCard word={item} collectionName={collectionNames[item.collectionId]} actionsDisabled={ratingWordId !== null} onRate={(rating) => void handleRating(item, rating)}/></View>}
      />
      <AppText variant="caption" style={[styles.position, { color: theme.muted }]}>{Math.min(currentIndex + 1, sessionFeed.length)} of {sessionFeed.length} due now</AppText>
    </Screen>
  );
}

function Header({ filter, onSelectFilter }: { filter: LearningFilter; onSelectFilter(filter: LearningFilter): Promise<void> }) {
  const theme = useAppTheme();
  return <View style={styles.headerBlock}>
    <View style={styles.header}><View><AppText variant="title">Today’s words</AppText><AppText variant="caption" style={{ color: theme.muted }}>Showing {filter === 'all' ? 'all words' : categoryWordLabel(filter)}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.settings, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}><Ionicons name="options-outline" color={theme.primary} size={22}/></Pressable></View>
    <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {filterOptions.map((option) => <Pressable key={option.id} accessibilityRole="tab" accessibilityLabel={`Show ${option.label} words`} accessibilityState={{ selected: filter === option.id }} aria-selected={filter === option.id} onPress={() => void onSelectFilter(option.id)} style={[styles.filter, { backgroundColor: filter === option.id ? theme.primary : theme.surface, borderColor: filter === option.id ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: filter === option.id ? '#FFFFFF' : theme.text }}>{option.label}</AppText></Pressable>)}
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
  settings: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1 }, filters: { gap: spacing.sm },
  filter: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, position: { textAlign: 'center', paddingVertical: spacing.xs },
});
