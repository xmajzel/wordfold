import type { Voice } from 'expo-speech';
import * as Speech from 'expo-speech';

import {
  canonicalVoiceLocale,
  selectExactDeviceVoice,
  startDevicePronunciation,
} from './device-speech';

jest.mock('expo-speech', () => ({
  VoiceQuality: { Default: 'Default', Enhanced: 'Enhanced' },
  maxSpeechInputLength: 100,
  getAvailableVoicesAsync: jest.fn(),
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
}));

jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));

const defaultVoice: Voice = {
  identifier: 'voice-default', name: 'Default Spanish', quality: Speech.VoiceQuality.Default, language: 'es_MX',
};
const enhancedVoice: Voice = {
  identifier: 'voice-enhanced', name: 'Enhanced Spanish', quality: Speech.VoiceQuality.Enhanced, language: 'es-MX',
};

describe('device pronunciation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValue([defaultVoice, enhancedVoice]);
  });

  it('canonicalizes locale separators and case for comparison', () => {
    expect(canonicalVoiceLocale(' ES_mx ')).toBe('es-mx');
  });

  it.each(['en-US', 'en-GB', 'es-ES', 'es-MX', 'de-DE', 'el-GR', 'sk-SK'])(
    'selects the configured exact locale %s',
    (locale) => {
      const voice = { ...defaultVoice, identifier: locale, language: locale };

      expect(selectExactDeviceVoice([voice], locale)).toBe(voice);
    },
  );

  it('selects an enhanced exact-region voice without falling back to another region', () => {
    const voices = [
      { ...enhancedVoice, identifier: 'spain', language: 'es-ES' },
      defaultVoice,
      enhancedVoice,
    ];

    expect(selectExactDeviceVoice(voices, 'es-MX')).toBe(enhancedVoice);
    expect(selectExactDeviceVoice(voices, 'en-US')).toBeNull();
  });

  it('stops queued speech and starts the exact voice with learning-friendly settings', async () => {
    const callbacks = { onStart: jest.fn(), onDone: jest.fn(), onStopped: jest.fn(), onError: jest.fn() };

    await expect(startDevicePronunciation('  hola  ', 'es-MX', callbacks)).resolves.toEqual({
      status: 'started', voice: enhancedVoice,
    });

    expect(Speech.stop).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledWith('hola', expect.objectContaining({
      language: 'es-MX', voice: 'voice-enhanced', pitch: 1, rate: 0.9, volume: 1,
      useApplicationAudioSession: false, ...callbacks,
    }));
  });

  it('does not ask the platform to speak when the exact locale is unavailable', async () => {
    (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValue([
      { ...defaultVoice, language: 'es-ES' },
    ]);

    await expect(startDevicePronunciation('hola', 'es-MX')).resolves.toEqual({ status: 'missing_voice' });

    expect(Speech.stop).not.toHaveBeenCalled();
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('rejects empty or overlong synthesis input before checking voices', async () => {
    await expect(startDevicePronunciation('   ', 'en-US')).rejects.toThrow('Add a word');
    await expect(startDevicePronunciation('x'.repeat(101), 'en-US')).rejects.toThrow('too long');
    expect(Speech.getAvailableVoicesAsync).not.toHaveBeenCalled();
  });
});
