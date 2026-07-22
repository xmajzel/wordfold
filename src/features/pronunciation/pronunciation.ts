import { Platform } from 'react-native';

import { playPronunciationFile, stopPronunciationFilePlayback } from '@/features/pronunciation/audio-player';
import {
  deleteCachedPronunciationFile,
  getCachedPronunciationFile,
  type PronunciationCacheScope,
} from '@/features/pronunciation/cache';
import {
  resolveExactDeviceVoice,
  startDevicePronunciation,
  stopDevicePronunciation,
  validateDevicePronunciationInput,
  type DevicePronunciationCallbacks,
  type DevicePronunciationResult,
} from '@/features/pronunciation/device-speech';
import {
  requestNeuralPronunciation,
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';
import {
  cacheNeuralPronunciationFile,
  deleteCachedNeuralPronunciation,
  getCachedNeuralPronunciationFile,
} from '@/features/pronunciation/public-cache';
import {
  deleteOfflinePronunciationFile,
  getOfflinePronunciationFile,
} from '@/features/pronunciation/offline-store';

export type PronunciationResult = DevicePronunciationResult | { status: 'stopped' };
export type NeuralPronunciationResult =
  | { status: 'started' }
  | { status: 'pending'; retryAfterSeconds: number }
  | { status: 'stopped' };

export type NeuralPronunciationOptions = {
  cloudAllowed?: boolean;
};

let operationId = 0;

async function stopPlayers() {
  await Promise.all([stopPronunciationFilePlayback(), stopDevicePronunciation()]);
}

export async function stopPronunciation() {
  operationId += 1;
  await stopPlayers();
}

export async function startPronunciation(
  text: string,
  locale: string,
  scope: PronunciationCacheScope,
  callbacks: DevicePronunciationCallbacks = {},
): Promise<PronunciationResult> {
  const synthesisInput = validateDevicePronunciationInput(text);
  const currentOperation = operationId + 1;
  operationId = currentOperation;
  await stopPlayers();
  if (Platform.OS === 'web') {
    if (operationId !== currentOperation) return { status: 'stopped' };
    return startDevicePronunciation(synthesisInput, locale, callbacks);
  }

  const voice = await resolveExactDeviceVoice(locale);
  if (operationId !== currentOperation) return { status: 'stopped' };
  if (!voice) return { status: 'missing_voice' };

  let fallbackStarted = false;
  const startLiveFallback = async (cacheError: unknown) => {
    if (fallbackStarted || operationId !== currentOperation) return;
    fallbackStarted = true;
    try {
      const result = await startDevicePronunciation(synthesisInput, locale, callbacks);
      if (result.status === 'missing_voice') {
        callbacks.onError?.(new Error('The exact requested device voice is no longer installed.'));
      }
    } catch (fallbackError) {
      const cacheMessage = cacheError instanceof Error ? cacheError.message : 'Cached pronunciation failed.';
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Live device speech failed.';
      callbacks.onError?.(new Error(`${cacheMessage} ${fallbackMessage}`));
    }
  };

  try {
    const file = await getCachedPronunciationFile({
      text: synthesisInput,
      locale,
      voiceIdentifier: voice.identifier,
      scope,
    });
    if (operationId !== currentOperation) return { status: 'stopped' };
    try {
      await playPronunciationFile(file.uri, {
        ...callbacks,
        onError: (error) => {
          deleteCachedPronunciationFile(file);
          void startLiveFallback(error);
        },
      });
    } catch (error) {
      deleteCachedPronunciationFile(file);
      await startLiveFallback(error);
    }
  } catch (error) {
    await startLiveFallback(error);
  }
  if (operationId !== currentOperation) return { status: 'stopped' };
  return { status: 'started', voice };
}

export async function startNeuralPronunciation(
  catalogSenseId: string,
  locale: NeuralPronunciationLocale,
  callbacks: DevicePronunciationCallbacks = {},
  options: NeuralPronunciationOptions = {},
): Promise<NeuralPronunciationResult> {
  const currentOperation = operationId + 1;
  operationId = currentOperation;
  await stopPlayers();

  let file = await getOfflinePronunciationFile(catalogSenseId, locale);
  let durableOfflineFile = file !== null;
  if (operationId !== currentOperation) return { status: 'stopped' };
  if (!file) file = await getCachedNeuralPronunciationFile(catalogSenseId, locale);
  if (operationId !== currentOperation) return { status: 'stopped' };
  if (!file) {
    if (options.cloudAllowed === false) {
      throw new Error('This downloaded pronunciation is no longer available. Download the pack again in Settings.');
    }
    const response = await requestNeuralPronunciation(catalogSenseId, locale);
    if (operationId !== currentOperation) return { status: 'stopped' };
    if (response.status === 'pending') return response;
    file = await cacheNeuralPronunciationFile(catalogSenseId, response.asset);
    durableOfflineFile = false;
    if (operationId !== currentOperation) return { status: 'stopped' };
  }

  try {
    await playPronunciationFile(file.uri, {
      ...callbacks,
      onError: (error) => {
        if (durableOfflineFile) void deleteOfflinePronunciationFile(catalogSenseId, locale);
        else void deleteCachedNeuralPronunciation(catalogSenseId, locale);
        callbacks.onError?.(error);
      },
    });
  } catch (error) {
    if (durableOfflineFile) await deleteOfflinePronunciationFile(catalogSenseId, locale);
    else await deleteCachedNeuralPronunciation(catalogSenseId, locale);
    throw error;
  }
  if (operationId !== currentOperation) return { status: 'stopped' };
  return { status: 'started' };
}
