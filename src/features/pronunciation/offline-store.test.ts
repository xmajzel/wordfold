import {
  buildOfflinePackPlan,
  downloadOfflinePack,
  getOfflinePronunciationFile,
  inspectOfflinePack,
  removeOfflinePack,
} from './offline-store';
import type { OfflineManifestShard } from './offline-manifest';

declare const require: (id: string) => any;

const mockContents = new Map<string, Uint8Array>();
const mockDirectories = new Set<string>();
const mockRemoteBytes = new Map<string, Uint8Array>();
const mockDownload = jest.fn();
let mockUuid = 0;

function mockUriFor(...parts: (string | { uri: string })[]) {
  return parts.map((part) => typeof part === 'string' ? part : part.uri)
    .join('/')
    .replace(/([^:]\/)\/+?/g, '$1');
}

jest.mock('@/data/cefr-catalog', () => {
  const entries = [
    { catalogSenseId: 'sense-a', level: 'A1' },
    { catalogSenseId: 'sense-b', level: 'A1' },
  ];
  return {
    getCefrEntries: (level: string) => entries.filter((entry) => entry.level === level),
    getCefrEntry: (id: string) => entries.find((entry) => entry.catalogSenseId === id) ?? null,
  };
});

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = mockUriFor(...parts); }
    get exists() { return mockDirectories.has(this.uri); }
    create() { mockDirectories.add(this.uri); }
    list() {
      const prefix = `${this.uri}/`;
      return [...mockContents.keys()]
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map((key) => new MockFile(key));
    }
    delete() {
      for (const key of [...mockContents.keys()]) if (key.startsWith(`${this.uri}/`)) mockContents.delete(key);
      for (const key of [...mockDirectories]) if (key === this.uri || key.startsWith(`${this.uri}/`)) mockDirectories.delete(key);
    }
  }

  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = mockUriFor(...parts); }
    get exists() { return mockContents.has(this.uri); }
    get name() { return this.uri.split('/').at(-1) ?? ''; }
    get parentDirectory() { return new MockDirectory(this.uri.slice(0, this.uri.lastIndexOf('/'))); }
    info() { return { size: mockContents.get(this.uri)?.byteLength ?? 0 }; }
    async bytes() { return mockContents.get(this.uri)?.slice() ?? new Uint8Array(); }
    async text() { return new TextDecoder().decode(mockContents.get(this.uri)); }
    create() {
      this.parentDirectory.create();
      mockContents.set(this.uri, new Uint8Array());
    }
    write(value: string) { mockContents.set(this.uri, new TextEncoder().encode(value)); }
    delete() { mockContents.delete(this.uri); }
    async move(destination: MockFile) {
      const bytes = mockContents.get(this.uri);
      if (bytes) mockContents.set(destination.uri, bytes);
      mockContents.delete(this.uri);
      this.uri = destination.uri;
    }
    static createDownloadTask(
      url: string,
      destination: MockFile,
      options: { signal: AbortSignal; onProgress?(progress: { bytesWritten: number; totalBytes: number }): void },
    ) {
      return {
        downloadAsync: async () => {
          if (mockDownload.getMockImplementation()) {
            return mockDownload(url, destination, options);
          }
          const bytes = mockRemoteBytes.get(url);
          if (!bytes) throw new Error('missing fixture');
          options.onProgress?.({ bytesWritten: bytes.byteLength, totalBytes: bytes.byteLength });
          mockContents.set(destination.uri, bytes.slice());
          return destination;
        },
      };
    }
  }
  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: { uri: 'document:' }, availableDiskSpace: 1024 * 1024 * 1024 },
  };
});

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: () => `uuid-${mockUuid += 1}`,
  digest: async (_algorithm: string, bytes: Uint8Array) => {
    const digest = jest.requireActual('node:crypto')
      .createHash('sha256').update(bytes).digest();
    return Uint8Array.from(digest).buffer;
  },
}));

function audio(seed: number) {
  const bytes = new Uint8Array(128);
  bytes.set([0x49, 0x44, 0x33]);
  bytes[10] = seed;
  return bytes;
}

function sha256(bytes: Uint8Array) {
  return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
}

const firstAudio = audio(1);
const secondAudio = audio(2);
const firstHash = 'a'.repeat(64);
const secondHash = 'b'.repeat(64);

const shard: OfflineManifestShard = {
  schemaVersion: 1,
  catalogSha256: '7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b',
  synthesisVersion: 'azure-public-preview-v1',
  locale: 'en-US',
  voiceId: 'en-US-AvaNeural',
  assetCount: 2,
  totalAudioBytes: 256,
  assets: [
    { catalogSenseId: 'sense-a', contentHash: firstHash, sha256: sha256(firstAudio), byteLength: 128 },
    { catalogSenseId: 'sense-b', contentHash: secondHash, sha256: sha256(secondAudio), byteLength: 128 },
  ],
};

describe('durable offline pronunciation store', () => {
  beforeEach(() => {
    mockContents.clear();
    mockDirectories.clear();
    mockRemoteBytes.clear();
    mockDownload.mockReset();
    mockUuid = 0;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    mockRemoteBytes.set(
      `https://project.supabase.co/storage/v1/object/public/pron-public/azure-public-preview-v1/${firstHash}.mp3`,
      firstAudio,
    );
    mockRemoteBytes.set(
      `https://project.supabase.co/storage/v1/object/public/pron-public/azure-public-preview-v1/${secondHash}.mp3`,
      secondAudio,
    );
  });

  it('builds an exact level plan and reports it as partial before audio is downloaded', async () => {
    const plan = buildOfflinePackPlan(shard, 'A1', 'c'.repeat(64));
    const controller = new AbortController();
    controller.abort();

    await expect(downloadOfflinePack(plan, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(inspectOfflinePack('en-US', 'A1')).resolves.toMatchObject({
      state: 'partial',
      assetCount: 2,
      downloadedCount: 0,
      totalAudioBytes: 256,
    });
  });

  it('downloads atomically, verifies every file, and reuses the durable pack offline', async () => {
    const plan = buildOfflinePackPlan(shard, 'A1', 'c'.repeat(64));
    const progress = jest.fn();

    await expect(downloadOfflinePack(plan, {
      signal: new AbortController().signal,
      onProgress: progress,
    })).resolves.toMatchObject({ state: 'downloaded', downloadedCount: 2, downloadedBytes: 256 });
    expect(progress).toHaveBeenCalled();
    expect([...mockContents.keys()].some((key) => key.includes('.tmp.'))).toBe(false);

    const file = await getOfflinePronunciationFile('sense-a', 'en-US');
    expect(file?.uri).toContain(`${firstHash}.mp3`);

    const existingDownloads = mockContents.size;
    await downloadOfflinePack(plan, { signal: new AbortController().signal });
    expect(mockContents.size).toBe(existingDownloads);
  });

  it('rejects a corrupted response and never writes a completion marker', async () => {
    mockRemoteBytes.set(
      `https://project.supabase.co/storage/v1/object/public/pron-public/azure-public-preview-v1/${firstHash}.mp3`,
      audio(9),
    );
    const plan = buildOfflinePackPlan(shard, 'A1', 'c'.repeat(64));

    await expect(downloadOfflinePack(plan, {
      signal: new AbortController().signal,
    })).rejects.toThrow('could not be verified');

    expect([...mockContents.keys()].some((key) => key.endsWith('/complete.json'))).toBe(false);
    expect([...mockContents.keys()].some((key) => key.includes('.tmp.mp3'))).toBe(false);
  });

  it('removes corrupted audio from playback and supports explicit pack eviction', async () => {
    const plan = buildOfflinePackPlan(shard, 'A1', 'c'.repeat(64));
    await downloadOfflinePack(plan, { signal: new AbortController().signal });
    const audioPath = [...mockContents.keys()].find((key) => key.endsWith(`${firstHash}.mp3`))!;
    const corrupted = mockContents.get(audioPath)!.slice();
    corrupted[20] = 8;
    mockContents.set(audioPath, corrupted);

    await expect(getOfflinePronunciationFile('sense-a', 'en-US')).resolves.toBeNull();
    expect(mockContents.has(audioPath)).toBe(false);
    expect([...mockContents.keys()].some((key) => key.endsWith('/complete.json'))).toBe(false);

    removeOfflinePack('en-US', 'A1');
    await expect(inspectOfflinePack('en-US', 'A1')).resolves.toMatchObject({ state: 'not_downloaded' });
  });
});
