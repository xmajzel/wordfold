import {
  cacheNeuralPronunciationFile,
  getCachedNeuralPronunciationFile,
} from './public-cache';

const mockContents = new Map<string, Uint8Array>();
let mockDownloadedBytes = new Uint8Array();
let mockDownloadCount = 0;

jest.mock('expo-file-system', () => {
  const uriFor = (...parts: (string | { uri: string })[]) => parts
    .map((part) => typeof part === 'string' ? part : part.uri)
    .join('/')
    .replace(/\/+/, '/');

  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = uriFor(...parts); }
    create() {}
  }

  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = uriFor(...parts); }
    get exists() { return mockContents.has(this.uri); }
    get name() { return this.uri.split('/').at(-1) ?? ''; }
    get parentDirectory() {
      return { uri: this.uri.slice(0, Math.max(0, this.uri.lastIndexOf('/'))) };
    }
    info() { return { size: mockContents.get(this.uri)?.byteLength ?? 0 }; }
    async bytes() { return mockContents.get(this.uri) ?? new Uint8Array(); }
    async text() { return new TextDecoder().decode(mockContents.get(this.uri)); }
    create() { mockContents.set(this.uri, new Uint8Array()); }
    write(value: string) { mockContents.set(this.uri, new TextEncoder().encode(value)); }
    delete() { mockContents.delete(this.uri); }
    async move(destination: MockFile) {
      const bytes = mockContents.get(this.uri);
      if (bytes) mockContents.set(destination.uri, bytes);
      mockContents.delete(this.uri);
      this.uri = destination.uri;
    }
    static async downloadFileAsync(_url: string, destination: MockFile) {
      mockDownloadCount += 1;
      mockContents.set(destination.uri, mockDownloadedBytes.slice());
      return destination;
    }
  }

  return { Directory: MockDirectory, File: MockFile, Paths: { cache: { uri: 'cache:' } } };
});

jest.mock('expo-crypto', () => {
  const { createHash } = jest.requireActual('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async () => 'lookup-key',
    randomUUID: () => 'random-id',
    digest: async (_algorithm: string, bytes: Uint8Array) => {
      const digest = createHash('sha256').update(bytes).digest();
      return Uint8Array.from(digest).buffer;
    },
  };
});

jest.mock('@/features/pronunciation/cache', () => ({
  PRONUNCIATION_CACHE_DIRECTORY: 'wordfold-pronunciation',
  enforcePronunciationCacheLimit: jest.fn(async () => undefined),
}));

const contentHash = 'a'.repeat(64);
const asset = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  requestKey: contentHash,
  contentHash,
  sha256: 'f816ae4c68c76a6b7379bd7fb6c2c8fe4443ba517b7df725dda28488effaa44a',
  byteLength: 128,
  contentType: 'audio/mpeg' as const,
  locale: 'en-US' as const,
  synthesisVersion: 'azure-public-preview-v1' as const,
  publicUrl: `https://project.supabase.co/storage/v1/object/public/pron-public/azure-public-preview-v1/${contentHash}.mp3`,
};

describe('verified public pronunciation cache', () => {
  beforeEach(() => {
    mockContents.clear();
    mockDownloadCount = 0;
    mockDownloadedBytes = new Uint8Array(128);
    mockDownloadedBytes.set([0x49, 0x44, 0x33]);
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  });

  it('downloads once and then reuses a verified file offline', async () => {
    const downloaded = await cacheNeuralPronunciationFile('sense-id', asset);
    const cached = await getCachedNeuralPronunciationFile('sense-id', 'en-US');

    expect(mockDownloadCount).toBe(1);
    expect(downloaded.uri).toBe(cached?.uri);
    expect(cached?.uri).toContain(`${contentHash}.mp3`);
  });

  it('rejects and removes a cached MP3 whose content no longer matches its hash', async () => {
    const downloaded = await cacheNeuralPronunciationFile('sense-id', asset);
    const corrupted = mockContents.get(downloaded.uri)!.slice();
    corrupted[20] = 1;
    mockContents.set(downloaded.uri, corrupted);

    await expect(getCachedNeuralPronunciationFile('sense-id', 'en-US')).resolves.toBeNull();
    expect(mockContents.has(downloaded.uri)).toBe(false);
    expect([...mockContents.keys()].some((key) => key.endsWith('.json'))).toBe(false);
  });

  it('rejects a download without an MP3 signature before persisting it', async () => {
    mockDownloadedBytes = new Uint8Array(128);

    await expect(cacheNeuralPronunciationFile('sense-id', asset)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    expect([...mockContents.keys()].some((key) => key.endsWith('.mp3'))).toBe(false);
  });
});
