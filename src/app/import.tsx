import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { ModalHeader } from '@/app/word/new';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import type { CatalogSense } from '@/domain/types';
import { parseBulkInput, type ParsedImportLine } from '@/features/import/parser';
import { WordCapacityExceededError } from '@/features/purchases/capacity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing, typeScale } from '@/theme/tokens';

type ReviewedLine = ParsedImportLine & { sense: CatalogSense | null; duplicate: boolean };

export default function ImportScreen() {
  const theme = useAppTheme();
  const { words, collections, findSenses, createWords, wordCapacity } = useAppData();
  const [input, setInput] = useState('');
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? 'my-words');
  const [reviewed, setReviewed] = useState<ReviewedLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = useMemo(() => new Set(words
    .filter((word) => word.sourceLanguageCode === 'en')
    .map((word) => word.normalizedTerm)), [words]);
  const importable = reviewed?.filter((line) => !line.error && !line.duplicate && line.sense) ?? [];
  const allowedCount = wordCapacity.remaining === null
    ? importable.length
    : Math.min(importable.length, wordCapacity.remaining);
  const selectedImportable = importable.slice(0, allowedCount);
  const exceedsCapacity = allowedCount < importable.length;

  const review = async () => {
    setBusy(true);
    try {
      const parsed = parseBulkInput(input);
      const results: ReviewedLine[] = [];
      for (const line of parsed) {
        const duplicate = existing.has(line.normalizedTerm);
        const sense = line.error || duplicate ? null : (await findSenses(line.term))[0] ?? null;
        results.push({ ...line, duplicate, sense });
      }
      setReviewed(results);
    } finally { setBusy(false); }
  };

  const importWords = async () => {
    if (!selectedImportable.length) {
      router.push('/upgrade' as never);
      return;
    }
    setBusy(true);
    try {
      await createWords(selectedImportable.map((line) => ({
        collectionId, term: line.term, normalizedTerm: line.normalizedTerm,
        definition: line.sense!.definition, example: line.sense!.example,
        partOfSpeech: line.sense!.partOfSpeech, catalogSenseId: line.sense!.id,
        translation: line.translation ?? line.sense!.translation ?? null,
        sourceLanguageCode: 'en', targetLanguageCode: 'sk',
        sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK',
      })));
      Alert.alert('Words imported', `${selectedImportable.length} ${selectedImportable.length === 1 ? 'word is' : 'words are'} ready to practice.`, [{ text: 'Done', onPress: () => router.back() }]);
    } catch (error) {
      if (error instanceof WordCapacityExceededError) router.push('/upgrade' as never);
      else Alert.alert('Import unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <Screen scroll>
      <ModalHeader title="Bulk paste" />
      <View><AppText variant="heading">One word per line</AppText><AppText style={{ color: theme.muted }}>Use either <AppText variant="label">word</AppText> or <AppText variant="label">word - Slovak translation</AppText>.</AppText></View>
      <TextInput value={input} onChangeText={(value) => { setInput(value); setReviewed(null); }} multiline autoCapitalize="none" textAlignVertical="top" placeholder={'stakeholder - zainteresovana strana\nscope\nproject charter - projektova charta'} placeholderTextColor={theme.muted} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}/>
      <View><AppText variant="label">Collection</AppText><View style={styles.chips}>{collections.map((collection) => <Pressable key={collection.id} onPress={() => setCollectionId(collection.id)} style={[styles.chip, { backgroundColor: collectionId === collection.id ? theme.primary : theme.surface, borderColor: collectionId === collection.id ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: collectionId === collection.id ? '#FFFFFF' : theme.text }}>{collection.name}</AppText></Pressable>)}</View></View>
      <PrimaryButton label="Review paste" variant="secondary" loading={busy && !reviewed} disabled={!input.trim()} onPress={() => void review()} icon={<Ionicons name="checkmark-done-outline" color={theme.primary} size={18}/>}/>
      {reviewed ? <View style={styles.review}><View style={styles.summary}><AppText variant="heading">Review</AppText><AppText variant="label" style={{ color: theme.primary }}>{importable.length} ready</AppText></View>{reviewed.map((line) => { const issue = line.error ?? (line.duplicate ? 'Already in your library' : !line.sense ? 'No offline definition found' : null); const translation = line.translation ?? line.sense?.translation; return <View key={`${line.lineNumber}-${line.term}`} style={[styles.line, { backgroundColor: theme.surface, borderColor: issue ? theme.danger : theme.border }]}><View style={styles.lineText}><AppText variant="label">{line.term}</AppText><AppText variant="caption" style={{ color: issue ? theme.danger : theme.muted }}>{issue ?? line.sense?.definition}</AppText>{translation ? <AppText variant="caption" style={{ color: theme.primary }}>Hint: {translation}</AppText> : null}</View><Ionicons name={issue ? 'alert-circle-outline' : 'checkmark-circle-outline'} color={issue ? theme.danger : theme.success} size={22}/></View>; })}{exceedsCapacity ? <View testID="word-capacity-notice" style={[styles.capacityNotice, { backgroundColor: theme.primarySoft }]}><Ionicons name="infinite-outline" color={theme.primary} size={20}/><View style={styles.lineText}><AppText variant="label">{wordCapacity.remaining === 0 ? 'Your free library is full' : `${wordCapacity.remaining} free ${wordCapacity.remaining === 1 ? 'slot remains' : 'slots remain'}`}</AppText><AppText variant="caption" style={{ color: theme.muted }}>Import the words that fit, or unlock the whole batch.</AppText></View></View> : null}<PrimaryButton label={selectedImportable.length > 0 ? `Import first ${selectedImportable.length} ${selectedImportable.length === 1 ? 'word' : 'words'}` : 'Unlock to import more words'} loading={busy} disabled={!importable.length} onPress={() => void importWords()}/>{exceedsCapacity ? <PrimaryButton label="Unlock unlimited words" variant="secondary" onPress={() => router.push('/upgrade' as never)}/> : null}<AppText variant="caption" style={{ color: theme.muted }}>Unresolved or duplicate lines are left out. Add unresolved phrases manually so their meaning is not guessed.</AppText></View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 190, borderWidth: 1, borderRadius: radii.card, padding: spacing.md, fontFamily: 'Inter_400Regular', fontSize: typeScale.body, lineHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }, chip: { minHeight: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  review: { gap: spacing.sm }, summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, line: { borderWidth: 1, borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, lineText: { flex: 1, gap: 2 },
  capacityNotice: { borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
