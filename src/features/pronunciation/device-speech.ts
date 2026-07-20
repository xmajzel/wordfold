import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Speech from 'expo-speech';

const ANDROID_INSTALL_TTS_DATA = 'android.speech.tts.engine.INSTALL_TTS_DATA';

export interface DevicePronunciationCallbacks {
  onStart?(): void;
  onDone?(): void;
  onStopped?(): void;
  onError?(error: Error): void;
}

export type DevicePronunciationResult =
  | { status: 'started'; voice: Speech.Voice }
  | { status: 'missing_voice' };

export function canonicalVoiceLocale(locale: string) {
  return locale.trim().replace(/_/g, '-').toLocaleLowerCase('en');
}

export function selectExactDeviceVoice(voices: Speech.Voice[], locale: string) {
  const canonicalLocale = canonicalVoiceLocale(locale);
  const exactVoices = voices.filter((voice) => canonicalVoiceLocale(voice.language) === canonicalLocale);
  return exactVoices.find((voice) => voice.quality === Speech.VoiceQuality.Enhanced)
    ?? exactVoices[0]
    ?? null;
}

export async function resolveExactDeviceVoice(locale: string) {
  return selectExactDeviceVoice(await Speech.getAvailableVoicesAsync(), locale);
}

export function validateDevicePronunciationInput(text: string) {
  const synthesisInput = text.trim();
  if (!synthesisInput) throw new Error('Add a word before playing its pronunciation.');
  if (synthesisInput.length > Speech.maxSpeechInputLength) {
    throw new Error('This phrase is too long for the device speech engine.');
  }
  return synthesisInput;
}

export async function startDevicePronunciation(
  text: string,
  locale: string,
  callbacks: DevicePronunciationCallbacks = {},
): Promise<DevicePronunciationResult> {
  const synthesisInput = validateDevicePronunciationInput(text);

  const voice = await resolveExactDeviceVoice(locale);
  if (!voice) return { status: 'missing_voice' };

  await Speech.stop();
  Speech.speak(synthesisInput, {
    language: locale,
    voice: voice.identifier,
    pitch: 1,
    rate: 0.9,
    volume: 1,
    useApplicationAudioSession: false,
    onStart: callbacks.onStart,
    onDone: callbacks.onDone,
    onStopped: callbacks.onStopped,
    onError: callbacks.onError,
  });
  return { status: 'started', voice };
}

export async function stopDevicePronunciation() {
  await Speech.stop();
}

export async function openAndroidVoiceInstaller() {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync(ANDROID_INSTALL_TTS_DATA);
    return true;
  } catch {
    return false;
  }
}
