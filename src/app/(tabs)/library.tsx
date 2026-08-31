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
import { getCourseCatalogEntries } from '@/data/course-catalog';
import { cefrLevelDescriptions, cefrLevels } from '@/data/cefr-levels';
import { getCourseForWord, wordBelongsToCourse } from '@/domain/courses';
import { languageLabel } from '@/domain/languages';
import { calculateCefrProgress } from '@/features/learning/cefr-progress';
import { buildRecommendations, topicOptions } from '@/features/recommendations/selector';
import { WordCapacityExceededError } from '@/features/purchases/capacity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing, stateColors } from '@/theme/tokens';

type LibraryView = 'discover' | 'my-words';

export default function LibraryScreen() {
  const theme = useAppTheme();
  const {
    words, collections, activeCourse, activeCourseId, learningPreferences,
    createCollection, addRecommendedWords, wordCapacity,
  } = useAppData();
  const [libraryView, setLibraryView] = useState<LibraryView>('discover');
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [recommendationsBusy, setRecommendationsBusy] = useState(false);
  const activeWords = useMemo(() => words.filter((word) => wordBelongsToCourse(word, activeCourseId)), [activeCourseId, words]);
  const otherWords = useMemo(() => words.filter((word) => !getCourseForWord(word)), [words]);
  const filteredWords = useMemo(() => selectedCollection === 'other-vocabulary'
    ? otherWords
    : selectedCollection === 'all' ? activeWords : activeWords.filter((word) => word.collectionId === selectedCollection), [activeWords, otherWords, selectedCollection]);
  const collectionNames = useMemo(() => Object.fromEntries(collections.map((item) => [item.id, item.name])), [collections]);
  const learnedLanguage = languageLabel(activeCourse.sourceLanguageCode);
  const cefrLevelSummaries = useMemo(() => cefrLevels.map((level) => {
    const entries = getCourseCatalogEntries(activeCourseId, level);
    return {
      level,
      count: entries.length,
      description: cefrLevelDescriptions[level],
      progress: calculateCefrProgress(entries, activeWords),
    };
  }), [activeCourseId, activeWords]);
  const recommendationPreview = useMemo(() => activeCourse.capabilities.recommendations ? buildRecommendations(
    learningPreferences,
    activeWords.map((word) => word.normalizedTerm),
    10,
  ) : [], [activeCourse.capabilities.recommendations, activeWords, learningPreferences]);
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
        data={libraryView === 'my-words' ? filteredWords : []}
        keyExtractor={(word) => word.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        ItemSeparatorComponent={() => <View style={styles.separator}/>}
        ListHeaderComponent={<View style={styles.headerContent}>
          <View style={styles.header}><View style={styles.headerCopy}><AppText variant="title">Your {learnedLanguage.toLowerCase()} library</AppText><AppText style={{ color: theme.muted }}>{activeWords.length} {activeWords.length === 1 ? 'word' : 'words'} across {collections.length} {collections.length === 1 ? 'collection' : 'collections'}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={[styles.iconButton, { backgroundColor: theme.surface }]}><Ionicons name="settings-outline" color={theme.primary} size={21}/></Pressable></View>
          <View accessibilityRole="tablist" style={[styles.viewTabs, { backgroundColor: theme.raised }]}>
            <LibraryViewTab label="Discover" selected={libraryView === 'discover'} onPress={() => setLibraryView('discover')}/>
            <LibraryViewTab label="My words" selected={libraryView === 'my-words'} onPress={() => setLibraryView('my-words')}/>
          </View>
          {wordCapacity.shouldShowNotice ? <Pressable testID="word-capacity-notice" accessibilityRole="button" accessibilityLabel="Open unlimited words" onPress={() => router.push('/upgrade' as never)} style={[styles.capacityNotice, { backgroundColor: theme.primarySoft }]}><Ionicons name="infinite-outline" color={theme.primary} size={21}/><View style={styles.packText}><AppText variant="label">{wordCapacity.remaining === 0 ? 'Free library full' : `${wordCapacity.remaining} free ${wordCapacity.remaining === 1 ? 'word remains' : 'words remain'}`}</AppText><AppText variant="caption" style={{ color: theme.muted }}>Unlock unlimited words forever with one Google Play purchase.</AppText></View><Ionicons name="chevron-forward" color={theme.primary} size={20}/></Pressable> : null}
          {libraryView === 'my-words' ? <>
            <View style={styles.actionRow}><View style={styles.action}><PrimaryButton label="Add a word" onPress={() => router.push('/word/new')} icon={<Ionicons name="add" color="#FFFFFF" size={18}/>}/></View><View style={styles.action}><PrimaryButton label="Bulk paste" variant="secondary" onPress={() => router.push('/import')} icon={<Ionicons name="clipboard-outline" color={theme.primary} size={18}/>}/></View></View>
            <View style={styles.sectionHeader}><AppText variant="heading">Collections</AppText><Pressable onPress={() => setShowCollectionForm((value) => !value)}><AppText variant="label" style={{ color: theme.primary }}>{showCollectionForm ? 'Cancel' : 'New collection'}</AppText></Pressable></View>
            {showCollectionForm ? <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><FormField label="Collection name" value={collectionName} onChangeText={setCollectionName} placeholder="Project management" returnKeyType="done" onSubmitEditing={() => void addCollection()}/><PrimaryButton label="Create collection" onPress={() => void addCollection()} disabled={!collectionName.trim()}/></View> : null}
            {collections.length > 1 || otherWords.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <FilterChip label="All collections" selected={selectedCollection === 'all'} onPress={() => setSelectedCollection('all')}/>
              {collections.map((collection) => <FilterChip key={collection.id} label={collection.name} selected={selectedCollection === collection.id} onPress={() => setSelectedCollection(collection.id)}/>) }
              {otherWords.length > 0 ? <FilterChip label={`Other vocabulary (${otherWords.length})`} selected={selectedCollection === 'other-vocabulary'} onPress={() => setSelectedCollection('other-vocabulary')}/> : null}
            </ScrollView> : null}
          </> : <>
            <View style={styles.sectionHeader}><View style={styles.sectionCopy}><AppText variant="heading">{learnedLanguage} levels</AppText><AppText variant="caption" style={{ color: theme.muted }}>{activeCourse.capabilities.bundledCatalog
              ? 'Browse the built-in CEFR-aligned catalog and see how far you have come.'
              : 'A1–C2 are ready for organization. The Spanish catalog stays unavailable until licensing and independent editorial review are complete.'}</AppText></View></View>
            <View style={styles.levelGrid}>
              {cefrLevelSummaries.map((item) => <Pressable
                key={item.level}
                accessibilityRole="button"
                accessibilityLabel={`Browse ${learnedLanguage} level ${item.level}. ${item.progress.known} known, ${item.progress.learning} learning, ${item.progress.addedNotStarted} added but not started, ${item.progress.notAdded} not added.`}
                onPress={() => router.push({ pathname: '/level/[level]', params: { level: item.level } } as never)}
                style={[styles.levelCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.levelTopRow}><View style={[styles.levelBadge, { backgroundColor: theme.primarySoft }]}><AppText variant="heading" style={{ color: theme.primary }}>{item.level}</AppText></View><Ionicons name="chevron-forward" color={theme.primary} size={18}/></View>
                <View style={styles.levelText}><AppText variant="label">{item.description}</AppText>{item.count > 0 ? <><LevelProgressBar progress={item.progress}/><AppText variant="caption" style={{ color: theme.muted }}>{item.progress.known.toLocaleString()} known · {item.progress.learning.toLocaleString()} learning</AppText><AppText variant="caption" style={{ color: theme.muted }}>{item.progress.addedNotStarted.toLocaleString()} added · {item.progress.notAdded.toLocaleString()} not added</AppText></> : <AppText variant="caption" style={{ color: theme.muted }}>Catalog pending review</AppText>}</View>
              </Pressable>)}
            </View>
          </>}
        </View>}
        ListEmptyComponent={libraryView === 'my-words' ? <View style={styles.empty}><EmptyState title={selectedCollection === 'other-vocabulary' ? 'No other vocabulary' : `No ${learnedLanguage.toLowerCase()} words here yet`} message={selectedCollection === 'other-vocabulary'
          ? 'Words outside the supported English → Slovak and Spanish → Slovak courses appear here.'
          : activeCourse.capabilities.recommendations
          ? 'Add a word here, or switch to Discover for recommendations.'
          : 'Add a Spanish word manually or bulk paste your own reviewed vocabulary.'}/></View> : null}
        renderItem={({ item }) => <Pressable onPress={() => router.push(`/word/${item.id}`)}>
          {selectedCollection === 'other-vocabulary' ? <AppText variant="caption" style={{ color: theme.muted }}>{languageLabel(item.targetLanguageCode)} → {languageLabel(item.sourceLanguageCode)}</AppText> : null}
          <WordCard word={item} collectionName={collectionNames[item.collectionId]} compact/>
        </Pressable>}
        ListFooterComponent={libraryView === 'discover' ? <View style={styles.footer}>
          <View style={styles.sectionHeader}><View style={styles.sectionCopy}><AppText variant="heading">{activeCourse.capabilities.recommendations ? 'Recommended for you' : 'Spanish catalog status'}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{activeCourse.capabilities.recommendations ? 'Small batches shaped by your level and interests.' : 'Manual and imported Spanish words are fully available now.'}</AppText></View></View>
          {!activeCourse.capabilities.recommendations ? <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.recommendationHeading}><View style={[styles.recommendationIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="shield-checkmark-outline" color={theme.primary} size={22}/></View><View style={styles.packText}><AppText variant="label">Reviewed A1–C2 content is not bundled yet</AppText><AppText variant="caption" style={{ color: theme.muted }}>Instituto Cervantes informs the editorial structure only. Its content is not copied or packaged without permission.</AppText></View></View>
            <View style={styles.actionRow}><View style={styles.action}><PrimaryButton label="Add Spanish word" onPress={() => router.push('/word/new')} icon={<Ionicons name="add" color="#FFFFFF" size={18}/>}/></View><View style={styles.action}><PrimaryButton label="Import" variant="secondary" onPress={() => router.push('/import')} icon={<Ionicons name="clipboard-outline" color={theme.primary} size={18}/>}/></View></View>
          </View> : hasPreferences ? <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.recommendationHeading}><View style={[styles.recommendationIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="sparkles-outline" color={theme.primary} size={22}/></View><View style={styles.packText}><AppText variant="label">{learningPreferences.levels.join(', ')} {learnedLanguage}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{topicOptions.filter((topic) => learningPreferences.topics.includes(topic.id)).map((topic) => topic.title).join(' · ')}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Edit learning preferences" onPress={() => router.push('/preferences' as never)} style={styles.editPreferences}><AppText variant="label" style={{ color: theme.primary }}>Edit</AppText></Pressable></View>
            {recommendationPreview.length > 0 ? <View style={styles.recommendationWords}>{recommendationPreview.slice(0, 3).map(({ entry }) => <View key={entry.id} style={[styles.recommendationWord, { backgroundColor: theme.primarySoft }]}><AppText variant="label" style={{ color: theme.primary }}>{entry.term}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{entry.level}</AppText></View>)}</View> : <AppText style={{ color: theme.muted }}>You have already added every available recommendation for these choices.</AppText>}
            <PrimaryButton label={recommendationPreview.length === 0 ? 'No new recommendations' : recommendationAddCount === 0 ? 'Unlock to add recommendations' : `Add ${recommendationAddCount} recommended words`} loading={recommendationsBusy} disabled={recommendationPreview.length === 0} onPress={() => void addRecommendations()} icon={<Ionicons name={recommendationAddCount === 0 ? 'infinite-outline' : 'add'} color="#FFFFFF" size={18}/>}/>
          </View> : <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.recommendationHeading}><View style={[styles.recommendationIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="options-outline" color={theme.primary} size={22}/></View><View style={styles.packText}><AppText variant="label">Make recommendations personal</AppText><AppText variant="caption" style={{ color: theme.muted }}>Choose at least one level and interest.</AppText></View></View><PrimaryButton label="Choose learning preferences" variant="secondary" onPress={() => router.push('/preferences' as never)}/></View>}
        </View> : null}
      />
    </Screen>
  );
}

function LibraryViewTab({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="tab" accessibilityLabel={`Show ${label}`} accessibilityState={{ selected }} onPress={onPress} style={[styles.viewTab, { backgroundColor: selected ? theme.surface : 'transparent', borderColor: selected ? theme.border : 'transparent' }]}><AppText variant="label" style={{ color: selected ? theme.primary : theme.muted }}>{label}</AppText></Pressable>;
}

function LevelProgressBar({ progress }: { progress: ReturnType<typeof calculateCefrProgress> }) {
  const theme = useAppTheme();
  if (progress.total === 0) return null;
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.total, now: progress.known }} style={[styles.levelProgress, { backgroundColor: theme.raised }]}>
    <View style={{ flex: progress.known, backgroundColor: stateColors.learned }}/>
    <View style={{ flex: progress.learning, backgroundColor: stateColors.understood }}/>
    <View style={{ flex: progress.addedNotStarted, backgroundColor: stateColors.new }}/>
    <View style={{ flex: progress.notAdded }}/>
  </View>;
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  const theme = useAppTheme();
  return <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: selected ? theme.primary : theme.surface, borderColor: selected ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: selected ? '#FFFFFF' : theme.text }}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }, headerContent: { gap: spacing.lg, marginBottom: spacing.sm }, separator: { height: spacing.sm }, footer: { gap: spacing.lg, marginTop: spacing.lg },
  header: { minHeight: 76, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }, headerCopy: { flex: 1 }, iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  viewTabs: { minHeight: 52, flexDirection: 'row', borderRadius: radii.control, padding: spacing.xs, gap: spacing.xs }, viewTab: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', gap: spacing.sm }, action: { flex: 1 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.sm }, sectionCopy: { flex: 1 },
  chips: { gap: spacing.sm }, chip: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.lg }, empty: { minHeight: 220 },
  packText: { flex: 1, gap: 2 }, recommendationHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, recommendationIcon: { width: 44, height: 44, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' }, editPreferences: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, recommendationWords: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, recommendationWord: { minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  capacityNotice: { minHeight: 76, borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, levelCard: { width: '48.5%', minHeight: 178, borderWidth: 1, borderRadius: radii.card, padding: spacing.md, gap: spacing.sm }, levelTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  levelBadge: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, levelText: { flex: 1, gap: spacing.xs }, levelProgress: { height: 8, flexDirection: 'row', borderRadius: radii.pill, overflow: 'hidden', marginTop: spacing.xs },
});
