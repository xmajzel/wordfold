import { Asset } from 'expo-asset';

import type { NeuralPronunciationLocale } from '@/features/pronunciation/cloud';
import {
  playPronunciationFile,
  preparePronunciationFilePlayback,
} from '@/features/pronunciation/audio-player';

export const BUNDLED_VOICE_SAMPLE_TEXT = 'Hello! Learning a new language opens the door to new ideas, new places, and new conversations.';

const sampleModules: Record<NeuralPronunciationLocale, number> = {
  'en-US': require('../../../assets/pronunciation/voice-samples/ava-en-US.mp3'),
  'en-GB': require('../../../assets/pronunciation/voice-samples/ryan-en-GB.mp3'),
};

const sampleAssets = new Map<NeuralPronunciationLocale, Promise<Asset>>();
let preloadPromise: Promise<void> | null = null;

function loadSample(locale: NeuralPronunciationLocale) {
  const existing = sampleAssets.get(locale);
  if (existing) return existing;
  const operation = Asset.loadAsync(sampleModules[locale]).then(([asset]) => {
    if (!asset) throw new Error(`The bundled ${locale} voice sample is unavailable.`);
    return asset;
  }).catch((error) => {
    sampleAssets.delete(locale);
    throw error;
  });
  sampleAssets.set(locale, operation);
  return operation;
}

export function preloadBundledVoiceSamples() {
  if (preloadPromise) return preloadPromise;
  preloadPromise = Promise.all([
    loadSample('en-US'),
    loadSample('en-GB'),
    preparePronunciationFilePlayback(),
  ]).then(() => undefined).catch((error) => {
    preloadPromise = null;
    throw error;
  });
  return preloadPromise;
}

export async function playBundledVoiceSample(locale: NeuralPronunciationLocale) {
  const [asset] = await Promise.all([
    loadSample(locale),
    preparePronunciationFilePlayback(),
  ]);
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error(`The bundled ${locale} voice sample has no playable location.`);
  await playPronunciationFile(uri);
}
