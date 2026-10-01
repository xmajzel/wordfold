import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/app-text';
import { CollectionFormDisclosure } from '@/components/collection-form-disclosure';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ModalHeader } from '@/app/word/new';
import { languageLabel } from '@/domain/languages';
import { isOnDeviceTranslationPairSupported, translateOnDevice, TranslationCancelledError } from '@/features/translation/translator';
import { SuggestionPanel } from '@/features/ai/suggestion-panel';
import { AiPreparationPanel } from '@/features/import/ai-preparation-panel';
import { parseReviewQueue, reviewQueueKey, saveReviewQueue, type ReviewQueue, type ReviewDraft } from '@/features/import/review-queue';
import { useAuth } from '@/providers/auth-provider';
import { useAppData } from '@/providers/app-data-provider';
import { useAppTheme } from '@/hooks/use-app-theme';
import { normalizeTerm } from '@/features/import/parser';
import { preferenceLocale } from '@/domain/pronunciation-voices';
import type { CatalogSense } from '@/domain/types';
import { radii, spacing } from '@/theme/tokens';

export default function ImportReviewScreen() {
  const { user } = useAuth();
  const { activeCourse } = useAppData();
  const scope = reviewQueueKey(user?.id, activeCourse.id);
  return <GuidedReview key={scope} scope={scope}/>;
}
function GuidedReview({ scope }: { scope: string }) {
  const { user } = useAuth();
  const data = useAppData();
  const theme = useAppTheme();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reviewStarted, setReviewStarted] = useState(false);
  const [senses, setSenses] = useState<CatalogSense[]>([]);
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const collectionCreationPending = useRef(false);
  const translationController = useRef<AbortController | null>(null);
  const cancelTranslation = () => {
    translationController.current?.abort();
    translationController.current = null;
    setTranslating(false);
    setTranslationError(null);
  };
  const current = useRef<ReviewQueue | null>(null);
  const mounted = useRef(true);
  const saving = useRef(false);
  const commit = async (value: ReviewQueue) => {
    current.current = value; setQueue(value);
    try { await saveReviewQueue(scope, value); }
    catch { if (mounted.current) setMessage('Your review could not be saved on this device. Please try again before leaving.'); throw new Error('Review storage unavailable'); }
  };
  const addCollection = async () => {
    const name = collectionName.trim();
    if (!name || !current.current?.rows[current.current.index] || saving.current || collectionCreationPending.current) return;
    collectionCreationPending.current = true;
    setCreatingCollection(true);
    try {
      let id: string;
      try { id = await data.createCollection(name, '#D8902F'); }
      catch (error) {
        Alert.alert('Could not create collection', error instanceof Error ? error.message : 'Please try again.');
        return;
      }
      setCollectionName('');
      setShowCollectionForm(false);
      const q = current.current;
      if (q) await commit({ ...q, collectionId: id }).catch(() => {
        if (mounted.current) setMessage('Collection created, but its selection could not be saved. Tap the collection again before leaving.');
      });
    } finally {
      collectionCreationPending.current = false;
      if (mounted.current) setCreatingCollection(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void AsyncStorage.getItem(scope).then((raw) => {
      if (!mounted.current) return;
      const value = parseReviewQueue(raw); current.current = value; setQueue(value);
    }).catch(() => { if (mounted.current) setMessage('Saved review could not be loaded.'); })
      .finally(() => { if (mounted.current) setLoaded(true); });
    return () => { mounted.current = false; translationController.current?.abort(); };
  }, [scope]);
  const row = queue?.rows[queue.index];
  const update = (patch: Partial<ReviewDraft>) => {
    if ('translation' in patch) cancelTranslation();
    const q = current.current;
    if (!q || !q.rows[q.index]) return;
    void commit({ ...q, rows: q.rows.map((r, i) => i === q.index ? { ...r, ...patch } : r) }).catch(() => undefined);
  };
  useEffect(() => {
    if (!row || (queue.aiPreparation && !reviewStarted)) return;
    let active = true;
    const lookup = data.activeCourse.capabilities.bundledCatalog ? data.findSenses(row.term, data.activeCourse.id) : Promise.resolve([]);
    void lookup.then((found) => {
      if (!active) return;
      setSenses(found);
      if (!row.prepared) {
        const first = found.length === 1 ? found[0] : null;
        update({ prepared: true, ...(first ? { definition: first.definition, example: first.example ?? '',
          translation: row.translation || first.translation || '', partOfSpeech: first.partOfSpeech, catalogSenseId: first.id } : {}) });
      }
    }).catch(() => { if (active) setMessage('Offline lookup failed. You can still edit this word manually.'); })
      .finally(() => { if (active) setLookingUp(false); });
    return () => { active = false; };
    // Lookup only when advancing; edits must not retrigger it or replace the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.index, Boolean(queue), reviewStarted]);
  const canTranslate = isOnDeviceTranslationPairSupported(data.activeCourse.sourceLanguageCode, data.activeCourse.targetLanguageCode);
  const generateTranslation = async () => {
    const q = current.current; const draft = q?.rows[q.index];
    if (!q || !draft || !canTranslate || lookingUp || saving.current || translationController.current) return;
    const controller = new AbortController();
    translationController.current = controller;
    setTranslating(true); setTranslationError(null);
    try {
      const translation = await translateOnDevice(draft.term, {
        sourceLanguageCode: data.activeCourse.sourceLanguageCode,
        targetLanguageCode: data.activeCourse.targetLanguageCode,
      }, { signal: controller.signal });
      if (mounted.current && !controller.signal.aborted && current.current?.index === q.index) update({ translation });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted && !(error instanceof TranslationCancelledError)) {
        setTranslationError(error instanceof Error ? error.message : 'On-device translation failed. Please try again.');
      }
    } finally {
      if (mounted.current && translationController.current === controller) {
        translationController.current = null; setTranslating(false);
      }
    }
  };
  const duplicate = row && data.words.some((word) => word.sourceLanguageCode === data.activeCourse.sourceLanguageCode
    && word.targetLanguageCode === data.activeCourse.targetLanguageCode && word.normalizedTerm === normalizeTerm(row.term, data.activeCourse.sourceLanguageCode));
  const next = async (add: boolean) => {
    const q = current.current; const r = q?.rows[q.index];
    if (!q || !r || saving.current || showCollectionForm || collectionCreationPending.current) return;
    cancelTranslation();
    saving.current = true; setBusy(true); setMessage(null);
    try {
      if (add) {
        if (duplicate || r.error || !r.definition.trim()) return;
        await data.createWord({ collectionId: q.collectionId, term: r.term, normalizedTerm: normalizeTerm(r.term, data.activeCourse.sourceLanguageCode),
          definition: r.definition.trim(), translation: r.translation.trim() || null, example: r.example.trim() || null,
          partOfSpeech: r.partOfSpeech.trim() || null, catalogSenseId: r.catalogSenseId,
          sourceLanguageCode: data.activeCourse.sourceLanguageCode, targetLanguageCode: data.activeCourse.targetLanguageCode,
          sourcePronunciationLocale: preferenceLocale(data.pronunciationVoicePreference) ?? data.activeCourse.defaultSourcePronunciationLocale,
          targetPronunciationLocale: data.activeCourse.defaultTargetPronunciationLocale });
      }
      if (mounted.current) { setSenses([]); setLookingUp(true); }
      if (mounted.current) await commit({ ...q, index: q.index + 1, added: q.added + Number(add), skipped: q.skipped + Number(!add) });
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Could not save this word.'); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  const finish = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setMessage(null);
    try {
      await saveReviewQueue(scope, null);
      if (!mounted.current) return;
      router.dismissAll();
      router.navigate({ pathname: '/(tabs)/library', params: { view: 'my-words' } });
    } catch { if (mounted.current) setMessage('Could not clear this review. Please try again.'); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  return <Screen scroll><ModalHeader title="Review words"/>
    {!loaded ? <AppText>Loading saved review…</AppText> : !queue ? <AppText>No saved review for this account and course. Start from Bulk paste.</AppText> : !row ? <>
      <AppText variant="heading">Review complete</AppText><AppText>{queue.added} words added · {queue.skipped} skipped</AppText>
      <PrimaryButton label="Done" loading={busy} onPress={() => void finish()}/>
    </> : queue.aiPreparation && !reviewStarted ? <AiPreparationPanel queue={queue} userId={user?.id} onReview={() => setReviewStarted(true)}/> : <>
      <AppText variant="heading">{row.term}</AppText><AppText>Word {queue.index + 1} of {queue.rows.length} · {queue.added} added</AppText>
      <AppText variant="caption">Your progress is saved on this device. Close and resume from Bulk paste.</AppText>
      {queue.aiPreparation ? <PrimaryButton label="Prepare remaining AI suggestions" variant="secondary" disabled={busy || translating || showCollectionForm || creatingCollection}
        onPress={() => { setLookingUp(true); setReviewStarted(false); }}/>: null}
      <View>
        <AppText variant="label">Collection</AppText>
        <View style={styles.chips}>
        {data.collections.map((collection) => {
          const selected = queue.collectionId === collection.id;
          return <Pressable key={collection.id} accessibilityRole="button" accessibilityLabel={`Collection: ${collection.name}`} accessibilityState={{ selected }} disabled={busy || creatingCollection}
            onPress={() => { void commit({ ...queue, collectionId: collection.id }).catch(() => undefined); }}
            style={[styles.chip, { backgroundColor: selected ? theme.primary : theme.surface, borderColor: selected ? theme.primary : theme.border }]}>
            <AppText variant="label" style={{ color: selected ? theme.onPrimary : theme.text }}>{collection.name}</AppText>
          </Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel={showCollectionForm ? 'Cancel new collection' : 'New collection'} disabled={busy || creatingCollection}
          onPress={() => { setShowCollectionForm((value) => !value); setCollectionName(''); }} style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppText variant="label" style={{ color: theme.primary }}>{showCollectionForm ? 'Cancel' : '+ New collection'}</AppText>
        </Pressable>
        </View>
        <CollectionFormDisclosure open={showCollectionForm}><View style={[styles.collectionForm, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <FormField label="Collection name" value={collectionName} onChangeText={setCollectionName} editable={!creatingCollection} placeholder="English C1 lessons" returnKeyType="done" onSubmitEditing={() => void addCollection()}/>
          <PrimaryButton label="Create collection" variant="secondary" loading={creatingCollection} disabled={!collectionName.trim()} onPress={() => void addCollection()}/>
          <AppText variant="caption" style={{ color: theme.muted }}>Create this collection or cancel to continue reviewing your words.</AppText>
        </View></CollectionFormDisclosure>
      </View>
      {row.error || duplicate ? <AppText>{row.error ?? 'Already in your library. Skip this word to avoid a duplicate.'}</AppText> : <>
        {lookingUp ? <AppText>Finding offline definitions…</AppText> : senses.length ? <View style={{ gap: spacing.sm }}><AppText variant="label">Choose the intended meaning · free</AppText>
          {senses.map((sense) => <Pressable key={sense.id} accessibilityRole="button" accessibilityState={{ selected: row.catalogSenseId === sense.id }} disabled={busy}
            style={{ padding: spacing.md, backgroundColor: row.catalogSenseId === sense.id ? theme.primarySoft : theme.surface }}
            onPress={() => update({ definition: sense.definition, example: sense.example ?? '', translation: sense.translation ?? row.translation,
              partOfSpeech: sense.partOfSpeech, catalogSenseId: sense.id })}><AppText>{sense.partOfSpeech} · {sense.definition}</AppText></Pressable>)}
        </View> : <AppText>No offline definition found. Write your own or ask AI.</AppText>}
        <SuggestionPanel term={row.term} sourceLanguageCode={data.activeCourse.sourceLanguageCode} targetLanguageCode={data.activeCourse.targetLanguageCode}
          disabled={busy || lookingUp || data.wordCapacity.remaining === 0} onUse={(suggestion) => {
            const accepted = { ...suggestion };
            for (const field of ['definition', 'translation', 'example', 'partOfSpeech'] as const) {
              if (row.pastedFields?.[field] !== undefined) accepted[field] = row[field];
            }
            update({ ...accepted, catalogSenseId: null, prepared: true, ...(queue.aiPreparation ? { aiReviewed: true } : {}) });
          }} onDiscard={queue.aiPreparation ? () => update({ aiReviewed: true }) : undefined}/>
        {row.pastedFields && Object.keys(row.pastedFields).length ? <AppText variant="caption">Accept keeps the fields you supplied in the paste. You can edit them below.</AppText> : null}
        <FormField label="Definition" value={row.definition} editable={!busy && !lookingUp} onChangeText={(definition) => update({ definition })} multiline/>
        <FormField label="Translation" value={row.translation} editable={!busy} onChangeText={(translation) => update({ translation })}/>
        {canTranslate ? <>
          <PrimaryButton label={`Generate ${languageLabel(data.activeCourse.targetLanguageCode)} hint on device`} variant="secondary"
            loading={translating} disabled={busy || lookingUp || !row.term.trim()} onPress={() => void generateTranslation()}/>
          <AppText variant="caption">Free · uses no AI credits. First use may download a language model.</AppText>
        </> : <AppText variant="caption">Automatic on-device translation supports English → Slovak and Spanish → Slovak.</AppText>}
        {translationError ? <AppText accessibilityRole="alert" style={{ color: theme.danger }}>{translationError}</AppText> : null}
        <FormField label="Example" value={row.example} editable={!busy} onChangeText={(example) => update({ example })} multiline/>
        <FormField label="Part of speech" value={row.partOfSpeech} editable={!busy} onChangeText={(partOfSpeech) => update({ partOfSpeech })}/>
      </>}
      {data.wordCapacity.remaining === 0 ? <AppText>Your library is full. You can resume this review after making room.</AppText> : null}
      <PrimaryButton label="Add & next" loading={busy} disabled={Boolean(row.error || duplicate) || !row.definition.trim() || lookingUp || translating || showCollectionForm || creatingCollection || data.wordCapacity.remaining === 0
        || !data.collections.some((c) => c.id === queue.collectionId)} onPress={() => void next(true)}/>
      <PrimaryButton label="Skip" variant="secondary" disabled={busy || showCollectionForm || creatingCollection} onPress={() => void next(false)}/>
    </>}
    {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  collectionForm: { borderWidth: 1, borderRadius: radii.control, padding: spacing.md, gap: spacing.sm },
});
