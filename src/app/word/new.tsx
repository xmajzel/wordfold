import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { FormField } from '@/components/form-field';
import { LanguageSelector } from '@/components/language-selector';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import {
  defaultPronunciationLocale,
  defaultSourceLanguageCode,
  defaultTargetLanguageCode,
  languageLabel,
} from '@/domain/languages';
import type { CatalogSense } from '@/domain/types';
import { potentialWordDuplicates } from '@/domain/word-identity';
import { normalizeTerm } from '@/features/import/parser';
import { WordCapacityExceededError } from '@/features/purchases/capacity';
import { translateEnglishToSlovak } from '@/features/translation/translator';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function NewWordScreen() {
  const theme = useAppTheme();
  const { words, collections, findSenses, createWord } = useAppData();
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? 'my-words');
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [selectedSenseId, setSelectedSenseId] = useState<string | null>(null);
  const [sourceLanguageCode, setSourceLanguageCode] = useState(defaultSourceLanguageCode);
  const [targetLanguageCode, setTargetLanguageCode] = useState(defaultTargetLanguageCode);
  const [sourcePronunciationLocale, setSourcePronunciationLocale] = useState(
    defaultPronunciationLocale(defaultSourceLanguageCode),
  );
  const [targetPronunciationLocale, setTargetPronunciationLocale] = useState(
    defaultPronunciationLocale(defaultTargetLanguageCode),
  );
  const [senses, setSenses] = useState<CatalogSense[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [hasLookedUp, setHasLookedUp] = useState(false);

  const lookup = async () => {
    if (!term.trim() || sourceLanguageCode !== 'en') return;
    setLookingUp(true);
    setHasLookedUp(true);
    try {
      const results = await findSenses(term);
      setSenses(results);
      if (results[0]) selectSense(results[0]);
      else { setSelectedSenseId(null); setDefinition(''); setExample(''); setPartOfSpeech(''); }
    } finally { setLookingUp(false); }
  };

  const generateTranslation = async () => {
    if (!term.trim() || sourceLanguageCode !== 'en' || targetLanguageCode !== 'sk') return;
    setTranslating(true);
    try { setTranslation(await translateEnglishToSlovak(term)); }
    catch (error) { Alert.alert('Translation is not available', `${error instanceof Error ? error.message : 'Use a development build.'}\n\nThe first use also downloads an on-device language model over Wi-Fi.`); }
    finally { setTranslating(false); }
  };

  const selectSense = (sense: CatalogSense) => {
    setSelectedSenseId(sense.id); setDefinition(sense.definition); setExample(sense.example ?? ''); setPartOfSpeech(sense.partOfSpeech);
  };

  const persistWord = async () => {
    if (!term.trim() || !definition.trim()) return;
    setSaving(true);
    try {
      await createWord({
        collectionId, term, normalizedTerm: normalizeTerm(term, sourceLanguageCode), definition,
        sourceLanguageCode, targetLanguageCode, sourcePronunciationLocale, targetPronunciationLocale,
        example: example || null, translation: translation || null,
        partOfSpeech: partOfSpeech || null, catalogSenseId: selectedSenseId,
      });
      router.back();
    } catch (error) {
      if (error instanceof WordCapacityExceededError) {
        Alert.alert('Free library is full', error.message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Unlock unlimited', onPress: () => router.push('/upgrade' as never) },
        ]);
      } else {
        Alert.alert('Could not add word', error instanceof Error ? error.message : 'Please check the fields and try again.');
      }
    } finally { setSaving(false); }
  };

  const save = () => {
    if (!term.trim() || !definition.trim()) return;
    const normalizedTerm = normalizeTerm(term, sourceLanguageCode);
    const duplicates = potentialWordDuplicates(words, sourceLanguageCode, normalizedTerm);
    if (duplicates.length === 0) {
      void persistWord();
      return;
    }
    Alert.alert(
      'Possible duplicate',
      `${languageLabel(sourceLanguageCode)} “${term.trim()}” already exists in your library. Add another sense anyway?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add anyway', onPress: () => void persistWord() },
      ],
    );
  };

  const changeSourceLanguage = (languageCode: string, locale: string) => {
    const languageChanged = languageCode !== sourceLanguageCode;
    setSourceLanguageCode(languageCode);
    setSourcePronunciationLocale(locale);
    if (!languageChanged) return;
    setSenses([]); setSelectedSenseId(null); setHasLookedUp(false);
    setDefinition(''); setExample(''); setPartOfSpeech('');
  };

  const changeTargetLanguage = (languageCode: string, locale: string) => {
    const languageChanged = languageCode !== targetLanguageCode;
    setTargetLanguageCode(languageCode);
    setTargetPronunciationLocale(locale);
    if (languageChanged) setTranslation('');
  };

  return (
    <Screen scroll>
      <ModalHeader title="Add a word" />
      <LanguageSelector label="Learning language" languageCode={sourceLanguageCode} pronunciationLocale={sourcePronunciationLocale} onChange={changeSourceLanguage}/>
      <LanguageSelector label="Hint language" languageCode={targetLanguageCode} pronunciationLocale={targetPronunciationLocale} onChange={changeTargetLanguage}/>
      <FormField label={`${languageLabel(sourceLanguageCode)} word or phrase`} value={term} onChangeText={(value) => { setTerm(value); setSenses([]); setSelectedSenseId(null); setHasLookedUp(false); }} placeholder="stakeholder" autoCapitalize="none" returnKeyType="search" onSubmitEditing={() => void lookup()}/>
      {sourceLanguageCode === 'en'
        ? <PrimaryButton label="Find definition offline" variant="secondary" loading={lookingUp} disabled={!term.trim()} onPress={() => void lookup()} icon={<Ionicons name="search-outline" size={18} color={theme.primary}/>}/>
        : <AppText variant="caption" style={{ color: theme.muted }}>Offline definitions currently support English terms only. Add the definition manually.</AppText>}
      {senses.length > 1 ? <View style={styles.group}><AppText variant="label">Choose the intended meaning</AppText>{senses.map((sense) => <Pressable key={sense.id} onPress={() => selectSense(sense)} style={[styles.sense, { borderColor: selectedSenseId === sense.id ? theme.primary : theme.border, backgroundColor: selectedSenseId === sense.id ? theme.primarySoft : theme.surface }]}><AppText variant="caption" style={{ color: theme.accent }}>{sense.partOfSpeech}</AppText><AppText>{sense.definition}</AppText></Pressable>)}</View> : null}
      {hasLookedUp && !lookingUp && senses.length === 0 ? <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}><Ionicons name="create-outline" color={theme.primary} size={20}/><AppText style={styles.noticeText}>WordNet has no matching sense. Add a clear definition manually; AI fallback is intentionally outside this MVP.</AppText></View> : null}
      <FormField label="Definition" value={definition} onChangeText={setDefinition} placeholder="What this word or phrase means" multiline/>
      <FormField label="Example" value={example} onChangeText={setExample} placeholder="Use the word in context" multiline/>
      <FormField label={`${languageLabel(targetLanguageCode)} hint`} value={translation} onChangeText={setTranslation} placeholder="Optional translation" hint="Optional. It stays hidden until you ask for a hint."/>
      {sourceLanguageCode === 'en' && targetLanguageCode === 'sk'
        ? <PrimaryButton label="Generate Slovak hint on device" variant="secondary" loading={translating} disabled={!term.trim()} onPress={() => void generateTranslation()} icon={<Ionicons name="language-outline" size={18} color={theme.primary}/>}/>
        : <AppText variant="caption" style={{ color: theme.muted }}>Automatic on-device translation currently supports English → Slovak only.</AppText>}
      <FormField label="Part of speech" value={partOfSpeech} onChangeText={setPartOfSpeech} placeholder="noun"/>
      <View style={styles.group}><AppText variant="label">Collection</AppText><View style={styles.chips}>{collections.map((collection) => <Pressable key={collection.id} onPress={() => setCollectionId(collection.id)} style={[styles.chip, { backgroundColor: collectionId === collection.id ? theme.primary : theme.surface, borderColor: collectionId === collection.id ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: collectionId === collection.id ? '#FFFFFF' : theme.text }}>{collection.name}</AppText></Pressable>)}</View></View>
      <PrimaryButton label="Add to my words" loading={saving} disabled={!term.trim() || !definition.trim()} onPress={save}/>
    </Screen>
  );
}

export function ModalHeader({ title }: { title: string }) {
  const theme = useAppTheme();
  return <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={[styles.close, { backgroundColor: theme.surface }]}><Ionicons name="close" color={theme.text} size={22}/></Pressable><AppText variant="title">{title}</AppText><View style={styles.close}/></View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, group: { gap: spacing.sm },
  sense: { borderWidth: 1, borderRadius: radii.control, padding: spacing.md, gap: spacing.xs }, notice: { flexDirection: 'row', gap: spacing.sm, borderRadius: radii.control, padding: spacing.md }, noticeText: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { minHeight: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
