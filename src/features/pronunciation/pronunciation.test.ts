import { Platform } from 'react-native';

import { startPronunciation, stopPronunciation } from './pronunciation';

const mockPlayPronunciationFile = jest.fn();
const mockStopFilePlayback = jest.fn(async () => undefined);
const mockGetCachedFile = jest.fn();
const mockDeleteCachedFile = jest.fn();
const mockResolveVoice = jest.fn();
const mockStartDevicePronunciation = jest.fn();
const mockStopDevicePronunciation = jest.fn(async () => undefined);

jest.mock('@/features/pronunciation/audio-player', () => ({
  playPronunciationFile: (...args: unknown[]) => mockPlayPronunciationFile(...args),
  stopPronunciationFilePlayback: () => mockStopFilePlayback(),
}));

jest.mock('@/features/pronunciation/cache', () => ({
  getCachedPronunciationFile: (...args: unknown[]) => mockGetCachedFile(...args),
  deleteCachedPronunciationFile: (...args: unknown[]) => mockDeleteCachedFile(...args),
}));

jest.mock('@/features/pronunciation/device-speech', () => ({
  resolveExactDeviceVoice: (...args: unknown[]) => mockResolveVoice(...args),
  startDevicePronunciation: (...args: unknown[]) => mockStartDevicePronunciation(...args),
  stopDevicePronunciation: () => mockStopDevicePronunciation(),
  validateDevicePronunciationInput: (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Add a word before playing its pronunciation.');
    return trimmed;
  },
}));

const voice = { identifier: 'exact-es-MX', language: 'es-MX' };
const scope = { type: 'guest' } as const;
const file = { uri: 'file:///cache/hola.wav' };

describe('cached pronunciation orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockResolveVoice.mockResolvedValue(voice);
    mockGetCachedFile.mockResolvedValue(file);
    mockPlayPronunciationFile.mockImplementation(async (_uri, callbacks) => {
      callbacks.onStart?.();
      callbacks.onDone?.();
    });
    mockStartDevicePronunciation.mockResolvedValue({ status: 'started', voice });
  });

  it('plays the cached file generated for the exact installed voice', async () => {
    const callbacks = { onStart: jest.fn(), onDone: jest.fn() };

    await expect(startPronunciation('  hola  ', 'es-MX', scope, callbacks)).resolves.toEqual({
      status: 'started', voice,
    });

    expect(mockGetCachedFile).toHaveBeenCalledWith({
      text: 'hola', locale: 'es-MX', voiceIdentifier: 'exact-es-MX', scope,
    });
    expect(mockPlayPronunciationFile).toHaveBeenCalledWith(file.uri, expect.any(Object));
    expect(mockStartDevicePronunciation).not.toHaveBeenCalled();
    expect(callbacks.onStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });

  it('falls back once to the same exact live voice when cache generation fails', async () => {
    mockGetCachedFile.mockRejectedValue(new Error('File synthesis failed'));

    await startPronunciation('hola', 'es-MX', scope);

    expect(mockStartDevicePronunciation).toHaveBeenCalledTimes(1);
    expect(mockStartDevicePronunciation).toHaveBeenCalledWith('hola', 'es-MX', expect.any(Object));
  });

  it('deletes an invalid cached file and falls back once when playback cannot start', async () => {
    mockPlayPronunciationFile.mockRejectedValue(new Error('Unreadable audio'));

    await startPronunciation('hola', 'es-MX', scope);

    expect(mockDeleteCachedFile).toHaveBeenCalledWith(file);
    expect(mockStartDevicePronunciation).toHaveBeenCalledTimes(1);
  });

  it('never generates or speaks another locale when the exact voice is unavailable', async () => {
    mockResolveVoice.mockResolvedValue(null);

    await expect(startPronunciation('hola', 'es-MX', scope)).resolves.toEqual({ status: 'missing_voice' });

    expect(mockGetCachedFile).not.toHaveBeenCalled();
    expect(mockPlayPronunciationFile).not.toHaveBeenCalled();
    expect(mockStartDevicePronunciation).not.toHaveBeenCalled();
  });

  it('does not start playback if the request is stopped while its file is being prepared', async () => {
    let release!: (value: typeof file) => void;
    mockGetCachedFile.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const result = startPronunciation('hola', 'es-MX', scope);
    await Promise.resolve();

    await stopPronunciation();
    release(file);

    await expect(result).resolves.toEqual({ status: 'stopped' });
    expect(mockPlayPronunciationFile).not.toHaveBeenCalled();
  });
});
