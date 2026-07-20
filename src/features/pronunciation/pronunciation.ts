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

export type PronunciationResult = DevicePronunciationResult | { status: 'stopped' };

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
