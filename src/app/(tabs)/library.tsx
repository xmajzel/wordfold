import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { WordCard } from '@/components/word-card';
import { getCefrLevelSummaries } from '@/data/cefr-levels';
import { buildRecommendations, topicOptions } from '@/features/recommendations/selector';
import { WordCapacityExceededError } from '@/features/purchases/capacity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

const cefrLevelSummaries = getCefrLevelSummaries();

export default function LibraryScreen() {
  const theme = useAppTheme();
  const { words, collections, learningPreferences, createCollection, addRecommendedWords, wordCapacity } = useAppData();
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [recommendationsBusy, setRecommendationsBusy] = useState(false);
  const filteredWords = useMemo(() => selectedCollection === 'all' ? words : words.filter((word) => word.collectionId === selectedCollection), [selectedCollection, words]);
  const collectionNames = useMemo(() => Object.fromEntries(collections.map((item) => [item.id, item.name])), [collections]);
  const recommendationPreview = useMemo(() => buildRecommendations(
    learningPreferences,
    words.filter((word) => word.sourceLanguageCode === 'en').map((word) => word.normalizedTerm),
    10,
  ), [learningPreferences, words]);
  const hasPreferences = learningPreferences.levels.length > 0 && learningPreferences.topics.length > 0;
  const recommendationAddCount = wordCapacity.remaining === null
    ? Math.min(10, recommendationPreview.length)
    : Math.min(10, recommendationPreview.length, wordCapacity.remaining);

  const addCollection = async () => {
    if (!collectionName.trim()) return;
    await createCollection(collectionName, '#D8902F');
    setCollectionName(''); setShowCollectionForm(false);
  };

  const addRecommendations = async () => {
    setRecommendationsBusy(true);
    try {
      if (recommendationAddCount === 0 && recommendationPreview.length > 0) {
        router.push('/upgrade' as never);
        return;
      }
      const count = await addRecommendedWords(recommendationAddCount);
      Alert.alert(count > 0 ? 'Recommendations added' : 'You are caught up', count > 0
        ? `${count} ${count === 1 ? 'word is' : 'words are'} ready to practice.`
        : 'There are no unused recommendations for these preferences right now.');
    } catch (error) {
      if (error instanceof WordCapacityExceededError) router.push('/upgrade' as never);
      else Alert.alert('Recommendations unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally { setRecommendationsBusy(false); }
  };

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={filteredWords}
        keyExtractor={(word) => word.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        ItemSeparatorComponent={() => <View style={styles.separator}/>}
        ListHeaderComponent={<View style={styles.headerContent}>
          <View style={styles.header}><View><AppText variant="title">Your library</AppText><AppText style={{ color: theme.muted }}>{words.length} {words.length === 1 ? 'word' : 'words'} across {collections.length} {collections.length === 1 ? 'collection' : 'collections'}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={[styles.iconButton, { backgroundColor: theme.surface }]}><Ionicons name="settings-outline" color={theme.primary} size={21}/></Pressable></View>
          <View style={styles.actionRow}><View style={styles.action}><PrimaryButton label="Add a word" onPress={() => router.push('/word/new')} icon={<Ionicons name="add" color="#FFFFFF" size={18}/>}/></View><View style={styles.action}><PrimaryButton label="Bulk paste" variant="secondary" onPress={() => router.push('/import')} icon={<Ionicons name="clipboard-outline" color={theme.primary} size={18}/>}/></View></View>
          {wordCapacity.shouldShowNotice ? <Pressable testID="word-capacity-notice" accessibilityRole="button" accessibilityLabel="Open unlimited words" onPress={() => router.push('/upgrade' as never)} style={[styles.capacityNotice, { backgroundColor: theme.primarySoft }]}><Ionicons name="infinite-outline" color={theme.primary} size={21}/><View style={styles.packText}><AppText variant="label">{wordCapacity.remaining === 0 ? 'Free library full' : `${wordCapacity.remaining} free ${wordCapacity.remaining === 1 ? 'word remains' : 'words remain'}`}</AppText><AppText variant="caption" style={{ color: theme.muted }}>Unlock unlimited words forever with one Google Play purchase.</AppText></View><Ionicons name="chevron-forward" color={theme.primary} size={20}/></Pressable> : null}
          <View style={styles.sectionHeader}><AppText variant="heading">Collections</AppText><Pressable onPress={() => setShowCollectionForm((value) => !value)}><AppText variant="label" style={{ color: theme.primary }}>{showCollectionForm ? 'Cancel' : 'New collection'}</AppText></Pressable></View>
          {showCollectionForm ? <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><FormField label="Collection name" value={collectionName} onChangeText={setCollectionName} placeholder="Project management" returnKeyType="done" onSubmitEditing={() => void addCollection()}/><PrimaryButton label="Create collection" onPress={() => void addCollection()} disabled={!collectionName.trim()}/></View> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="All words" selected={selectedCollection === 'all'} onPress={() => setSelectedCollection('all')}/>
            {collections.map((collection) => <FilterChip key={collection.id} label={collection.name} selected={selectedCollection === collection.id} onPress={() => setSelectedCollection(collection.id)}/>) }
          </ScrollView>
          <View style={styles.sectionHeader}><View><AppText variant="heading">English levels</AppText><AppText variant="caption" style={{ color: theme.muted }}>Browse the built-in CEFR-aligned catalog. Add only the words you want to learn.</AppText></View></View>
          <View style={styles.levelGrid}>
            {cefrLevelSummaries.map((item) => <Pressable
              key={item.level}
              accessibilityRole="button"
              accessibilityLabel={`Browse English level ${item.level}`}
              onPress={() => router.push({ pathname: '/level/[level]', params: { level: item.level } } as never)}
              style={[styles.levelCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.levelBadge, { backgroundColor: theme.primarySoft }]}><AppText variant="heading" style={{ color: theme.primary }}>{item.level}</AppText></View>
              <View style={styles.levelText}><AppText variant="label">{item.description}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{item.count.toLocaleString()} words</AppText></View>
              <Ionicons name="chevron-forward" color={theme.primary} size={18}/>
            </Pressable>)}
          </View>
        </View>}
        ListEmptyComponent={<View style={styles.empty}><EmptyState title="No words here yet" message="Add a word or choose learning preferences for recommendations below."/></View>}
        renderItem={({ item }) => <Pressable onPress={() => router.push(`/word/${item.id}`)}><WordCard word={item} collectionName={collectionNames[item.collectionId]} compact/></Pressable>}
        ListFooterComponent={<View style={styles.footer}>
          <View style={styles.sectionHeader}><View><AppText variant="heading">Recommended for you</AppText><AppText variant="caption" style={{ color: theme.muted }}>Small batches shaped by your level and interests.</AppText></View></View>
          {hasPreferences ? <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.recommendationHeading}><View style={[styles.recommendationIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="sparkles-outline" color={theme.primary} size={22}/></View><View style={styles.packText}><AppText variant="label">{learningPreferences.levels.join(', ')} English</AppText><AppText variant="caption" style={{ color: theme.muted }}>{topicOptions.filter((topic) => learningPreferences.topics.includes(topic.id)).map((topic) => topic.title).join(' · ')}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Edit learning preferences" onPress={() => router.push('/preferences' as never)} style={styles.editPreferences}><AppText variant="label" style={{ color: theme.primary }}>Edit</AppText></Pressable></View>
            {recommendationPreview.length > 0 ? <View style={styles.recommendationWords}>{recommendationPreview.slice(0, 3).map(({ entry }) => <View key={entry.id} style={[styles.recommendationWord, { backgroundColor: theme.primarySoft }]}><AppText variant="label" style={{ color: theme.primary }}>{entry.term}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{entry.level}</AppText></View>)}</View> : <AppText style={{ color: theme.muted }}>You have already added every available recommendation for these choices.</AppText>}
            <PrimaryButton label={recommendationPreview.length === 0 ? 'No new recommendations' : recommendationAddCount === 0 ? 'Unlock to add recommendations' : `Add ${recommendationAddCount} recommended words`} loading={recommendationsBusy} disabled={recommendationPreview.length === 0} onPress={() => void addRecommendations()} icon={<Ionicons name={recommendationAddCount === 0 ? 'infinite-outline' : 'add'} color="#FFFFFF" size={18}/>}/>
          </View> : <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.recommendationHeading}><View style={[styles.recommendationIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="options-outline" color={theme.primary} size={22}/></View><View style={styles.packText}><AppText variant="label">Make recommendations personal</AppText><AppText variant="caption" style={{ color: theme.muted }}>Choose at least one level and interest.</AppText></View></View><PrimaryButton label="Choose learning preferences" variant="secondary" onPress={() => router.push('/preferences' as never)}/></View>}
        </View>}
      />
    </Screen>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  const theme = useAppTheme();
  return <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: selected ? theme.primary : theme.surface, borderColor: selected ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: selected ? '#FFFFFF' : theme.text }}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }, headerContent: { gap: spacing.lg, marginBottom: spacing.sm }, separator: { height: spacing.sm }, footer: { gap: spacing.lg, marginTop: spacing.lg },
  header: { minHeight: 76, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', gap: spacing.sm }, action: { flex: 1 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.sm },
  chips: { gap: spacing.sm }, chip: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.lg }, empty: { minHeight: 220 },
  packText: { flex: 1, gap: 2 }, recommendationHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, recommendationIcon: { width: 44, height: 44, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' }, editPreferences: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, recommendationWords: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, recommendationWord: { minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  capacityNotice: { minHeight: 76, borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, levelCard: { width: '48.5%', minHeight: 132, borderWidth: 1, borderRadius: radii.card, padding: spacing.md, gap: spacing.sm },
  levelBadge: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, levelText: { flex: 1, gap: 2 },
});
