import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { NeuralPronunciationLocale } from '@/features/pronunciation/cloud';
import { useOfflinePronunciationDownloads } from '@/features/pronunciation/offline-downloads-provider';
import { neuralPreviewFeatureEnabled } from '@/features/pronunciation/cloud';
import { useAppData } from '@/providers/app-data-provider';

export function PronunciationLibraryDownloadCoordinator() {
  const { words, onboardingComplete, pronunciationVoicePreference } = useAppData();
  const downloads = useOfflinePronunciationDownloads();
  const [activation, setActivation] = useState(0);
  const attempted = useRef<string | null>(null);
  const locale: NeuralPronunciationLocale | null = pronunciationVoicePreference === 'neural-en-US'
    ? 'en-US'
    : pronunciationVoicePreference === 'neural-en-GB' ? 'en-GB' : null;
  const catalogSenseIds = useMemo(() => [...new Set(words.flatMap((word) => (
    word.sourceLanguageCode === 'en' && word.catalogSenseId ? [word.catalogSenseId] : []
  )))].sort(), [words]);
  const packSignature = Object.values(downloads.packs)
    .map((pack) => `${pack.locale}:${pack.level}:${pack.downloadedCount}`)
    .join('|');
  const signature = `${locale ?? 'device'}:${catalogSenseIds.join(',')}:${packSignature}:${activation}`;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setActivation((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!locale || !onboardingComplete || !neuralPreviewFeatureEnabled()
      || attempted.current === signature || downloads.job || downloads.libraryJob) return;
    attempted.current = signature;
    const timeout = setTimeout(() => {
      void downloads.reconcileLibrary(locale, catalogSenseIds).catch((error) => {
        console.warn('Could not update offline library pronunciations.', error);
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [catalogSenseIds, downloads, locale, onboardingComplete, signature]);

  return null;
}
