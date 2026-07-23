import { createContext, useContext } from 'react';

export type PrivatePronunciationConsentStatus =
  | 'loading'
  | 'disabled'
  | 'enabled'
  | 'deletion_pending';

export type PrivatePronunciationConsentValue = {
  status: PrivatePronunciationConsentStatus;
  userId: string | null;
  enable(): Promise<void>;
  disableAndDelete(): Promise<void>;
  retryDeletion(): Promise<void>;
};

export const PrivatePronunciationConsentContext =
  createContext<PrivatePronunciationConsentValue | null>(null);

export function usePrivatePronunciationConsent() {
  const value = useContext(PrivatePronunciationConsentContext);
  if (!value) {
    throw new Error(
      'usePrivatePronunciationConsent must be used inside PrivatePronunciationConsentProvider',
    );
  }
  return value;
}
