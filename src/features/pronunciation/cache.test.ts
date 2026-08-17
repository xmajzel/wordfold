import { Platform } from 'react-native';

import { pronunciationCacheKey } from './cache';

const mockDigestStringAsync = jest.fn(async (_algorithm: string, value: string) => value);

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: (...args: unknown[]) => mockDigestStringAsync(...args as [string, string]),
  randomUUID: () => 'uuid',
}));

jest.mock('expo-file-system', () => ({
  Directory: class Directory {},
  File: class File {},
  Paths: { cache: {} },
}));

jest.mock('../../../modules/wordfold-pronunciation', () => ({ default: null }));

describe('pronunciation cache identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  it('uses exact case-preserved trimmed text, locale, voice, platform, settings, and format', async () => {
    const identity = await pronunciationCacheKey({
      text: '  Polish  ', locale: 'en-GB', voiceIdentifier: 'com.apple.voice.enhanced',
    });

    expect(JSON.parse(identity)).toEqual([
      'device-v1', 'ios', 'Polish', 'en-GB', 'com.apple.voice.enhanced', 0.9, 1, 'caf',
    ]);
  });

  it('does not collapse casing, locale, or exact voice into the same cache identity', async () => {
    const base = await pronunciationCacheKey({ text: 'Polish', locale: 'en-GB', voiceIdentifier: 'voice-a' });
    const differentCase = await pronunciationCacheKey({ text: 'polish', locale: 'en-GB', voiceIdentifier: 'voice-a' });
    const differentLocale = await pronunciationCacheKey({ text: 'Polish', locale: 'pl-PL', voiceIdentifier: 'voice-a' });
    const differentVoice = await pronunciationCacheKey({ text: 'Polish', locale: 'en-GB', voiceIdentifier: 'voice-b' });

    expect(new Set([base, differentCase, differentLocale, differentVoice]).size).toBe(4);
  });
});
