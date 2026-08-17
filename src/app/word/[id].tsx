import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { LanguageSelector } from '@/components/language-selector';
import { PrimaryButton } from '@/components/primary-button';
import { PronunciationControls } from '@/components/pronunciation-controls';
import { Screen } from '@/components/screen';
import { StateBadge } from '@/components/state-badge';
import {
  defaultPronunciationLocale,
  defaultSourceLanguageCode,
  defaultTargetLanguageCode,
  languageLabel,
} from '@/domain/languages';
import { potentialWordDuplicates } from '@/domain/word-identity';
import { normalizeTerm } from '@/features/import/parser';
import { translateEnglishToSlovak } from '@/features/translation/translator';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function WordDetailScreen() {
  const theme = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { words, collections, editWord, removeWord, resetWord } = useAppData();
  const word = words.find((item) => item.id === id);
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');
  const [translation, setTranslation] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [collectionId, setCollectionId] = useState('my-words');
  const [sourceLanguageCode, setSourceLanguageCode] = useState(defaultSourceLanguageCode);
  const [targetLanguageCode, setTargetLanguageCode] = useState(defaultTargetLanguageCode);
  const [sourcePronunciationLocale, setSourcePronunciationLocale] = useState(
    defaultPronunciationLocale(defaultSourceLanguageCode),
  );
  const [targetPronunciationLocale, setTargetPronunciationLocale] = useState(
    defaultPronunciationLocale(defaultTargetLanguageCode),
  );
  const [catalogAssociationRemoved, setCatalogAssociationRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (!word) return;
    // Route changes need to replace the editable draft with the newly selected word.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTerm(word.term); setDefinition(word.definition); setExample(word.example ?? '');
    setTranslation(word.translation ?? ''); setPartOfSpeech(word.partOfSpeech ?? ''); setCollectionId(word.collectionId);
    setSourceLanguageCode(word.sourceLanguageCode); setTargetLanguageCode(word.targetLanguageCode);
    setSourcePronunciationLocale(word.sourcePronunciationLocale);
    setTargetPronunciationLocale(word.targetPronunciationLocale);
    setCatalogAssociationRemoved(false);
  }, [word]);

  if (!word) return <Screen><Header/><EmptyState title="Word not available" message="It may have been deleted after this reminder was scheduled." actionLabel="Open the feed" onAction={() => router.replace('/(tabs)')}/></Screen>;

  const persistWord = async () => {
    if (!term.trim() || !definition.trim()) return;
    setSaving(true);
    try {
      await editWord(word.id, {
        collectionId, term, normalizedTerm: normalizeTerm(term, sourceLanguageCode), definition,
        sourceLanguageCode, targetLanguageCode, sourcePronunciationLocale, targetPronunciationLocale,
        example: example || null, translation: translation || null, partOfSpeech: partOfSpeech || null,
        catalogSenseId: catalogAssociationRemoved ? null : word.catalogSenseId,
        cefrLevel: catalogAssociationRemoved ? null : word.cefrLevel,
        source: catalogAssociationRemoved ? 'manual' : word.source,
      });
      router.back();
    } catch (error) { Alert.alert('Could not save', error instanceof Error ? error.message : 'Please check the fields and try again.'); }
    finally { setSaving(false); }
  };

  const save = () => {
    if (!term.trim() || !definition.trim()) return;
    const duplicates = potentialWordDuplicates(
      words, sourceLanguageCode, normalizeTerm(term, sourceLanguageCode), word.id,
    );
    if (duplicates.length === 0) {
      void persistWord();
      return;
    }
    Alert.alert(
      'Possible duplicate',
      `${languageLabel(sourceLanguageCode)} “${term.trim()}” already exists in your library. Save this as another sense anyway?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save anyway', onPress: () => void persistWord() },
      ],
    );
  };

  const confirmDelete = () => Alert.alert('Delete this word?', 'Its learning history will also be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void removeWord(word.id).then(() => router.replace('/(tabs)/library')) }]);
  const generateTranslation = async () => {
    if (sourceLanguageCode !== 'en' || targetLanguageCode !== 'sk') return;
    setTranslating(true);
    try { setTranslation(await translateEnglishToSlovak(term)); }
    catch (error) { Alert.alert('Translation is not available', error instanceof Error ? error.message : 'Use a development build.'); }
    finally { setTranslating(false); }
  };

  const changeSourceLanguage = (languageCode: string, locale: string) => {
    if (languageCode === sourceLanguageCode) {
      setSourcePronunciationLocale(locale);
      return;
    }
    const apply = () => {
      setSourceLanguageCode(languageCode);
      setSourcePronunciationLocale(locale);
      setCatalogAssociationRemoved(true);
    };
    if (!word.catalogSenseId || catalogAssociationRemoved) {
      apply();
      return;
    }
    Alert.alert(
      'Change learning language?',
      'The existing English dictionary link and CEFR level will be removed. Your definition and progress will stay.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Change language', onPress: apply }],
    );
  };

  const changeTargetLanguage = (languageCode: string, locale: string) => {
    if (languageCode === targetLanguageCode) {
      setTargetPronunciationLocale(locale);
      return;
    }
    const apply = () => {
      setTargetLanguageCode(languageCode);
      setTargetPronunciationLocale(locale);
      setTranslation('');
    };
    if (!translation.trim()) {
      apply();
      return;
    }
    Alert.alert(
      'Change hint language?',
      'The existing hint will be cleared because it belongs to another language.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Change language', onPress: apply }],
    );
  };

  return (
    <Screen scroll>
      <Header />
      <View style={styles.titleRow}><View style={styles.titleText}><AppText variant="display">{word.term}</AppText><AppText style={{ color: theme.muted }}>{collections.find((item) => item.id === word.collectionId)?.name}</AppText></View><StateBadge state={word.state}/></View>
      <PronunciationControls
        text={term || word.term}
        sourceLanguageCode={sourceLanguageCode}
        locale={term ? sourcePronunciationLocale : word.sourcePronunciationLocale}
        catalogSenseId={catalogAssociationRemoved ? null : word.catalogSenseId}
      />
      <View style={[styles.trail, { backgroundColor: theme.surface, borderColor: theme.border }]}><Trail value={word.viewCount} label="times seen"/><Trail value={word.lapseCount} label="misses"/><Trail value={word.understoodStreak} label="recall steps"/></View>
      {word.state === 'learned' ? <PrimaryButton label="Practice this word again" variant="secondary" onPress={() => void resetWord(word.id)} icon={<Ionicons name="refresh-outline" color={theme.primary} size={18}/>}/> : null}
      <LanguageSelector label="Learning language" languageCode={sourceLanguageCode} pronunciationLocale={sourcePronunciationLocale} onChange={changeSourceLanguage}/>
      <LanguageSelector label="Hint language" languageCode={targetLanguageCode} pronunciationLocale={targetPronunciationLocale} onChange={changeTargetLanguage}/>
      <FormField label={`${languageLabel(sourceLanguageCode)} word or phrase`} value={term} onChangeText={setTerm}/>
      <FormField label="Definition" value={definition} onChangeText={setDefinition} multiline/>
      <FormField label="Example" value={example} onChangeText={setExample} multiline/>
      <FormField label={`${languageLabel(targetLanguageCode)} hint`} value={translation} onChangeText={setTranslation}/>
      {sourceLanguageCode === 'en' && targetLanguageCode === 'sk'
        ? <PrimaryButton label="Generate Slovak hint on device" variant="secondary" loading={translating} disabled={!term.trim()} onPress={() => void generateTranslation()} icon={<Ionicons name="language-outline" color={theme.primary} size={18}/>}/>
        : <AppText variant="caption" style={{ color: theme.muted }}>Automatic on-device translation currently supports English → Slovak only.</AppText>}
      <FormField label="Part of speech" value={partOfSpeech} onChangeText={setPartOfSpeech}/>
      <View><AppText variant="label">Collection</AppText><View style={styles.chips}>{collections.map((collection) => <Pressable key={collection.id} onPress={() => setCollectionId(collection.id)} style={[styles.chip, { backgroundColor: collectionId === collection.id ? theme.primary : theme.surface, borderColor: collectionId === collection.id ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: collectionId === collection.id ? '#FFFFFF' : theme.text }}>{collection.name}</AppText></Pressable>)}</View></View>
      <PrimaryButton label="Save changes" loading={saving} disabled={!term.trim() || !definition.trim()} onPress={save}/>
      <PrimaryButton label="Delete word" variant="danger" onPress={confirmDelete}/>
      <AppText variant="caption" style={{ color: theme.muted }}>Source: {word.cefrLevel ? `${word.cefrLevel} English catalog` : word.source === 'manual' ? 'Your library' : `${word.source} discovery pack`} · Created {new Date(word.createdAt).toLocaleDateString()}</AppText>
    </Screen>
  );
}

function Header() { const theme = useAppTheme(); return <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.back, { backgroundColor: theme.surface }]}><Ionicons name="arrow-back" color={theme.text} size={22}/></Pressable><AppText variant="label">Word details</AppText><View style={styles.back}/></View>; }
function Trail({ value, label }: { value: number; label: string }) { const theme = useAppTheme(); return <View style={styles.trailItem}><AppText variant="heading" style={{ color: theme.primary }}>{value}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{label}</AppText></View>; }

const styles = StyleSheet.create({
  header: { minHeight: 68, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, titleText: { flex: 1 },
  trail: { flexDirection: 'row', borderWidth: 1, borderRadius: radii.card, padding: spacing.lg }, trailItem: { flex: 1, alignItems: 'center', gap: spacing.xs }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }, chip: { minHeight: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
