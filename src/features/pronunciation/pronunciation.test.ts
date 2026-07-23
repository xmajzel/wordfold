import { Platform } from 'react-native';

import {
  startNeuralPronunciation,
  startPrivateNeuralPronunciation,
  startPronunciation,
  stopPronunciation,
} from './pronunciation';

const mockPlayPronunciationFile = jest.fn();
const mockStopFilePlayback = jest.fn(async () => undefined);
const mockGetCachedFile = jest.fn();
const mockDeleteCachedFile = jest.fn();
const mockResolveVoice = jest.fn();
const mockStartDevicePronunciation = jest.fn();
const mockStopDevicePronunciation = jest.fn(async () => undefined);
const mockRequestNeuralPronunciation = jest.fn();
const mockGetCachedNeuralFile = jest.fn();
const mockCacheNeuralFile = jest.fn();
const mockDeleteCachedNeural = jest.fn();
const mockGetOfflineNeuralFile = jest.fn();
const mockDeleteOfflineNeuralFile = jest.fn();
const mockRequestPrivateNeuralPronunciation = jest.fn();
const mockGetCachedPrivateNeuralFile = jest.fn();
const mockCachePrivateNeuralFile = jest.fn();
const mockDeleteCachedPrivateNeuralFile = jest.fn();

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

jest.mock('@/features/pronunciation/cloud', () => ({
  requestNeuralPronunciation: (...args: unknown[]) => mockRequestNeuralPronunciation(...args),
}));

jest.mock('@/features/pronunciation/public-cache', () => ({
  getCachedNeuralPronunciationFile: (...args: unknown[]) => mockGetCachedNeuralFile(...args),
  cacheNeuralPronunciationFile: (...args: unknown[]) => mockCacheNeuralFile(...args),
  deleteCachedNeuralPronunciation: (...args: unknown[]) => mockDeleteCachedNeural(...args),
}));

jest.mock('@/features/pronunciation/offline-store', () => ({
  getOfflinePronunciationFile: (...args: unknown[]) => mockGetOfflineNeuralFile(...args),
  deleteOfflinePronunciationFile: (...args: unknown[]) => mockDeleteOfflineNeuralFile(...args),
}));

jest.mock('@/features/pronunciation/private-cloud', () => ({
  requestPrivateNeuralPronunciation: (...args: unknown[]) => (
    mockRequestPrivateNeuralPronunciation(...args)
  ),
}));

jest.mock('@/features/pronunciation/private-cache', () => ({
  getCachedPrivateNeuralPronunciationFile: (...args: unknown[]) => (
    mockGetCachedPrivateNeuralFile(...args)
  ),
  cachePrivateNeuralPronunciationFile: (...args: unknown[]) => (
    mockCachePrivateNeuralFile(...args)
  ),
  deleteCachedPrivateNeuralPronunciation: (...args: unknown[]) => (
    mockDeleteCachedPrivateNeuralFile(...args)
  ),
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

describe('neural pronunciation orchestration', () => {
  const neuralFile = { uri: 'file:///cache/neural.mp3' };
  const asset = { locale: 'en-GB', contentHash: 'hash' };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockGetCachedNeuralFile.mockResolvedValue(neuralFile);
    mockGetOfflineNeuralFile.mockResolvedValue(null);
    mockCacheNeuralFile.mockResolvedValue(neuralFile);
    mockRequestNeuralPronunciation.mockResolvedValue({ status: 'ready', asset });
    mockPlayPronunciationFile.mockImplementation(async (_uri, callbacks) => {
      callbacks.onStart?.();
      callbacks.onDone?.();
    });
  });

  it('plays a previously verified public file without making a cloud request', async () => {
    await expect(startNeuralPronunciation('sense-id', 'en-GB')).resolves.toEqual({ status: 'started' });

    expect(mockGetCachedNeuralFile).toHaveBeenCalledWith('sense-id', 'en-GB');
    expect(mockRequestNeuralPronunciation).not.toHaveBeenCalled();
    expect(mockPlayPronunciationFile).toHaveBeenCalledWith(neuralFile.uri, expect.any(Object));
  });

  it('prefers a durable downloaded pack without consulting the transient cache or cloud', async () => {
    const offlineFile = { uri: 'file:///documents/offline.mp3' };
    mockGetOfflineNeuralFile.mockResolvedValue(offlineFile);

    await expect(startNeuralPronunciation('sense-id', 'en-GB')).resolves.toEqual({ status: 'started' });

    expect(mockGetCachedNeuralFile).not.toHaveBeenCalled();
    expect(mockRequestNeuralPronunciation).not.toHaveBeenCalled();
    expect(mockPlayPronunciationFile).toHaveBeenCalledWith(offlineFile.uri, expect.any(Object));
  });

  it('never invokes the authenticated cloud path for an offline-only user', async () => {
    mockGetCachedNeuralFile.mockResolvedValue(null);

    await expect(startNeuralPronunciation(
      'sense-id',
      'en-US',
      {},
      { cloudAllowed: false },
    )).rejects.toThrow('Download the pack again');

    expect(mockRequestNeuralPronunciation).not.toHaveBeenCalled();
  });

  it('requests and verifies a ready asset only after the offline cache misses', async () => {
    mockGetCachedNeuralFile.mockResolvedValue(null);

    await startNeuralPronunciation('sense-id', 'en-GB');

    expect(mockRequestNeuralPronunciation).toHaveBeenCalledWith('sense-id', 'en-GB');
    expect(mockCacheNeuralFile).toHaveBeenCalledWith('sense-id', asset);
    expect(mockPlayPronunciationFile).toHaveBeenCalledWith(neuralFile.uri, expect.any(Object));
  });

  it('returns a retryable pending result without device fallback or playback', async () => {
    mockGetCachedNeuralFile.mockResolvedValue(null);
    mockRequestNeuralPronunciation.mockResolvedValue({ status: 'pending', retryAfterSeconds: 3 });

    await expect(startNeuralPronunciation('sense-id', 'en-US')).resolves.toEqual({
      status: 'pending', retryAfterSeconds: 3,
    });

    expect(mockPlayPronunciationFile).not.toHaveBeenCalled();
    expect(mockStartDevicePronunciation).not.toHaveBeenCalled();
  });

  it('removes a neural cache entry that cannot start playback without falling back', async () => {
    mockPlayPronunciationFile.mockRejectedValue(new Error('Unreadable MP3'));

    await expect(startNeuralPronunciation('sense-id', 'en-US')).rejects.toThrow('Unreadable MP3');

    expect(mockDeleteCachedNeural).toHaveBeenCalledWith('sense-id', 'en-US');
    expect(mockStartDevicePronunciation).not.toHaveBeenCalled();
  });

  it('removes a durable pack file that cannot start playback', async () => {
    mockGetOfflineNeuralFile.mockResolvedValue({ uri: 'file:///documents/offline.mp3' });
    mockPlayPronunciationFile.mockRejectedValue(new Error('Unreadable MP3'));

    await expect(startNeuralPronunciation('sense-id', 'en-US')).rejects.toThrow('Unreadable MP3');

    expect(mockDeleteOfflineNeuralFile).toHaveBeenCalledWith('sense-id', 'en-US');
    expect(mockDeleteCachedNeural).not.toHaveBeenCalled();
  });
});

describe('private neural pronunciation orchestration', () => {
  const accountScope = {
    type: 'account' as const,
    userId: '00000000-0000-4000-8000-0000000000a1',
  };
  const privateFile = { uri: 'file:///cache/account/private.mp3' };
  const privateAsset = { locale: 'sk-SK', contentHash: 'private-hash' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedPrivateNeuralFile.mockResolvedValue(privateFile);
    mockCachePrivateNeuralFile.mockResolvedValue(privateFile);
    mockRequestPrivateNeuralPronunciation.mockResolvedValue({
      status: 'ready', asset: privateAsset,
    });
    mockPlayPronunciationFile.mockImplementation(async (_uri, callbacks) => {
      callbacks.onStart?.();
      callbacks.onDone?.();
    });
  });

  it('plays an account-private verified cache hit without a cloud request', async () => {
    await expect(startPrivateNeuralPronunciation(
      'súkromné slovo',
      'sk-SK',
      accountScope,
    )).resolves.toEqual({ status: 'started' });

    expect(mockGetCachedPrivateNeuralFile).toHaveBeenCalledWith(
      'súkromné slovo', 'sk-SK', accountScope.userId,
    );
    expect(mockRequestPrivateNeuralPronunciation).not.toHaveBeenCalled();
    expect(mockPlayPronunciationFile).toHaveBeenCalledWith(privateFile.uri, expect.any(Object));
  });

  it('requests, verifies, and caches exact private input only after a cache miss', async () => {
    mockGetCachedPrivateNeuralFile.mockResolvedValue(null);

    await startPrivateNeuralPronunciation('súkromné slovo', 'sk-SK', accountScope);

    expect(mockRequestPrivateNeuralPronunciation).toHaveBeenCalledWith(
      'súkromné slovo', 'sk-SK', accountScope.userId,
    );
    expect(mockCachePrivateNeuralFile).toHaveBeenCalledWith(
      'súkromné slovo', accountScope.userId, privateAsset,
    );
  });

  it('returns pending without playback or device fallback', async () => {
    mockGetCachedPrivateNeuralFile.mockResolvedValue(null);
    mockRequestPrivateNeuralPronunciation.mockResolvedValue({
      status: 'pending', retryAfterSeconds: 2,
    });

    await expect(startPrivateNeuralPronunciation(
      'private',
      'en-US',
      accountScope,
    )).resolves.toEqual({ status: 'pending', retryAfterSeconds: 2 });
    expect(mockPlayPronunciationFile).not.toHaveBeenCalled();
    expect(mockStartDevicePronunciation).not.toHaveBeenCalled();
  });

  it('rejects guests before any private cache or cloud access', async () => {
    await expect(startPrivateNeuralPronunciation(
      'private',
      'en-US',
      { type: 'guest' },
    )).rejects.toThrow('Sign in');
    expect(mockGetCachedPrivateNeuralFile).not.toHaveBeenCalled();
    expect(mockRequestPrivateNeuralPronunciation).not.toHaveBeenCalled();
  });

  it('deletes failed private playback without falling back to device speech', async () => {
    mockPlayPronunciationFile.mockRejectedValue(new Error('Unreadable private MP3'));

    await expect(startPrivateNeuralPronunciation(
      'private',
      'en-US',
      accountScope,
    )).rejects.toThrow('Unreadable private MP3');
    expect(mockDeleteCachedPrivateNeuralFile).toHaveBeenCalledWith(
      'private', 'en-US', accountScope.userId,
    );
    expect(mockStartDevicePronunciation).not.toHaveBeenCalled();
  });
});
