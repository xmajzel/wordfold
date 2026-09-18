import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { AppText } from '@/components/app-text';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { useAuth } from '@/providers/auth-provider';
import { spacing } from '@/theme/tokens';
import { AiError, fetchAiBalance, generateSuggestion, type SuggestionInput, type WordSuggestion } from './client';
import { isWordSuggestion, UUID, parseSuggestionInput } from '../../../supabase/functions/_shared/ai-word';

type Props = { term: string; sourceLanguageCode: string; targetLanguageCode: string; disabled?: boolean; onUse(suggestion: WordSuggestion): void };
type SavedRequest = { requestId: string; input: SuggestionInput; suggestion?: WordSuggestion };
export function SuggestionPanel(props: Props) {
  const { user } = useAuth();
  if (!user) return <PrimaryButton label="Sign in for AI suggestions" variant="secondary" onPress={() => router.push('/account')}/>;
  const scope = JSON.stringify([user.id, props.sourceLanguageCode, props.targetLanguageCode, props.term.trim()]);
  return <SignedInSuggestion key={scope} {...props} scope={scope}/>;
}
function SignedInSuggestion({ scope, disabled, onUse, ...inputProps }: Props & { scope: string }) {
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
  useEffect(() => {
    mounted.current = true;
    void fetchAiBalance().then((value) => { if (mounted.current) setBalance(value.balance); }).catch(() => undefined);
    void AsyncStorage.getItem(storageKey).then((raw) => {
      if (!mounted.current || !raw) return;
      const value = JSON.parse(raw) as SavedRequest;
      if (!UUID.test(value.requestId) || !parseSuggestionInput(value.input)
        || value.input.term !== inputProps.term.trim()
        || value.input.sourceLanguageCode !== inputProps.sourceLanguageCode
        || value.input.targetLanguageCode !== inputProps.targetLanguageCode) return;
      setSaved(value); setContext(value.input.context);
      if (isWordSuggestion(value.suggestion)) setDraft(value.suggestion);
    }).catch(() => { if (mounted.current) setMessage('The previous suggestion could not be restored.'); })
      .finally(() => { if (mounted.current) setReady(true); });
    return () => { mounted.current = false; };
    // The wrapper remounts this component whenever the input/account scope changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const generate = async () => {
    if (inFlight.current) return;
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
        if (mounted.current) { setSaved({ ...request, suggestion: result.suggestion }); setDraft(result.suggestion); }
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
    if (busy) return;
    try {
      await AsyncStorage.removeItem(storageKey);
      if (!mounted.current) return;
      if (use && draft) onUse(draft);
      setSaved(null); setDraft(null);
    } catch { setMessage('Could not clear the saved draft. Please try again.'); }
  };
  return <View style={{ gap: spacing.sm }}>
    <AppText variant="label">AI suggestions{balance === null ? '' : ` · ${balance} credits remaining`}</AppText>
    <AppText variant="caption">The word and context are sent to OpenAI. Review suggestions before saving. Each new suggestion costs 1 credit.</AppText>
    {draft ? <>
      <AppText variant="heading">Review AI suggestion</AppText>
      {(['definition', 'translation', 'example', 'partOfSpeech'] as const).map((field) => <FormField key={field}
        label={`AI ${field === 'partOfSpeech' ? 'part of speech' : field}`} value={draft[field]}
        onChangeText={(value) => setDraft({ ...draft, [field]: value })} multiline={field === 'definition' || field === 'example'}/>)}
      <PrimaryButton label="Use this suggestion" disabled={disabled || !isWordSuggestion(draft)} onPress={() => void dismiss(true)}/>
      <PrimaryButton label="Discard suggestion" variant="secondary" onPress={() => void dismiss(false)}/>
    </> : <>
      <FormField label="Context for AI (optional)" hint="Paste the sentence from your lesson to choose the right meaning."
        value={context} onChangeText={setContext} editable={!saved && !busy} maxLength={1000} multiline/>
      <PrimaryButton label={saved ? 'Retry AI request · no extra credit' : 'Suggest with AI · 1 credit'} variant="secondary"
        loading={busy} disabled={disabled || !ready || !inputProps.term.trim() || (!saved && balance === 0)} onPress={() => void generate()}/>
    </>}
    {balance === 0 && !saved ? <AppText>No AI credits remaining. Dictionary lookup and manual entry are still available.</AppText> : null}
    {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
  </View>;
}
