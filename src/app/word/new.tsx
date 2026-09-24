import { SuggestionPanel } from '@/features/ai/suggestion-panel';
import { preferenceLocale } from '@/domain/pronunciation-voices';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { CollectionFormDisclosure } from '@/components/collection-form-disclosure';
import { AppText } from '@/components/app-text';
import { FormField } from '@/components/form-field';
import { LanguageSelector } from '@/components/language-selector';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { languageLabel } from '@/domain/languages';
import type { CatalogSense } from '@/domain/types';
import { potentialWordDuplicates } from '@/domain/word-identity';
import { normalizeTerm } from '@/features/import/parser';
import { WordCapacityExceededError } from '@/features/purchases/capacity';
import {
  isOnDeviceTranslationPairSupported,
  translateOnDevice,
  TranslationCancelledError,
} from '@/features/translation/translator';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function NewWordScreen() {
  const theme = useAppTheme();
  const { words, collections, dataSource, wordCapacity, findSenses, createWord, createCollection, pronunciationVoicePreference, activeCourse } = useAppData();
  const preferredLocale = preferenceLocale(pronunciationVoicePreference);
  const { collectionId: requestedCollectionId } = useLocalSearchParams<{ collectionId?: string }>();
  const [collectionId, setCollectionId] = useState(() => collections.find((item) => item.id === requestedCollectionId)?.id ?? collections[0]?.id ?? '');
  const selectedCollectionId = collections.some((item) => item.id === collectionId)
    ? collectionId : collections[0]?.id ?? (dataSource === 'synced' || dataSource === 'reconciling' || dataSource === 'loading' ? '' : 'my-words');
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const collectionCreationPending = useRef(false);
  const wordSavePending = useRef(false);
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [selectedSenseId, setSelectedSenseId] = useState<string | null>(null);
  const selectedSenseTranslation = useRef<string | null>(null);
  const translationController = useRef<AbortController | null>(null);
  const [sourceLanguageCode, setSourceLanguageCode] = useState(activeCourse.sourceLanguageCode);
  const [targetLanguageCode, setTargetLanguageCode] = useState(activeCourse.targetLanguageCode);
  const [sourcePronunciationLocale, setSourcePronunciationLocale] = useState(
    preferredLocale ?? activeCourse.defaultSourcePronunciationLocale,
  );
  const [targetPronunciationLocale, setTargetPronunciationLocale] = useState(
    activeCourse.defaultTargetPronunciationLocale,
  );
  const [senses, setSenses] = useState<CatalogSense[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [hasLookedUp, setHasLookedUp] = useState(false);
  const canLookupCatalog = sourceLanguageCode === activeCourse.sourceLanguageCode
    && activeCourse.capabilities.bundledCatalog;
  const canTranslate = isOnDeviceTranslationPairSupported(sourceLanguageCode, targetLanguageCode);

  useEffect(() => () => translationController.current?.abort(), []);

  const lookup = async () => {
    if (!term.trim() || !canLookupCatalog) return;
    translationController.current?.abort();
    setLookingUp(true);
    setHasLookedUp(true);
    try {
      const results = await findSenses(term, activeCourse.id);
      setSenses(results);
      if (results[0]) selectSense(results[0]);
      else { setSelectedSenseId(null); setDefinition(''); setExample(''); setPartOfSpeech(''); }
    } finally { setLookingUp(false); }
  };

  const generateTranslation = async () => {
    if (!term.trim() || !canTranslate) return;
    translationController.current?.abort();
    const controller = new AbortController();
    translationController.current = controller;
    setTranslating(true);
    try {
      setTranslation(await translateOnDevice(term, { sourceLanguageCode, targetLanguageCode }, {
        signal: controller.signal,
      }));
    } catch (error) {
      if (!(error instanceof TranslationCancelledError)) {
        Alert.alert('Translation is not available', error instanceof Error ? error.message : 'Use a development build.');
      }
    } finally {
      if (translationController.current === controller) {
        translationController.current = null;
        setTranslating(false);
      }
    }
  };

  const selectSense = (sense: CatalogSense) => {
    translationController.current?.abort();
    const previousSenseTranslation = selectedSenseTranslation.current;
    const nextSenseTranslation = targetLanguageCode === 'sk' ? sense.translation ?? null : null;
    setSelectedSenseId(sense.id); setDefinition(sense.definition); setExample(sense.example ?? ''); setPartOfSpeech(sense.partOfSpeech);
    setTranslation((current) => current === (previousSenseTranslation ?? '')
      ? nextSenseTranslation ?? ''
      : current);
    selectedSenseTranslation.current = nextSenseTranslation;
  };

  const addCollection = async () => {
    const name = collectionName.trim();
    if (!name || collectionCreationPending.current || wordSavePending.current) return;
    collectionCreationPending.current = true;
    setCreatingCollection(true);
    try {
      const id = await createCollection(name, '#D8902F');
      setCollectionId(id);
      setCollectionName('');
      setShowCollectionForm(false);
    } catch (error) {
      Alert.alert('Could not create collection', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      collectionCreationPending.current = false;
      setCreatingCollection(false);
    }
  };

  const persistWord = async () => {
    if (!term.trim() || !definition.trim() || !selectedCollectionId || collectionCreationPending.current || wordSavePending.current || showCollectionForm) return;
    wordSavePending.current = true;
    setSaving(true);
    try {
      await createWord({
        collectionId: selectedCollectionId, term, normalizedTerm: normalizeTerm(term, sourceLanguageCode), definition,
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
    } finally { wordSavePending.current = false; setSaving(false); }
  };

  const save = () => {
    if (!term.trim() || !definition.trim() || !selectedCollectionId || collectionCreationPending.current || wordSavePending.current || showCollectionForm) return;
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
    translationController.current?.abort();
    const languageChanged = languageCode !== sourceLanguageCode;
    setSourceLanguageCode(languageCode);
    setSourcePronunciationLocale(languageChanged && preferredLocale?.split('-')[0] === languageCode ? preferredLocale : locale);
    if (!languageChanged) return;
    setSenses([]); setSelectedSenseId(null); setHasLookedUp(false);
    setDefinition(''); setExample(''); setPartOfSpeech('');
    selectedSenseTranslation.current = null;
  };

  const changeTargetLanguage = (languageCode: string, locale: string) => {
    translationController.current?.abort();
    const languageChanged = languageCode !== targetLanguageCode;
    setTargetLanguageCode(languageCode);
    setTargetPronunciationLocale(locale);
    if (languageChanged) {
      setTranslation('');
      selectedSenseTranslation.current = null;
    }
  };

  return (
    <Screen scroll>
      <ModalHeader title="Add a word" />
      <View style={styles.group}>
        <AppText variant="label">Collection</AppText>
        <View>
          <View style={styles.chips}>
            {collections.map((collection) => <Pressable key={collection.id} accessibilityRole="button" accessibilityLabel={`Collection: ${collection.name}`} accessibilityState={{ selected: selectedCollectionId === collection.id }} disabled={saving || creatingCollection} onPress={() => setCollectionId(collection.id)} style={[styles.chip, { backgroundColor: selectedCollectionId === collection.id ? theme.primary : theme.surface, borderColor: selectedCollectionId === collection.id ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: selectedCollectionId === collection.id ? '#FFFFFF' : theme.text }}>{collection.name}</AppText></Pressable>)}
            <Pressable accessibilityRole="button" accessibilityLabel={showCollectionForm ? 'Cancel new collection' : 'New collection'} disabled={saving || creatingCollection} onPress={() => { setShowCollectionForm((value) => !value); setCollectionName(''); }} style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}><AppText variant="label" style={{ color: theme.primary }}>{showCollectionForm ? 'Cancel' : '+ New collection'}</AppText></Pressable>
          </View>
          <CollectionFormDisclosure open={showCollectionForm}><View style={[styles.collectionForm, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <FormField label="Collection name" value={collectionName} onChangeText={setCollectionName} editable={!creatingCollection} placeholder="English C1 lessons" returnKeyType="done" onSubmitEditing={() => void addCollection()}/>
            <PrimaryButton label="Create collection" variant="secondary" loading={creatingCollection} disabled={!collectionName.trim()} onPress={() => void addCollection()}/>
            <AppText variant="caption" style={{ color: theme.muted }}>Create this collection or cancel to continue adding your word.</AppText>
          </View></CollectionFormDisclosure>
        </View>
      </View>
      <LanguageSelector label="Learning language" languageCode={sourceLanguageCode} pronunciationLocale={sourcePronunciationLocale} allowedLanguageCodes={[activeCourse.sourceLanguageCode]} onChange={changeSourceLanguage}/>
      <LanguageSelector label="Hint language" languageCode={targetLanguageCode} pronunciationLocale={targetPronunciationLocale} allowedLanguageCodes={[activeCourse.targetLanguageCode]} onChange={changeTargetLanguage}/>
      <FormField label={`${languageLabel(sourceLanguageCode)} word or phrase`} value={term} onChangeText={(value) => { translationController.current?.abort(); setTerm(value); setSenses([]); setSelectedSenseId(null); setHasLookedUp(false); }} placeholder={sourceLanguageCode === 'es' ? 'corazón' : 'stakeholder'} autoCapitalize="none" returnKeyType="search" onSubmitEditing={() => void lookup()}/>
      {canLookupCatalog
        ? <PrimaryButton label="Find definition offline" variant="secondary" loading={lookingUp} disabled={!term.trim()} onPress={() => void lookup()} icon={<Ionicons name="search-outline" size={18} color={theme.primary}/>}/>
        : <AppText variant="caption" style={{ color: theme.muted }}>Offline definitions are not available for this language pair. Add the definition manually.</AppText>}
      {senses.length > 1 ? <View style={styles.group}><AppText variant="label">Choose the intended meaning</AppText>{senses.map((sense) => <Pressable key={sense.id} onPress={() => selectSense(sense)} style={[styles.sense, { borderColor: selectedSenseId === sense.id ? theme.primary : theme.border, backgroundColor: selectedSenseId === sense.id ? theme.primarySoft : theme.surface }]}><AppText variant="caption" style={{ color: theme.accent }}>{sense.partOfSpeech}</AppText><AppText>{sense.definition}</AppText></Pressable>)}</View> : null}
      {hasLookedUp && !lookingUp && senses.length === 0 ? <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}><Ionicons name="create-outline" color={theme.primary} size={20}/><AppText style={styles.noticeText}>No matching offline definition. Add your own definition or ask AI for a suggestion.</AppText></View> : null}
      <SuggestionPanel term={term} sourceLanguageCode={sourceLanguageCode} targetLanguageCode={targetLanguageCode} disabled={saving || lookingUp || creatingCollection || wordCapacity.remaining === 0}
        onUse={(suggestion) => { translationController.current?.abort(); setSelectedSenseId(null); selectedSenseTranslation.current = null; setDefinition(suggestion.definition); setTranslation(suggestion.translation); setExample(suggestion.example); setPartOfSpeech(suggestion.partOfSpeech); }}/>
      <FormField label="Definition" value={definition} onChangeText={setDefinition} placeholder="What this word or phrase means" multiline/>
      <FormField label="Example" value={example} onChangeText={setExample} placeholder="Use the word in context" multiline/>
      <FormField label={`${languageLabel(targetLanguageCode)} hint`} value={translation} onChangeText={(value) => { translationController.current?.abort(); setTranslation(value); }} placeholder="Optional translation" hint="Optional. It stays hidden until you ask for a hint."/>
      {canTranslate
        ? <PrimaryButton label={`Generate ${languageLabel(targetLanguageCode)} hint on device`} variant="secondary" loading={translating} disabled={!term.trim()} onPress={() => void generateTranslation()} icon={<Ionicons name="language-outline" size={18} color={theme.primary}/>}/>
        : <AppText variant="caption" style={{ color: theme.muted }}>Automatic on-device translation supports English → Slovak and Spanish → Slovak.</AppText>}
      <FormField label="Part of speech" value={partOfSpeech} onChangeText={setPartOfSpeech} placeholder="noun"/>
      <PrimaryButton label="Add to my words" loading={saving} disabled={!term.trim() || !definition.trim() || !selectedCollectionId || creatingCollection || showCollectionForm} onPress={save}/>
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
  collectionForm: { borderWidth: 1, borderRadius: radii.control, padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { minHeight: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
