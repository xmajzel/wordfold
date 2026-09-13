import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { AppText } from '@/components/app-text';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { languageLabel } from '@/domain/languages';
import { useAppData } from '@/providers/app-data-provider';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import { getFeedbackOrigin } from '@/features/feedback/context';
import { feedbackConfigured, feedbackQueue, getFeedbackInstallationId } from '@/features/feedback/service';
import type { PendingFeedback } from '@/features/feedback/queue';
import { contentReasons, feedbackCategories, isFeedbackReport, type FeedbackCategory, type FeedbackReport } from '../../supabase/functions/_shared/feedback';

export default function FeedbackScreen() {
  const theme = useAppTheme();
  const { origin: key } = useLocalSearchParams<{ origin?: string }>();
  const [origin] = useState(() => getFeedbackOrigin(key));
  const { activeCourse } = useAppData();
  const [category, setCategory] = useState<FeedbackCategory>(origin.word ? 'content' : 'bug');
  const [reason, setReason] = useState(origin.word ? 'Translation' : '');
  const [message, setMessage] = useState('');
  const [correction, setCorrection] = useState('');
  const [requestedItem, setRequestedItem] = useState('');
  const [languageRole, setLanguageRole] = useState<FeedbackReport['languageRole']>('learn');
  const [contactEmail, setContactEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingFeedback[]>([]);
  const submitting = useRef(false);
  const reportId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => { void feedbackQueue.list().then((rows) => { if (active) setPending(rows); }).catch(() => {
      if (active) setError('Saved feedback could not be read. Please try again.');
    }); };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const retry = async () => {
    setBusy(true);
    try { setPending(await feedbackQueue.flush()); }
    catch { setError('Could not send saved feedback. It remains on this device.'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError('');
    try {
      reportId.current ??= Crypto.randomUUID();
      const report: FeedbackReport = {
        id: reportId.current, installationId: await getFeedbackInstallationId(), category,
        reason: category === 'content' || category === 'missing' ? reason : '',
        message: message.trim(), correction: category === 'content' ? correction.trim() : '',
        contactEmail: contactEmail.trim(), requestedItem: category === 'missing' ? requestedItem.trim() : '',
        languageRole: category === 'missing' && reason === 'Language' ? languageRole : '',
        context: {
          ...origin, appVersion: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'unknown',
          build: Constants.nativeBuildVersion ?? 'unknown', platform: Platform.OS, osVersion: String(Platform.Version ?? 'unknown'),
          sourceLanguageCode: origin.word?.sourceLanguageCode ?? activeCourse.sourceLanguageCode,
          targetLanguageCode: origin.word?.targetLanguageCode ?? activeCourse.targetLanguageCode,
        },
      };
      if (!isFeedbackReport(report)) {
        setError('Add a description or the missing item, choose a reason, and check your optional email address.');
        return;
      }
      await feedbackQueue.enqueue(report);
      // Local persistence is success even when connectivity or email delivery is unavailable.
      setPending(await feedbackQueue.list());
      setSubmitted(report.id);
      setPending(await feedbackQueue.flush());
    } catch {
      setError('Could not complete sending. Your text is still here; please try again.');
    } finally { submitting.current = false; setBusy(false); }
  };

  const close = () => {
    if (!submitted && (message.trim() || correction.trim() || requestedItem.trim() || contactEmail.trim())) {
      Alert.alert('Discard feedback?', 'This draft has not been submitted.', [
        { text: 'Keep writing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else router.back();
  };
  const submittedRow = pending.find((row) => row.report.id === submitted);
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen scroll>
      <View style={styles.header}><AppText variant="title">Send feedback</AppText><Pressable accessibilityRole="button" accessibilityLabel="Close feedback" onPress={close} style={styles.close}><AppText style={{ color: theme.primary }}>Close</AppText></Pressable></View>
      {submitted ? <>
        <AppText variant="heading">{submittedRow?.error ? 'Feedback needs attention' : submittedRow ? 'Saved — waiting to send' : 'Feedback sent'}</AppText>
        <AppText>{submittedRow ? 'Your report is saved on this device. Keep Wordfold installed and open it when connected to send it.' : 'Thank you for helping improve Wordfold. You can return to where you left off.'}</AppText>
        <AppText selectable variant="caption">Reference: {submitted}</AppText>
        <PrimaryButton label="Done" onPress={() => router.back()}/>
      </> : <>
        <AppText style={{ color: theme.muted }}>Help improve Wordfold. No account needed.</AppText>
        <AppText variant="heading">What would you like to tell us?</AppText>
        <View style={styles.options}>{Object.entries(feedbackCategories).map(([value, label]) => <Choice key={value} label={label} selected={category === value} onPress={() => {
          setCategory(value as FeedbackCategory); setReason(value === 'content' ? 'Translation' : value === 'missing' ? 'Word' : '');
        }}/>)}</View>
        {origin.word ? <View style={[styles.preview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppText variant="label">Word included with your report</AppText>
          <AppText variant="heading">{origin.word.term}</AppText>
          <AppText variant="caption">{languageLabel(origin.word.sourceLanguageCode)} → {languageLabel(origin.word.targetLanguageCode)}</AppText>
          <AppText>{origin.word.definition}</AppText>
          {origin.word.translation ? <AppText>Hint: {origin.word.translation}</AppText> : null}
          {origin.word.example ? <AppText>Example: {origin.word.example}</AppText> : null}
        </View> : null}
        {category === 'content' || category === 'missing' ? <View style={styles.options}>
          <AppText variant="label">{category === 'content' ? 'What seems wrong?' : 'What is missing?'}</AppText>
          {(category === 'content' ? contentReasons : ['Word', 'Language', 'Topic']).map((value) => <Choice key={value} label={value} selected={reason === value} onPress={() => setReason(value)}/>)}
        </View> : null}
        {category === 'missing' ? <>
          <FormField label={reason === 'Language' ? 'Which language?' : reason === 'Topic' ? 'Which topic?' : 'Which word?'} value={requestedItem} onChangeText={setRequestedItem} maxLength={200}/>
          {reason === 'Language' ? <View style={styles.options}><Choice label="I want to learn this language" selected={languageRole === 'learn'} onPress={() => setLanguageRole('learn')}/><Choice label="I want hints in this language" selected={languageRole === 'hints'} onPress={() => setLanguageRole('hints')}/></View> : null}
        </> : null}
        <FormField label={category === 'bug' ? 'What happened, and what did you expect?' : 'Tell us more'}
          hint={category === 'content' && origin.word || category === 'missing' ? 'Optional — extra details help us understand.' : 'Required — a short description is enough.'}
          multiline value={message} onChangeText={setMessage} maxLength={4000}/>
        {category === 'content' ? <FormField label="Suggested correction (optional)" multiline value={correction} onChangeText={setCorrection} maxLength={1000}/> : null}
        <FormField label="Contact email (optional)" hint="Only if you’d like us to be able to follow up." value={contactEmail} onChangeText={setContactEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254}/>
        <AppText variant="caption" style={{ color: theme.muted }}>Sending shares this feedback, the word shown above (if any), your language pair, and basic app/device details with Wordfold. Reports are stored privately and emailed to the developer. Your vocabulary library is not attached.</AppText>
        <PrimaryButton label="Send feedback" loading={busy} onPress={() => void submit()}/>
      </>}
      {!feedbackConfigured ? <AppText variant="caption">Sending is unavailable in this build. Submitted reports stay on this device until a configured build can send them.</AppText> : null}
      {error ? <AppText accessibilityRole="alert" style={{ color: theme.danger }}>{error}</AppText> : null}
      {pending.length > 0 ? <View style={styles.options}>
        <AppText variant="heading">Saved feedback · {pending.length}</AppText>
        {pending.map((row) => <View key={row.report.id} style={[styles.preview, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <AppText variant="label">{feedbackCategories[row.report.category]}{row.report.context.word ? ` · ${row.report.context.word.term}` : ''}</AppText>
          <AppText numberOfLines={3}>{row.report.message || row.report.requestedItem || row.report.reason}</AppText>
          <AppText variant="caption">{row.error ?? 'Waiting to send. Retries automatically while Wordfold is open.'}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove saved feedback" style={styles.close} onPress={() => Alert.alert('Remove saved feedback?', 'This removes the local copy. A report already accepted by the server will remain there.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
              void feedbackQueue.remove(row.report.id).then(() => feedbackQueue.list()).then(setPending).catch(() => setError('Could not remove saved feedback.'));
              if (submitted === row.report.id) router.back();
            } },
          ])}><AppText style={{ color: theme.danger }}>Remove</AppText></Pressable>
        </View>)}
        <PrimaryButton label="Try sending saved feedback" variant="secondary" loading={busy} onPress={() => void retry()}/>
      </View> : null}
    </Screen>
  </KeyboardAvoidingView>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={onPress}
    style={[styles.choice, { backgroundColor: selected ? theme.primarySoft : theme.surface, borderColor: selected ? theme.primary : theme.border }]}>
    <AppText style={{ color: selected ? theme.primary : theme.text }}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  options: { gap: spacing.sm }, choice: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderRadius: radii.control, padding: spacing.md },
  preview: { borderWidth: 1, borderRadius: radii.control, padding: spacing.md, gap: spacing.sm },
});
