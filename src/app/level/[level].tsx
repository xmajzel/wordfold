import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ProgressCountLabel } from '@/components/progress-count-label';
import { Screen } from '@/components/screen';
import { getCourseCatalogAvailability, getCourseCatalogEntries, type CourseCatalogEntry } from '@/data/course-catalog';
import { cefrLevelDescriptions, isCefrLevel } from '@/data/cefr-levels';
import { wordBelongsToCourse } from '@/domain/courses';
import { languageLabel } from '@/domain/languages';
import type { Word } from '@/domain/types';
import { normalizeTerm } from '@/features/import/parser';
import { calculateCefrProgress, type CefrProgress } from '@/features/learning/cefr-progress';
import { WordCapacityExceededError } from '@/features/purchases/capacity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing, stateColors } from '@/theme/tokens';

export default function CefrLevelScreen() {
  const theme = useAppTheme();
  const { level } = useLocalSearchParams<{ level: string }>();
  const {
    words, collections, activeCourse, activeCourseId, createWord, pronunciationVoicePreference,
  } = useAppData();
  const preferredSourceLocale = activeCourseId === 'en-sk' && pronunciationVoicePreference === 'neural-en-GB'
    ? 'en-GB'
    : activeCourse.defaultSourcePronunciationLocale;
  const learnedLanguage = languageLabel(activeCourse.sourceLanguageCode);
  const spanishPreview = getCourseCatalogAvailability(activeCourseId).isPreview;
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const validLevel = isCefrLevel(level) ? level : null;
  const entries = useMemo(() => validLevel ? getCourseCatalogEntries(activeCourseId, validLevel) : [], [activeCourseId, validLevel]);
  const activeWords = useMemo(() => words.filter((word) => wordBelongsToCourse(word, activeCourseId)), [activeCourseId, words]);
  const progress = useMemo(() => calculateCefrProgress(entries, activeWords), [activeWords, entries]);
  const normalizedQuery = normalizeTerm(query);
  const filteredEntries = useMemo(() => normalizedQuery
    ? entries.filter((entry) => entry.normalizedTerm.includes(normalizedQuery) || normalizeTerm(entry.definition).includes(normalizedQuery))
    : entries, [entries, normalizedQuery]);
  const wordsByTerm = useMemo(() => new Map(activeWords.flatMap((word) => (
    word.catalogSenseId === null ? [[word.normalizedTerm, word] as const] : []
  ))), [activeWords]);
  const wordsBySense = useMemo(() => new Map(activeWords.flatMap((word) => (
    word.catalogSenseId ? [[word.catalogSenseId, word] as const] : []
  ))), [activeWords]);

  const addWord = async (entry: CourseCatalogEntry) => {
    const collectionId = collections.find((collection) => collection.id === 'my-words')?.id ?? collections[0]?.id;
    if (!collectionId) {
      Alert.alert('Create a collection first', 'This word needs a collection before it can be added.');
      return;
    }
    setBusyId(entry.id);
    try {
      await createWord({
        collectionId,
        term: entry.term,
        normalizedTerm: entry.normalizedTerm,
        definition: entry.definition,
        example: entry.example,
        translation: entry.translation,
        partOfSpeech: entry.partOfSpeech,
        catalogSenseId: entry.catalogSenseId,
        cefrLevel: entry.level,
        source: 'manual',
        sourceLanguageCode: activeCourse.sourceLanguageCode,
        targetLanguageCode: activeCourse.targetLanguageCode,
        sourcePronunciationLocale: preferredSourceLocale,
        targetPronunciationLocale: activeCourse.defaultTargetPronunciationLocale,
      });
    } catch (error) {
      if (error instanceof WordCapacityExceededError) {
        Alert.alert('Free library is full', error.message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Unlock unlimited', onPress: () => router.push('/upgrade' as never) },
        ]);
        return;
      }
      Alert.alert(
        'Could not add word',
        error instanceof Error && error.message.includes('UNIQUE')
          ? 'That word is already in your library.'
          : 'Please try again.',
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!validLevel) {
    return <Screen><Header title={`${learnedLanguage} levels`}/><EmptyState title="Level not available" message="Choose a level from A1 through C2." actionLabel="Back to the library" onAction={() => router.replace('/(tabs)/library')}/></Screen>;
  }

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={filteredEntries}
        keyExtractor={(entry) => entry.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        ItemSeparatorComponent={() => <View style={styles.separator}/>}
        ListHeaderComponent={<View style={styles.headerContent}>
          <Header title={`${validLevel} ${learnedLanguage}`}/>
          {spanishPreview ? <AppText testID="spanish-preview-notice" variant="caption" style={{ color: theme.muted }}>Local development preview · {validLevel} · not a production release or a complete level</AppText> : null}
          <View style={styles.intro}>
            <View style={[styles.levelBadge, { backgroundColor: theme.primarySoft }]}><AppText variant="display" style={{ color: theme.primary }}>{validLevel}</AppText></View>
            <View style={styles.introText}><AppText variant="heading">{cefrLevelDescriptions[validLevel]}</AppText><AppText style={{ color: theme.muted }}>{entries.length > 0
              ? `${entries.length.toLocaleString()} offline words with ${learnedLanguage} definitions and Slovak hints`
              : 'Reviewed built-in words are not available for this level yet'}</AppText></View>
          </View>
          {entries.length > 0 ? <LevelProgressSummary progress={progress}/> : null}
          <FormField label="Search this level" value={query} onChangeText={setQuery} placeholder="Word or meaning" autoCapitalize="none"/>
          <AppText variant="caption" style={{ color: theme.muted }}>{activeCourseId === 'en-sk'
            ? 'CEFR-aligned vocabulary: A1–B2 from CEFR-J 1.6, C1–C2 from Octanove 1.0, with meanings from Open English WordNet 2025.'
            : 'Original Wordfold content structured using the Plan Curricular del Instituto Cervantes (PCIC) as an editorial reference. No Instituto Cervantes certification or endorsement is implied.'}</AppText>
          {normalizedQuery ? <AppText variant="label">{filteredEntries.length.toLocaleString()} results</AppText> : null}
        </View>}
        ListEmptyComponent={<EmptyState
          title={entries.length === 0 ? `No reviewed ${learnedLanguage} catalog words yet` : 'No matching words'}
          message={entries.length === 0 ? 'You can still add a word manually or import your own vocabulary.' : 'Try a different word or definition.'}
          actionLabel={entries.length === 0 ? `Add a ${learnedLanguage} word` : undefined}
          onAction={entries.length === 0 ? () => router.push('/word/new') : undefined}
        />}
        renderItem={({ item }) => <CatalogWordCard
          entry={item}
          word={wordsBySense.get(item.catalogSenseId) ?? wordsByTerm.get(item.normalizedTerm)}
          loading={busyId === item.id}
          disabled={busyId !== null}
          onAdd={() => void addWord(item)}
        />}
      />
    </Screen>
  );
}

function Header({ title }: { title: string }) {
  const theme = useAppTheme();
  return <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.back, { backgroundColor: theme.surface }]}><Ionicons name="arrow-back" color={theme.text} size={22}/></Pressable><AppText variant="label">{title}</AppText><View style={styles.back}/></View>;
}

function CatalogWordCard({ entry, word, loading, disabled, onAdd }: {
  entry: CourseCatalogEntry;
  word?: Word;
  loading: boolean;
  disabled: boolean;
  onAdd(): void;
}) {
  const theme = useAppTheme();
  const added = Boolean(word);
  const source = entry.source === 'cefr-j' ? 'CEFR-J' : entry.source === 'octanove' ? 'Octanove' : 'Wordfold original';
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={[styles.wordHeader, entry.courseId === 'es-sk' && styles.spanishWordHeader]}><View style={styles.wordTitle}><AppText variant="heading">{entry.term}</AppText><AppText variant="caption" style={{ color: theme.accent }}>{entry.partOfSpeech}</AppText></View><View style={[styles.cardMeta, entry.courseId === 'es-sk' && styles.spanishCardMeta]}><AppText variant="caption" style={{ color: theme.muted }}>{source} {entry.sourceVersion}</AppText>{word ? <CatalogProgressBadge state={word.state}/> : null}</View></View>
    <AppText>{entry.definition}</AppText>
    {entry.example ? <AppText style={{ color: theme.muted }}>“{entry.example}”</AppText> : null}
    {entry.courseId === 'es-sk' ? <>
      <AppText>Slovak hint: {entry.translation}</AppText>
      {entry.gender ? <AppText variant="caption" style={{ color: theme.muted }}>Gender: {entry.gender}</AppText> : null}
      {entry.alternativeForms?.length ? <AppText variant="caption" style={{ color: theme.muted }}>Forms: {entry.alternativeForms.map((form) => `${form.form} (${[form.type, form.note].filter(Boolean).join('; ')})`).join('; ')}</AppText> : null}
    </> : null}
    <PrimaryButton label={added ? 'Added to My words' : 'Add to My words'} variant={added ? 'secondary' : 'primary'} disabled={added || disabled} loading={loading} onPress={onAdd} icon={added ? <Ionicons name="checkmark" color={theme.primary} size={18}/> : <Ionicons name="add" color="#FFFFFF" size={18}/>}/>
  </View>;
}

function LevelProgressSummary({ progress }: { progress: CefrProgress }) {
  const theme = useAppTheme();
  const { fontScale } = useWindowDimensions();
  return <View accessible accessibilityRole="summary" accessibilityLabel={`${progress.known} known, ${progress.learning} learning, ${progress.addedNotStarted} added but not started, ${progress.notAdded} not added, out of ${progress.total} words`} style={[styles.progressPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.progressHeading}><AppText variant="heading">Your progress</AppText><AppText variant="label" style={{ color: theme.primary }}>{progress.known.toLocaleString()} of {progress.total.toLocaleString()} known</AppText></View>
    <View style={[styles.progressBar, { backgroundColor: theme.raised }]}>
      <View style={{ flex: progress.known, backgroundColor: stateColors.learned }}/>
      <View style={{ flex: progress.learning, backgroundColor: stateColors.understood }}/>
      <View style={{ flex: progress.addedNotStarted, backgroundColor: stateColors.new }}/>
      <View style={{ flex: progress.notAdded }}/>
    </View>
    <View style={styles.progressGrid}>
      <ProgressStat label="Known" value={progress.known} color={stateColors.learned}/>
      <ProgressStat label="Learning" value={progress.learning} color={stateColors.understood}/>
      <ProgressStat label={fontScale >= 1.5 ? 'Not started' : 'Added, not started'} value={progress.addedNotStarted} color={stateColors.new} testID="progress-pair-added-not-started"/>
      <ProgressStat label="Not added" value={progress.notAdded} color={theme.muted}/>
    </View>
  </View>;
}

function ProgressStat({ label, value, color, testID }: { label: string; value: number; color: string; testID?: string }) {
  return <View style={styles.progressStat}><View style={[styles.progressDot, { backgroundColor: color }]}/><ProgressCountLabel value={value} label={label} emphasizeValue testID={testID ?? `progress-pair-${label.toLowerCase().replace(/[^a-z]+/gu, '-')}`}/></View>;
}

function CatalogProgressBadge({ state }: { state: Word['state'] }) {
  const known = state === 'learned';
  const notStarted = state === 'new';
  const label = known ? 'Known' : notStarted ? 'Added, not started' : 'Learning';
  const color = known ? stateColors.learned : notStarted ? stateColors.new : stateColors.understood;
  return <View style={[styles.catalogProgressBadge, { backgroundColor: `${color}18`, borderColor: `${color}2E` }]}><AppText variant="caption" style={{ color }}>{label}</AppText></View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }, separator: { height: spacing.sm },
  headerContent: { gap: spacing.lg, marginBottom: spacing.lg }, header: { minHeight: 68, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  levelBadge: { width: 82, height: 82, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }, introText: { flex: 1, gap: spacing.xs },
  progressPanel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md }, progressHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }, progressBar: { height: 12, flexDirection: 'row', borderRadius: radii.pill, overflow: 'hidden' }, progressGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm }, progressStat: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 }, progressDot: { width: 10, height: 10, borderRadius: 5 },
  card: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md }, wordHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  wordTitle: { flex: 1, gap: 2 }, cardMeta: { alignItems: 'flex-end', gap: spacing.xs }, catalogProgressBadge: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  spanishWordHeader: { flexDirection: 'column' }, spanishCardMeta: { alignItems: 'flex-start' },
});
