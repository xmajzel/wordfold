import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { clearPrivateNeuralPronunciationCache } from '@/features/pronunciation/private-cache';
import { deletePrivateNeuralPronunciation } from '@/features/pronunciation/private-cloud';
import { useAuth } from '@/providers/auth-provider';

export const PRIVATE_PRONUNCIATION_DISCLOSURE_VERSION = '2026-07-23';

export type PrivatePronunciationConsentStatus =
  | 'loading'
  | 'disabled'
  | 'enabled'
  | 'deletion_pending';

type StoredConsent = {
  schemaVersion: 1;
  disclosureVersion: typeof PRIVATE_PRONUNCIATION_DISCLOSURE_VERSION;
  state: 'enabled' | 'deletion_pending';
  enabledAt: string;
};

type PrivatePronunciationConsentValue = {
  status: PrivatePronunciationConsentStatus;
  userId: string | null;
  enable(): Promise<void>;
  disableAndDelete(): Promise<void>;
  retryDeletion(): Promise<void>;
};

const PrivatePronunciationConsentContext =
  createContext<PrivatePronunciationConsentValue | null>(null);

async function consentKey(userId: string) {
  const accountHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    userId,
  );
  return `wordfold.privatePronunciationConsent.v1.${accountHash}`;
}

function parseStoredConsent(value: string | null): StoredConsent | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredConsent>;
    if (parsed.schemaVersion !== 1
      || parsed.disclosureVersion !== PRIVATE_PRONUNCIATION_DISCLOSURE_VERSION
      || (parsed.state !== 'enabled' && parsed.state !== 'deletion_pending')
      || typeof parsed.enabledAt !== 'string'
      || !Number.isFinite(Date.parse(parsed.enabledAt))) return null;
    return parsed as StoredConsent;
  } catch {
    return null;
  }
}

export function PrivatePronunciationConsentProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const [status, setStatus] = useState<PrivatePronunciationConsentStatus>('loading');
  const generation = useRef(0);
  const operation = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    operation.current = null;
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('disabled');
      return;
    }
    setStatus('loading');
    void (async () => {
      const key = await consentKey(userId);
      const raw = await AsyncStorage.getItem(key);
      const stored = parseStoredConsent(raw);
      if (!stored && raw !== null) await AsyncStorage.removeItem(key);
      if (generation.current === currentGeneration) {
        setStatus(stored?.state ?? 'disabled');
      }
    })().catch(() => {
      if (generation.current === currentGeneration) setStatus('disabled');
    });
  }, [userId]);

  const enable = useCallback(async () => {
    if (!userId) throw new Error('Sign in before enabling cloud neural pronunciation.');
    if (status === 'deletion_pending') {
      throw new Error('Finish deleting previous cloud pronunciation data before enabling it again.');
    }
    const key = await consentKey(userId);
    const stored: StoredConsent = {
      schemaVersion: 1,
      disclosureVersion: PRIVATE_PRONUNCIATION_DISCLOSURE_VERSION,
      state: 'enabled',
      enabledAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(stored));
    setStatus('enabled');
  }, [status, userId]);

  const performDeletion = useCallback(async () => {
    if (!userId) throw new Error('Sign in to finish deleting cloud pronunciation data.');
    if (operation.current) return operation.current;
    const task = (async () => {
      const key = await consentKey(userId);
      const existing = parseStoredConsent(await AsyncStorage.getItem(key));
      const pending: StoredConsent = {
        schemaVersion: 1,
        disclosureVersion: PRIVATE_PRONUNCIATION_DISCLOSURE_VERSION,
        state: 'deletion_pending',
        enabledAt: existing?.enabledAt ?? new Date().toISOString(),
      };
      await AsyncStorage.setItem(key, JSON.stringify(pending));
      setStatus('deletion_pending');

      const results = await Promise.allSettled([
        clearPrivateNeuralPronunciationCache(userId),
        deletePrivateNeuralPronunciation(),
      ]);
      if (results.some((result) => result.status === 'rejected')) {
        throw new Error('Cloud pronunciation is off, but its saved audio could not be fully deleted. Try again when online.');
      }
      await AsyncStorage.removeItem(key);
      setStatus('disabled');
    })().finally(() => {
      operation.current = null;
    });
    operation.current = task;
    return task;
  }, [userId]);

  const value = useMemo<PrivatePronunciationConsentValue>(() => ({
    status,
    userId,
    enable,
    disableAndDelete: performDeletion,
    retryDeletion: performDeletion,
  }), [enable, performDeletion, status, userId]);

  return <PrivatePronunciationConsentContext.Provider value={value}>
    {children}
  </PrivatePronunciationConsentContext.Provider>;
}

export function usePrivatePronunciationConsent() {
  const value = useContext(PrivatePronunciationConsentContext);
  if (!value) {
    throw new Error(
      'usePrivatePronunciationConsent must be used inside PrivatePronunciationConsentProvider',
    );
  }
  return value;
}
