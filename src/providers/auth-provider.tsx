import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { AuthError, Session, User } from '@supabase/supabase-js';

import { authRedirectUrl } from '@/data/supabase/auth-redirect';
import { parseAuthCallbackUrl } from '@/data/supabase/auth-callback';
import { supabase, supabaseConfigurationError } from '@/data/supabase/client';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'unavailable';

export type AuthActionResult =
  | { ok: true; outcome: 'signedIn' | 'confirmationRequired' | 'signedOut' | 'resetEmailSent' | 'passwordUpdated' }
  | { ok: false; message: string };

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  message: string | null;
  passwordRecovery: boolean;
  requestPasswordReset(email: string): Promise<AuthActionResult>;
  updatePassword(password: string): Promise<AuthActionResult>;
  clearMessage(): void;
  signIn(email: string, password: string): Promise<AuthActionResult>;
  signUp(email: string, password: string): Promise<AuthActionResult>;
  signOut(): Promise<AuthActionResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function safeAuthMessage(error: AuthError | Error, action: 'signIn' | 'signUp' | 'signOut' | 'confirm' | 'reset' | 'updatePassword') {
  const code = 'code' in error ? error.code : undefined;
  if (code === 'invalid_credentials') return 'The email or password is incorrect.';
  if (code === 'email_not_confirmed') return 'Confirm your email before signing in.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Too many attempts. Please wait and try again.';
  if (code === 'signup_disabled') return 'New account creation is currently unavailable.';
  if (code === 'same_password') return 'Choose a password different from your current password.';
  if (action === 'updatePassword' && (code === 'session_not_found' || code === 'refresh_token_not_found')) return 'Your reset session has expired. Request a new reset link.';
  if (code === 'weak_password') return 'Choose a stronger password and try again.';
  if (error instanceof TypeError) return 'Account services could not be reached. Check your connection and try again.';
  if (action === 'reset') return 'The reset email could not be sent. Please try again.';
  if (action === 'updatePassword') return 'Your password could not be updated. Please try again or request a new reset link.';
  if (action === 'signIn') return 'Sign in could not be completed. Please try again.';
  if (action === 'signUp') return 'Account creation could not be completed. Please try again.';
  if (action === 'signOut') return 'Sign out could not be completed. Please try again.';
  return 'Email confirmation could not be completed. Please try signing in.';
}

function statusFor(session: Session | null): AuthStatus {
  return session ? 'signedIn' : 'signedOut';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'unavailable');
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState<string | null>(supabaseConfigurationError);
  const handledCallbackUrls = useRef(new Set<string>());

  const applySession = useCallback((nextSession: Session | null) => {
    if (!nextSession) setPasswordRecovery(false);
    setSession(nextSession);
    setStatus(statusFor(nextSession));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authEventVersion = 0;
    const versionBeforeInitialRead = authEventVersion;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventVersion += 1;
      if (active) {
        if (_event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
        applySession(nextSession);
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventVersion !== versionBeforeInitialRead) return;
      if (error) {
        setMessage(safeAuthMessage(error, 'signIn'));
        applySession(null);
        return;
      }
      applySession(data.session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    if (!supabase || Platform.OS === 'web') return;
    const client = supabase;
    const updateRefresh = (state: string) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    updateRefresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', updateRefresh);
    return () => {
      subscription.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);

  const handleCallback = useCallback(async (url: string) => {
    if (!supabase || handledCallbackUrls.current.has(url)) return;
    const parsed = parseAuthCallbackUrl(url, authRedirectUrl());
    if (parsed.type === 'unrelated') return;
    handledCallbackUrls.current.add(url);
    if (parsed.type === 'error') {
      setMessage(parsed.message);
      return;
    }
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (error) {
        handledCallbackUrls.current.delete(url);
        setMessage(safeAuthMessage(error, 'confirm'));
        return;
      }
      applySession(data.session);
      setPasswordRecovery(Boolean(parsed.recovery));
      setMessage(parsed.recovery ? 'Choose a new password below.' : 'Email confirmed. Your account is now signed in.');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.hash = '';
        for (const key of ['access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at', 'type']) cleanUrl.searchParams.delete(key);
        window.history.replaceState(window.history.state, '', cleanUrl.pathname + cleanUrl.search);
      }
    } catch (error) {
      handledCallbackUrls.current.delete(url);
      setMessage(safeAuthMessage(error instanceof Error ? error : new Error(), 'confirm'));
    }
  }, [applySession]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void Linking.getInitialURL().then((url) => {
      if (active && url) void handleCallback(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => void handleCallback(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleCallback]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) return { ok: false, message: supabaseConfigurationError ?? 'Account services are unavailable.' };
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) return { ok: false, message: safeAuthMessage(error, 'signIn') };
      applySession(data.session);
      return { ok: true, outcome: 'signedIn' };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error instanceof Error ? error : new Error(), 'signIn') };
    }
  }, [applySession]);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) return { ok: false, message: supabaseConfigurationError ?? 'Account services are unavailable.' };
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) return { ok: false, message: safeAuthMessage(error, 'signUp') };
      if (!data.session) return { ok: true, outcome: 'confirmationRequired' };
      applySession(data.session);
      return { ok: true, outcome: 'signedIn' };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error instanceof Error ? error : new Error(), 'signUp') };
    }
  }, [applySession]);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    if (!supabase) return { ok: false, message: supabaseConfigurationError ?? 'Account services are unavailable.' };
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: authRedirectUrl(),
      });
      if (error) return { ok: false, message: safeAuthMessage(error, 'reset') };
      return { ok: true, outcome: 'resetEmailSent' };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error instanceof Error ? error : new Error(), 'reset') };
    }
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthActionResult> => {
    if (!supabase || !session || !passwordRecovery) return { ok: false, message: 'Open a new password reset link from your email first.' };
    if (password.length < 8) return { ok: false, message: 'Use at least 8 characters for your password.' };
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { ok: false, message: safeAuthMessage(error, 'updatePassword') };
      setPasswordRecovery(false);
      setMessage('Password updated. You are signed in.');
      return { ok: true, outcome: 'passwordUpdated' };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error instanceof Error ? error : new Error(), 'updatePassword') };
    }
  }, [passwordRecovery, session]);

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) return { ok: false, message: supabaseConfigurationError ?? 'Account services are unavailable.' };
    setMessage(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) return { ok: false, message: safeAuthMessage(error, 'signOut') };
      applySession(null);
      return { ok: true, outcome: 'signedOut' };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error instanceof Error ? error : new Error(), 'signOut') };
    }
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    user: session?.user ?? null,
    message,
    passwordRecovery,
    requestPasswordReset,
    updatePassword,
    clearMessage: () => setMessage(null),
    signIn,
    signUp,
    signOut,
  }), [message, session, signIn, signOut, signUp, status, passwordRecovery, requestPasswordReset, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
