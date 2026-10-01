import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { AiButton, AiHeading, AiSurface } from '@/features/ai/ai-presentation';
import { fetchAiBalance } from '@/features/ai/client';
import { loadSavedSuggestion, suggestionStorageKey } from '@/features/ai/saved-suggestion';
import { useAppData } from '@/providers/app-data-provider';
import { spacing } from '@/theme/tokens';
import { normalizeTerm } from './parser';
import { prepareReviewSuggestions, reviewSuggestionInput } from './ai-preparation';
import type { ReviewQueue } from './review-queue';

export function AiPreparationPanel({ queue, userId, onReview }: { queue: ReviewQueue; userId?: string; onReview(): void }) {
  const { activeCourse, words, wordCapacity } = useAppData();
  const { sourceLanguageCode, targetLanguageCode } = activeCourse;
  const inputs = useMemo(() => {
    const existing = new Set(words.filter((word) => word.sourceLanguageCode === sourceLanguageCode
      && word.targetLanguageCode === targetLanguageCode).map((word) => word.normalizedTerm));
    return queue.rows.slice(queue.index).filter((row) => !row.aiReviewed && !row.error && !existing.has(normalizeTerm(row.term, sourceLanguageCode)))
      .map((row) => reviewSuggestionInput(row, sourceLanguageCode, targetLanguageCode));
  }, [queue, words, sourceLanguageCode, targetLanguageCode]);
  const [readyCount, setReadyCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadedInputs, setLoadedInputs] = useState<typeof inputs | null>(null);
  const loaded = loadedInputs === inputs;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useFocusEffect(useCallback(() => () => controller.current?.abort(), []));
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (userId) {
      void Promise.all(inputs.map((input) => loadSavedSuggestion(suggestionStorageKey(userId, input), input)))
        .then((saved) => {
          if (!active) return;
          setReadyCount(saved.filter((request) => request?.suggestion).length);
          setNewCount(saved.filter((request) => !request).length);
          setLoadedInputs(inputs);
        }).catch(() => { if (active) setMessage('Saved AI suggestions could not be loaded. Continue reviewing or reopen this screen to try again.'); });
      void fetchAiBalance().then((account) => { if (active) setBalance(account.balance); }).catch(() => undefined);
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && controller.current) {
        controller.current.abort();
        setMessage('Preparation paused. Completed suggestions are saved; resume when you return.');
      }
    });
    return () => { active = false; mounted.current = false; controller.current?.abort(); subscription.remove(); };
  }, [inputs, userId]);

  const prepare = async () => {
    if (!userId || !loaded || controller.current || wordCapacity.remaining === 0) return;
    const run = new AbortController();
    controller.current = run;
    setBusy(true); setMessage(null); setReadyCount(0);
    try {
      await prepareReviewSuggestions({ userId, inputs, signal: run.signal,
        onPrepared: () => { if (mounted.current) setReadyCount((count) => count + 1); } });
      if (mounted.current && !run.signal.aborted) onReview();
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : 'Preparation failed. Retry or continue reviewing.');
    } finally {
      controller.current = null;
      if (mounted.current) {
        setBusy(false);
        try {
          const saved = await Promise.all(inputs.map((input) => loadSavedSuggestion(suggestionStorageKey(userId, input), input)));
          if (mounted.current) {
            setReadyCount(saved.filter((request) => request?.suggestion).length);
            setNewCount(saved.filter((request) => !request).length);
          }
        } catch { if (mounted.current) setLoadedInputs(null); }
        void fetchAiBalance().then((account) => { if (mounted.current) setBalance(account.balance); }).catch(() => undefined);
      }
    }
  };

  return <View style={{ gap: spacing.lg }}>
    <AiSurface>
      <AiHeading>Prepare AI suggestions</AiHeading>
      <AppText>Prepare suggestions first, then review each word with the usual Accept, Discard, and Add & next actions.</AppText>
      <AppText variant="caption">Words and any pasted definitions, translations, and examples are sent to OpenAI. Nothing is added to your library until you review it.</AppText>
      {!userId ? <AiButton label="Sign in for AI preparation" onPress={() => router.push('/account')}/> : <>
        <AppText accessibilityLiveRegion="polite">{loaded ? `${readyCount} of ${inputs.length} suggestions ready` : 'Checking saved suggestions…'}</AppText>
        {loaded ? <AppText variant="caption">Up to {newCount} {newCount === 1 ? 'credit' : 'credits'} for new suggestions. Each new suggestion costs 1 credit, even if discarded. Saved suggestions and retrying interrupted requests cost no extra credits. Invalid lines and library duplicates are left out.</AppText> : null}
        {balance !== null ? <AppText variant="caption">{balance} AI credits remaining</AppText> : null}
        {wordCapacity.remaining === 0 ? <AppText>Your library is full. Make room before preparing more suggestions.</AppText> : null}
        {loaded && readyCount < inputs.length ? <AiButton label="Prepare remaining suggestions" loading={busy}
          disabled={wordCapacity.remaining === 0} onPress={() => void prepare()}/> : null}
        {busy ? <PrimaryButton label="Stop after current word" variant="secondary" onPress={() => {
          controller.current?.abort(); setMessage('Stopping after the current request. Completed suggestions will be kept.');
        }}/> : null}
      </>}
    </AiSurface>
    <PrimaryButton label="Continue review" disabled={busy} onPress={onReview}/>
    <AppText variant="caption">Preparation runs while this screen is open. You can close it and resume your saved review later.</AppText>
    {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
  </View>;
}
