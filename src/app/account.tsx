import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';
import { useSync } from '@/providers/sync-provider';
import { radii, spacing } from '@/theme/tokens';

type FormMode = 'signIn' | 'signUp';

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function AccountScreen() {
  const theme = useAppTheme();
  const auth = useAuth();
  const sync = useSync();
  const [mode, setMode] = useState<FormMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);

  const changeMode = (nextMode: FormMode) => {
    setMode(nextMode);
    setFormMessage(null);
    setConfirmationPending(false);
    auth.clearMessage();
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) {
      setFormMessage('Enter a valid email address.');
      return;
    }
    if (!password) {
      setFormMessage('Enter your password.');
      return;
    }
    if (mode === 'signUp' && password.length < 8) {
      setFormMessage('Use at least 8 characters for your password.');
      return;
    }
    if (mode === 'signUp' && password !== passwordConfirmation) {
      setFormMessage('The passwords do not match.');
      return;
    }

    setSubmitting(true);
    setFormMessage(null);
    try {
      const result = mode === 'signIn'
        ? await auth.signIn(normalizedEmail, password)
        : await auth.signUp(normalizedEmail, password);
      if (!result.ok) {
        setFormMessage(result.message);
        return;
      }
      if (result.outcome === 'confirmationRequired') {
        setConfirmationPending(true);
        setPassword('');
        setPasswordConfirmation('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    setSubmitting(true);
    setFormMessage(null);
    try {
      try {
        await sync.clearBeforeSignOut();
      } catch {
        setFormMessage('Sign out could not safely clear synchronized data. Please try again.');
        return;
      }
      const result = await auth.signOut();
      if (!result.ok) setFormMessage(result.message);
      else setConfirmationPending(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={[styles.close, { backgroundColor: theme.surface }]}>
          <Ionicons name="close" color={theme.text} size={22}/>
        </Pressable>
        <AppText variant="title">Account</AppText>
        <View style={styles.close}/>
      </View>

      {auth.status === 'loading' ? (
        <View style={[styles.panel, styles.center, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ActivityIndicator color={theme.primary}/>
          <AppText style={{ color: theme.muted }}>Checking this device for an account…</AppText>
        </View>
      ) : null}

      {auth.status === 'unavailable' ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Ionicons name="cloud-offline-outline" color={theme.primary} size={26}/></View>
          <AppText variant="heading">Account services unavailable</AppText>
          <AppText style={{ color: theme.muted }}>{auth.message ?? 'Account services are not configured for this build.'}</AppText>
          <AppText variant="caption" style={{ color: theme.muted }}>Your vocabulary remains available locally on this device.</AppText>
        </View>
      ) : null}

      {auth.status === 'signedIn' ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Ionicons name="person-circle-outline" color={theme.primary} size={28}/></View>
          <View style={styles.textGroup}>
            <AppText variant="heading">Signed in</AppText>
            <AppText>{auth.user?.email ?? 'Confirmed account'}</AppText>
          </View>
          <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name={sync.phase === 'connected' ? 'cloud-done-outline' : sync.phase === 'error' || sync.phase === 'unavailable' ? 'cloud-offline-outline' : 'cloud-outline'} color={theme.primary} size={20}/>
            <AppText style={styles.flex}>{sync.message ?? 'Your vocabulary remains stored locally on this device.'}</AppText>
          </View>
          {auth.message || formMessage ? <Message text={formMessage ?? auth.message!} color={formMessage ? theme.danger : theme.success}/> : null}
          <PrimaryButton label="Sign out of this device" variant="secondary" loading={submitting} onPress={() => void signOut()}/>
        </View>
      ) : null}

      {auth.status === 'signedOut' && confirmationPending ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Ionicons name="mail-unread-outline" color={theme.primary} size={26}/></View>
          <AppText variant="heading">Check your email</AppText>
          <AppText style={{ color: theme.muted }}>We sent a confirmation link to {email.trim().toLowerCase()}. Open it to finish creating your account.</AppText>
          <AppText variant="caption" style={{ color: theme.muted }}>You can continue using Wordfold locally while you wait.</AppText>
          <PrimaryButton label="Back to sign in" variant="secondary" onPress={() => changeMode('signIn')}/>
        </View>
      ) : null}

      {auth.status === 'signedOut' && !confirmationPending ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.segment}>
            <ModeButton selected={mode === 'signIn'} label="Sign in" onPress={() => changeMode('signIn')}/>
            <ModeButton selected={mode === 'signUp'} label="Create account" onPress={() => changeMode('signUp')}/>
          </View>
          <View style={styles.textGroup}>
            <AppText variant="heading">{mode === 'signIn' ? 'Welcome back' : 'Create your account'}</AppText>
            <AppText style={{ color: theme.muted }}>{mode === 'signIn'
              ? 'Sign in with your confirmed email and password.'
              : 'You will need to confirm your email before the account is ready.'}</AppText>
          </View>
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            secureTextEntry
            returnKeyType={mode === 'signUp' ? 'next' : 'done'}
            onSubmitEditing={mode === 'signIn' ? () => void submit() : undefined}
          />
          {mode === 'signUp' ? (
            <FormField
              label="Confirm password"
              value={passwordConfirmation}
              onChangeText={setPasswordConfirmation}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              hint="Use at least 8 characters."
            />
          ) : null}
          {auth.message || formMessage ? <Message text={formMessage ?? auth.message!} color={theme.danger}/> : null}
          <PrimaryButton label={mode === 'signIn' ? 'Sign in' : 'Create account'} loading={submitting} onPress={() => void submit()}/>
          <AppText variant="caption" style={[styles.centerText, { color: theme.muted }]}>Signing in does not upload or change your local vocabulary during this phase.</AppText>
        </View>
      ) : null}
    </Screen>
  );
}

function ModeButton({ selected, label, onPress }: { selected: boolean; label: string; onPress(): void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.modeButton, { backgroundColor: selected ? theme.surface : 'transparent' }]}><AppText variant="label" style={{ color: selected ? theme.primary : theme.muted }}>{label}</AppText></Pressable>;
}

function Message({ text, color }: { text: string; color: string }) {
  return <AppText accessibilityLiveRegion="polite" style={{ color }}>{text}</AppText>;
}

const styles = StyleSheet.create({
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.lg },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  icon: { width: 52, height: 52, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  textGroup: { gap: spacing.sm },
  notice: { borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  segment: { flexDirection: 'row', padding: spacing.xs, borderRadius: radii.control, backgroundColor: '#0000000A' },
  modeButton: { flex: 1, minHeight: 42, borderRadius: radii.control - spacing.xs, alignItems: 'center', justifyContent: 'center' },
});
