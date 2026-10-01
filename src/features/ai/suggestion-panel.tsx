import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { AppText } from '@/components/app-text';
import { FormField } from '@/components/form-field';
import { SuggestionTransition } from './suggestion-transition';
import { AiButton, AiHeading, AiSurface } from './ai-presentation';
import { useAuth } from '@/providers/auth-provider';
import { spacing } from '@/theme/tokens';
import { AiError, fetchAiBalance, generateSuggestion, type WordSuggestion } from './client';
import { loadSavedSuggestion, type SavedRequest } from './saved-suggestion';
import { isWordSuggestion } from '../../../supabase/functions/_shared/ai-word';

type Props = { term: string; sourceLanguageCode: string; targetLanguageCode: string; disabled?: boolean; onUse(suggestion: WordSuggestion): void; onDiscard?(): void };
export function SuggestionPanel(props: Props) {
  const { user } = useAuth();
  if (!user) return <AiButton label="Sign in for AI suggestions" onPress={() => router.push('/account')}/>;
  const scope = JSON.stringify([user.id, props.sourceLanguageCode, props.targetLanguageCode, props.term.trim()]);
  return <SignedInSuggestion key={scope} {...props} scope={scope}/>;
}
function SignedInSuggestion({ scope, disabled, onUse, onDiscard, ...inputProps }: Props & { scope: string }) {
  const storageKey = `ai-suggestion-v1:${scope}`;
  const [context, setContext] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedRequest | null>(null);
  const [draft, setDraft] = useState<WordSuggestion | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const hasSuggestion = useRef(false);
  const dismissedRequest = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    void loadSavedSuggestion(storageKey, inputProps).then((value) => {
      if (!mounted.current || !value) return;
      setSaved(value); setContext(value.input.context);
      if (isWordSuggestion(value.suggestion)) { hasSuggestion.current = true; setDraft(value.suggestion); }
    }).catch(() => { if (mounted.current) setMessage('The previous suggestion could not be restored.'); })
      .finally(() => { if (mounted.current) setReady(true); });
    return () => { mounted.current = false; };
    // The wrapper remounts this component whenever the input/account scope changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void fetchAiBalance().then((value) => { if (active && mounted.current && !inFlight.current) setBalance(value.balance); }).catch(() => undefined);
    return () => { active = false; };
  }, []));
  const generate = async () => {
    if (inFlight.current || hasSuggestion.current) return;
    inFlight.current = true; setBusy(true); setMessage(null);
    const request: SavedRequest = saved ?? { requestId: Crypto.randomUUID(), input: { ...inputProps, term: inputProps.term.trim(), context: context.trim() } };
    try {
      // Persist before spending, so closing the screen never loses the recovery ID.
      await AsyncStorage.setItem(storageKey, JSON.stringify(request));
      if (!mounted.current) return;
      setSaved(request);
      const result = await generateSuggestion(request.requestId, request.input);
      if (result.status === 'completed') {
        await AsyncStorage.setItem(storageKey, JSON.stringify({ ...request, suggestion: result.suggestion }));
        if (mounted.current) { hasSuggestion.current = true; setSaved({ ...request, suggestion: result.suggestion }); setDraft(result.suggestion); }
      } else if (result.status === 'failed') {
        await AsyncStorage.removeItem(storageKey);
        if (mounted.current) { setSaved(null); setMessage('No suggestion was generated. Your credit has been returned.'); }
      } else if (mounted.current) setMessage('Your suggestion is still being prepared. Retry shortly; the same request costs no extra credit.');
      if (mounted.current) setBalance(result.balance);
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : 'Could not generate a suggestion.');
        if (error instanceof AiError && ['no_credits', 'limited', 'invalid_input', 'request_conflict'].includes(error.code)) {
          // These responses explicitly mean no new reservation was made.
          await AsyncStorage.removeItem(storageKey); setSaved(null);
          if (error.code === 'no_credits') setBalance(0);
        }
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const dismiss = async (use: boolean) => {
    if (inFlight.current || !draft || !saved || dismissedRequest.current === saved.requestId) return;
    inFlight.current = true; setBusy(true);
    try {
      await AsyncStorage.removeItem(storageKey);
      if (!mounted.current) return;
      dismissedRequest.current = saved.requestId;
      if (use) onUse(draft);
      else onDiscard?.();
      hasSuggestion.current = false; setSaved(null); setDraft(null);
    } catch { if (mounted.current) setMessage('Could not clear the saved draft. Please try again.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={{ gap: spacing.sm }}>
    <AiHeading>AI suggestions{balance === null ? '' : ` · ${balance} credits remaining`}</AiHeading>
    <AppText variant="caption">The word and context are sent to OpenAI. Review suggestions before saving. Each new suggestion costs 1 credit.</AppText>
    <SuggestionTransition suggestion={Boolean(draft)}>
    {draft ? <AiSurface>
      <AiHeading>AI suggestion</AiHeading>
      <AppText variant="caption">Review below. Accept to fill the form, then edit anything before saving.</AppText>
      {(['definition', 'translation', 'example', 'partOfSpeech'] as const).map((field) => <View key={field} style={{ gap: spacing.xs }}>
        <AppText variant="label">{field === 'partOfSpeech' ? 'Part of speech' : field.charAt(0).toUpperCase() + field.slice(1)}</AppText>
        <AppText selectable>{draft[field]}</AppText>
      </View>)}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <View style={{ flexGrow: 1, flexBasis: 120 }}><AiButton label="Discard" action="discard" disabled={busy} onPress={() => void dismiss(false)}/></View>
        <View style={{ flexGrow: 1, flexBasis: 120 }}><AiButton label="Accept" action="accept" disabled={disabled || busy || !isWordSuggestion(draft)} onPress={() => void dismiss(true)}/></View>
      </View>
    </AiSurface> : <>
      <FormField label="Context for AI (optional)" hint="Paste the sentence from your lesson to choose the right meaning."
        value={context} onChangeText={setContext} editable={!saved && !busy} maxLength={1000} multiline/>
      <AiButton label={saved ? 'Retry AI request · no extra credit' : 'Suggest with AI · 1 credit'}
        loading={busy} disabled={disabled || !ready || !inputProps.term.trim() || (!saved && balance === 0)} onPress={() => void generate()}/>
    </>}
    </SuggestionTransition>
    {balance === 0 && !saved ? <AppText>No AI credits remaining. Dictionary lookup and manual entry are still available.</AppText> : null}
    {balance === 0 && !saved && Platform.OS === 'android' ? <AiButton label="Buy AI credits" disabled={busy} onPress={() => router.push('/ai-credits')}/> : null}
    {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
  </View>;
}
