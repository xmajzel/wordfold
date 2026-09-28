import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { WordCard } from '@/components/word-card';
import { wordBelongsToCourse } from '@/domain/courses';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { spacing } from '@/theme/tokens';

export default function CollectionCardsScreen() {
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { words, collections, activeCourseId, learningConfirmations } = useAppData();
  const collection = collections.find((item) => item.id === id);
  const collectionWords = useMemo(() => words.filter((word) => word.collectionId === id && wordBelongsToCourse(word, activeCourseId)), [activeCourseId, id, words]);
  const [index, setIndex] = useState(0);
  const currentIndex = Math.min(index, Math.max(0, collectionWords.length - 1));
  const word = collectionWords[currentIndex];

  return <Screen style={styles.screen}>
    <View style={styles.header}>
      <View style={styles.heading}><AppText variant="heading" numberOfLines={1}>{collection?.name ?? 'Collection'}</AppText><AppText variant="caption" style={{ color: theme.muted }}>All cards · review without changing progress</AppText></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close collection cards" onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={24} color={theme.text}/></Pressable>
    </View>
    {!word ? <EmptyState title={collection ? 'No cards in this collection' : 'Collection unavailable'} message={collection ? 'Add words to this collection to review them here.' : 'This collection may have been removed.'} actionLabel="Back to library" onAction={() => router.back()}/>
      : <>
        <View style={styles.card}><WordCard key={word.id} word={word} confirmations={learningConfirmations} collectionName={collection?.name} dense={height < 700} showPronunciation/></View>
        <View style={styles.navigation}>
          <PrimaryButton label="Previous" variant="secondary" disabled={currentIndex === 0} onPress={() => setIndex(currentIndex - 1)}/>
          <AppText variant="caption" style={[styles.position, { color: theme.muted }]}>{currentIndex + 1} of {collectionWords.length}</AppText>
          <PrimaryButton label={currentIndex === collectionWords.length - 1 ? 'Done' : 'Next'} onPress={() => currentIndex === collectionWords.length - 1 ? router.back() : setIndex(currentIndex + 1)}/>
        </View>
      </>}
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md, paddingBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60 },
  heading: { flex: 1, gap: spacing.xs },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { flex: 1, minHeight: 0 },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  position: { flexShrink: 1, textAlign: 'center' },
});
