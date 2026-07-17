import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import type { CatalogSense } from '@/domain/types';
import { normalizeTerm } from '@/features/import/parser';
import { translateEnglishToSlovak } from '@/features/translation/translator';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function NewWordScreen() {
  const theme = useAppTheme();
  const { collections, findSenses, createWord } = useAppData();
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? 'my-words');
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [selectedSenseId, setSelectedSenseId] = useState<string | null>(null);
  const [senses, setSenses] = useState<CatalogSense[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [hasLookedUp, setHasLookedUp] = useState(false);

  const lookup = async () => {
    if (!term.trim()) return;
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
    if (!term.trim()) return;
    setTranslating(true);
    try { setTranslation(await translateEnglishToSlovak(term)); }
    catch (error) { Alert.alert('Translation is not available', `${error instanceof Error ? error.message : 'Use a development build.'}\n\nThe first use also downloads an on-device language model over Wi-Fi.`); }
    finally { setTranslating(false); }
  };

  const selectSense = (sense: CatalogSense) => {
    setSelectedSenseId(sense.id); setDefinition(sense.definition); setExample(sense.example ?? ''); setPartOfSpeech(sense.partOfSpeech);
  };

  const save = async () => {
    if (!term.trim() || !definition.trim()) return;
    setSaving(true);
    try {
      await createWord({ collectionId, term, normalizedTerm: normalizeTerm(term), definition, example: example || null, translation: translation || null, partOfSpeech: partOfSpeech || null, catalogSenseId: selectedSenseId });
      router.back();
    } catch (error) {
      Alert.alert('Could not add word', error instanceof Error && error.message.includes('UNIQUE') ? 'That word is already in your library.' : 'Please check the fields and try again.');
    } finally { setSaving(false); }
  };

  return (
    <Screen scroll>
      <ModalHeader title="Add a word" />
      <FormField label="English word or phrase" value={term} onChangeText={(value) => { setTerm(value); setSenses([]); setSelectedSenseId(null); setHasLookedUp(false); }} placeholder="stakeholder" autoCapitalize="none" returnKeyType="search" onSubmitEditing={() => void lookup()}/>
      <PrimaryButton label="Find definition offline" variant="secondary" loading={lookingUp} disabled={!term.trim()} onPress={() => void lookup()} icon={<Ionicons name="search-outline" size={18} color={theme.primary}/>}/>
      {senses.length > 1 ? <View style={styles.group}><AppText variant="label">Choose the intended meaning</AppText>{senses.map((sense) => <Pressable key={sense.id} onPress={() => selectSense(sense)} style={[styles.sense, { borderColor: selectedSenseId === sense.id ? theme.primary : theme.border, backgroundColor: selectedSenseId === sense.id ? theme.primarySoft : theme.surface }]}><AppText variant="caption" style={{ color: theme.accent }}>{sense.partOfSpeech}</AppText><AppText>{sense.definition}</AppText></Pressable>)}</View> : null}
      {hasLookedUp && !lookingUp && senses.length === 0 ? <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}><Ionicons name="create-outline" color={theme.primary} size={20}/><AppText style={styles.noticeText}>WordNet has no matching sense. Add a clear definition manually; AI fallback is intentionally outside this MVP.</AppText></View> : null}
      <FormField label="Definition" value={definition} onChangeText={setDefinition} placeholder="What the word means in useful, plain English" multiline/>
      <FormField label="Example" value={example} onChangeText={setExample} placeholder="Use the word in context" multiline/>
      <FormField label="Slovak hint" value={translation} onChangeText={setTranslation} placeholder="zainteresovana strana" hint="Optional. It stays hidden until you ask for a hint."/>
      <PrimaryButton label="Generate Slovak hint on device" variant="secondary" loading={translating} disabled={!term.trim()} onPress={() => void generateTranslation()} icon={<Ionicons name="language-outline" size={18} color={theme.primary}/>}/>
      <FormField label="Part of speech" value={partOfSpeech} onChangeText={setPartOfSpeech} placeholder="noun"/>
      <View style={styles.group}><AppText variant="label">Collection</AppText><View style={styles.chips}>{collections.map((collection) => <Pressable key={collection.id} onPress={() => setCollectionId(collection.id)} style={[styles.chip, { backgroundColor: collectionId === collection.id ? theme.primary : theme.surface, borderColor: collectionId === collection.id ? theme.primary : theme.border }]}><AppText variant="label" style={{ color: collectionId === collection.id ? '#FFFFFF' : theme.text }}>{collection.name}</AppText></Pressable>)}</View></View>
      <PrimaryButton label="Add to my words" loading={saving} disabled={!term.trim() || !definition.trim()} onPress={() => void save()}/>
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
