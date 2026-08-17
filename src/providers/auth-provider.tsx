import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { AuthError, Session, User } from '@supabase/supabase-js';

import { parseAuthCallbackUrl } from '@/data/supabase/auth-callback';
import { supabase, supabaseConfigurationError } from '@/data/supabase/client';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'unavailable';

export type AuthActionResult =
  | { ok: true; outcome: 'signedIn' | 'confirmationRequired' | 'signedOut' }
  | { ok: false; message: string };

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  message: string | null;
  clearMessage(): void;
  signIn(email: string, password: string): Promise<AuthActionResult>;
  signUp(email: string, password: string): Promise<AuthActionResult>;
  signOut(): Promise<AuthActionResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function safeAuthMessage(error: AuthError | Error, action: 'signIn' | 'signUp' | 'signOut' | 'confirm') {
  const code = 'code' in error ? error.code : undefined;
  if (code === 'invalid_credentials') return 'The email or password is incorrect.';
  if (code === 'email_not_confirmed') return 'Confirm your email before signing in.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Too many attempts. Please wait and try again.';
  if (code === 'signup_disabled') return 'New account creation is currently unavailable.';
  if (code === 'weak_password') return 'Choose a stronger password and try again.';
  if (error instanceof TypeError) return 'Account services could not be reached. Check your connection and try again.';
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
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState<string | null>(supabaseConfigurationError);
  const handledCallbackUrls = useRef(new Set<string>());

  const applySession = useCallback((nextSession: Session | null) => {
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
      if (active) applySession(nextSession);
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
    const parsed = parseAuthCallbackUrl(url, Linking.createURL('account'));
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
      setMessage('Email confirmed. Your account is now signed in.');
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
        options: { emailRedirectTo: Linking.createURL('account') },
      });
      if (error) return { ok: false, message: safeAuthMessage(error, 'signUp') };
      if (!data.session) return { ok: true, outcome: 'confirmationRequired' };
      applySession(data.session);
      return { ok: true, outcome: 'signedIn' };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error instanceof Error ? error : new Error(), 'signUp') };
    }
  }, [applySession]);

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
    clearMessage: () => setMessage(null),
    signIn,
    signUp,
    signOut,
  }), [message, session, signIn, signOut, signUp, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
