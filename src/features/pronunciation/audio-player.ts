import type { AudioPlayer } from 'expo-audio';

import type { DevicePronunciationCallbacks } from '@/features/pronunciation/device-speech';

const LOAD_TIMEOUT_MS = 8_000;

let activePlayer: AudioPlayer | null = null;
let activeStop: (() => void) | null = null;
let audioModeReady: Promise<void> | null = null;
let expoAudio: Promise<typeof import('expo-audio')> | null = null;

function loadExpoAudio() {
  expoAudio ??= import('expo-audio');
  return expoAudio;
}

async function configureAudioMode() {
  const { setAudioModeAsync } = await loadExpoAudio();
  audioModeReady ??= setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers',
  }).catch((error) => {
    audioModeReady = null;
    throw error;
  });
  return audioModeReady;
}

export async function stopPronunciationFilePlayback() {
  const stop = activeStop;
  activeStop = null;
  if (stop) {
    stop();
    return;
  }
  const player = activePlayer;
  activePlayer = null;
  if (!player) return;
  player.pause();
  player.remove();
}

export async function playPronunciationFile(
  uri: string,
  callbacks: DevicePronunciationCallbacks = {},
) {
  await stopPronunciationFilePlayback();
  await configureAudioMode();

  const { createAudioPlayer } = await loadExpoAudio();
  const player = createAudioPlayer({ uri }, { updateInterval: 100 });
  activePlayer = player;
  await new Promise<void>((resolve, reject) => {
    let started = false;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let subscription: { remove(): void } | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscription?.remove();
      if (activeStop === stopCurrent) activeStop = null;
      if (activePlayer === player) activePlayer = null;
      player.remove();
      if (error) reject(error);
      else resolve();
    };
    const fail = (error: Error) => {
      if (started) {
        callbacks.onError?.(error);
        finish();
      } else {
        finish(error);
      }
    };
    const stopCurrent = () => {
      callbacks.onStopped?.();
      finish();
    };
    activeStop = stopCurrent;
    subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.error) {
        fail(new Error(status.error));
        return;
      }
      if (status.isLoaded && !started) {
        started = true;
        player.play();
        callbacks.onStart?.();
        return;
      }
      if (status.didJustFinish) {
        callbacks.onDone?.();
        finish();
      }
    });
    timeout = setTimeout(() => fail(new Error('Pronunciation audio could not be loaded.')), LOAD_TIMEOUT_MS);
    const initialStatus = player.currentStatus;
    if (initialStatus.error) fail(new Error(initialStatus.error));
    else if (initialStatus.isLoaded && !started) {
      started = true;
      player.play();
      callbacks.onStart?.();
    }
  });
}
