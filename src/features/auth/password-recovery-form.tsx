import { useRef, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';
import { spacing } from '@/theme/tokens';

export function PasswordRecoveryForm({ recovery, initialEmail = '', onBack }: {
  recovery: boolean; initialEmail?: string; onBack(): void;
}) {
  const auth = useAuth();
  const theme = useAppTheme();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (pending.current) return;
    setError(null);
    if (!recovery && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.'); return;
    }
    if (recovery && password.length < 8) {
      setError('Use at least 8 characters for your password.'); return;
    }
    if (recovery && password !== confirmation) {
      setError('The passwords do not match.'); return;
    }
    pending.current = true; setBusy(true);
    try {
      const result = recovery ? await auth.updatePassword(password) : await auth.requestPasswordReset(email.trim().toLowerCase());
      if (!result.ok) setError(result.message);
      else { setPassword(''); setConfirmation(''); if (!recovery) setSent(true); }
    } catch { setError('Account services could not be reached. Please try again.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <View style={{ gap: spacing.lg }}>
    <AppText variant="heading">{recovery ? 'Choose a new password' : sent ? 'Check your email' : 'Reset your password'}</AppText>
    {sent ? <AppText>If an account exists for {email.trim().toLowerCase()}, a password reset link will arrive shortly. Open it on this device.</AppText> : recovery ? <>
      <AppText>{auth.user?.email}</AppText>
      <FormField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!busy} hint="Use at least 8 characters."/>
      <FormField label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!busy} onSubmitEditing={() => void submit()}/>
    </> : <>
      <AppText>Enter your account email. We will send a link to choose a new password.</AppText>
      <FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" editable={!busy} onSubmitEditing={() => void submit()}/>
    </>}
    {error ? <AppText accessibilityRole="alert" style={{ color: theme.danger }}>{error}</AppText> : null}
    {!sent ? <PrimaryButton label={recovery ? 'Save new password' : 'Send reset link'} loading={busy} onPress={() => void submit()}/> : null}
    <PrimaryButton label={recovery ? 'Cancel password reset' : 'Back to sign in'} variant="secondary" disabled={busy} onPress={onBack}/>
  </View>;
}
