import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { getCefrEntries } from '@/data/cefr-catalog';
import { cefrLevelDescriptions, isCefrLevel } from '@/data/cefr-levels';
import type { CefrCatalogEntry } from '@/domain/types';
import { normalizeTerm } from '@/features/import/parser';
import { translateEnglishToSlovak } from '@/features/translation/translator';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function CefrLevelScreen() {
  const theme = useAppTheme();
  const { level } = useLocalSearchParams<{ level: string }>();
  const { words, collections, createWord } = useAppData();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const validLevel = isCefrLevel(level) ? level : null;
  const entries = useMemo(() => validLevel ? getCefrEntries(validLevel) : [], [validLevel]);
  const normalizedQuery = normalizeTerm(query);
  const filteredEntries = useMemo(() => normalizedQuery
    ? entries.filter((entry) => entry.normalizedTerm.includes(normalizedQuery) || normalizeTerm(entry.definition).includes(normalizedQuery))
    : entries, [entries, normalizedQuery]);
  const addedTerms = useMemo(() => new Set(words.map((word) => word.normalizedTerm)), [words]);

  const addWord = async (entry: CefrCatalogEntry) => {
    const collectionId = collections.find((collection) => collection.id === 'my-words')?.id ?? collections[0]?.id;
    if (!collectionId) {
      Alert.alert('Create a collection first', 'This word needs a collection before it can be added.');
      return;
    }
    setBusyId(entry.id);
    try {
      let translation: string;
      try {
        translation = (await translateEnglishToSlovak(entry.term)).trim();
        if (!translation) throw new Error('Translation returned no text.');
      } catch (error) {
        Alert.alert(
          'Translation is not available',
          `${error instanceof Error ? error.message : 'Use a Wordfold development build.'}\n\nThe word was not added. The first use downloads an on-device language model over Wi-Fi.`,
        );
        return;
      }
      await createWord({
        collectionId,
        term: entry.term,
        normalizedTerm: entry.normalizedTerm,
        definition: entry.definition,
        example: entry.example,
        translation,
        partOfSpeech: entry.partOfSpeech,
        catalogSenseId: entry.catalogSenseId,
        cefrLevel: entry.level,
        source: 'manual',
      });
    } catch (error) {
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
    return <Screen><Header title="English levels"/><EmptyState title="Level not available" message="Choose a level from A1 through C2." actionLabel="Back to the library" onAction={() => router.replace('/(tabs)/library')}/></Screen>;
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
          <Header title={`${validLevel} English`}/>
          <View style={styles.intro}>
            <View style={[styles.levelBadge, { backgroundColor: theme.primarySoft }]}><AppText variant="display" style={{ color: theme.primary }}>{validLevel}</AppText></View>
            <View style={styles.introText}><AppText variant="heading">{cefrLevelDescriptions[validLevel]}</AppText><AppText style={{ color: theme.muted }}>{entries.length.toLocaleString()} offline words with definitions</AppText></View>
          </View>
          <FormField label="Search this level" value={query} onChangeText={setQuery} placeholder="Word or meaning" autoCapitalize="none"/>
          <AppText variant="caption" style={{ color: theme.muted }}>CEFR-aligned vocabulary: A1–B2 from CEFR-J 1.6, C1–C2 from Octanove 1.0, with meanings from Open English WordNet 2025.</AppText>
          {normalizedQuery ? <AppText variant="label">{filteredEntries.length.toLocaleString()} results</AppText> : null}
        </View>}
        ListEmptyComponent={<EmptyState title="No matching words" message="Try a different word or definition."/>}
        renderItem={({ item }) => <CatalogWordCard
          entry={item}
          added={addedTerms.has(item.normalizedTerm)}
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

function CatalogWordCard({ entry, added, loading, disabled, onAdd }: {
  entry: CefrCatalogEntry;
  added: boolean;
  loading: boolean;
  disabled: boolean;
  onAdd(): void;
}) {
  const theme = useAppTheme();
  const source = entry.source === 'cefr-j' ? 'CEFR-J' : 'Octanove';
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.wordHeader}><View style={styles.wordTitle}><AppText variant="heading">{entry.term}</AppText><AppText variant="caption" style={{ color: theme.accent }}>{entry.partOfSpeech}</AppText></View><AppText variant="caption" style={{ color: theme.muted }}>{source} {entry.sourceVersion}</AppText></View>
    <AppText>{entry.definition}</AppText>
    {entry.example ? <AppText style={{ color: theme.muted }}>“{entry.example}”</AppText> : null}
    <PrimaryButton label={added ? 'Added to My words' : 'Add to My words'} variant={added ? 'secondary' : 'primary'} disabled={added || disabled} loading={loading} onPress={onAdd} icon={added ? <Ionicons name="checkmark" color={theme.primary} size={18}/> : <Ionicons name="add" color="#FFFFFF" size={18}/>}/>
  </View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }, separator: { height: spacing.sm },
  headerContent: { gap: spacing.lg, marginBottom: spacing.lg }, header: { minHeight: 68, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  levelBadge: { width: 82, height: 82, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }, introText: { flex: 1, gap: spacing.xs },
  card: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md }, wordHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  wordTitle: { flex: 1, gap: 2 },
});
