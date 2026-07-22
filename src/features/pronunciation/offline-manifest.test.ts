import { getCefrEntries } from '@/data/cefr-catalog';
import { cefrLevels } from '@/data/cefr-levels';
import {
  fetchOfflineManifestIndex,
  OFFLINE_MANIFEST_CATALOG_SHA256,
  OFFLINE_MANIFEST_INDEX_BYTES,
  OFFLINE_MANIFEST_INDEX_OBJECT_PATH,
  OFFLINE_MANIFEST_INDEX_SHA256,
  OfflineManifestError,
  offlineAudioPublicUrl,
  parseOfflineManifestIndex,
  parseOfflineManifestShard,
  type OfflineManifestShardDescriptor,
} from './offline-manifest';

declare const require: (id: string) => any;

const { createHash } = require('node:crypto');

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: async (_algorithm: string, bytes: Uint8Array) => {
    const digest = jest.requireActual('node:crypto')
      .createHash('sha256').update(bytes).digest();
    return Uint8Array.from(digest).buffer;
  },
}));

const descriptors = {
  'en-GB': {
    locale: 'en-GB',
    voiceId: 'en-GB-RyanNeural',
    assetCount: 8300,
    totalAudioBytes: 166187520,
    byteLength: 1357249,
    sha256: '8609e0eb614c2348a983cd95da097984a7d5ddf94597d285d945d1fefde5a79f',
    objectPath: `azure-public-preview-v1/${OFFLINE_MANIFEST_CATALOG_SHA256}/en-GB/8609e0eb614c2348a983cd95da097984a7d5ddf94597d285d945d1fefde5a79f.json`,
  },
  'en-US': {
    locale: 'en-US',
    voiceId: 'en-US-AvaNeural',
    assetCount: 8300,
    totalAudioBytes: 117902304,
    byteLength: 1357245,
    sha256: 'f76e52b240477806182b4b3dfb5a873c73c8638d37a2ca0a10fbc7d0ae34cc61',
    objectPath: `azure-public-preview-v1/${OFFLINE_MANIFEST_CATALOG_SHA256}/en-US/f76e52b240477806182b4b3dfb5a873c73c8638d37a2ca0a10fbc7d0ae34cc61.json`,
  },
} as const;

const indexFixture = {
  schemaVersion: 1,
  catalogSha256: OFFLINE_MANIFEST_CATALOG_SHA256,
  synthesisVersion: 'azure-public-preview-v1',
  contentType: 'audio/mpeg',
  bucket: 'pron-manifests',
  assetCount: 16600,
  totalAudioBytes: 284089824,
  shards: descriptors,
};

function hex(value: number) {
  return value.toString(16).padStart(64, '0');
}

function shardFixture(descriptor: OfflineManifestShardDescriptor) {
  const ids = cefrLevels.flatMap((level) => getCefrEntries(level).map((entry) => entry.catalogSenseId)).sort();
  const baseSize = Math.floor(descriptor.totalAudioBytes / ids.length);
  const remainder = descriptor.totalAudioBytes - baseSize * ids.length;
  return {
    schemaVersion: 1,
    catalogSha256: OFFLINE_MANIFEST_CATALOG_SHA256,
    synthesisVersion: 'azure-public-preview-v1',
    locale: descriptor.locale,
    voiceId: descriptor.voiceId,
    assetCount: ids.length,
    totalAudioBytes: descriptor.totalAudioBytes,
    assets: ids.map((id, index) => [
      id,
      hex(index + 1),
      hex(index + 10_000),
      baseSize + (index < remainder ? 1 : 0),
    ]),
  };
}

describe('offline pronunciation manifest contract', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  });

  it('accepts the pinned index and derives only the exact immutable index URL', () => {
    const parsed = parseOfflineManifestIndex(indexFixture);
    expect(parsed.shards['en-US']).toEqual(descriptors['en-US']);
    expect(OFFLINE_MANIFEST_INDEX_OBJECT_PATH).toContain(OFFLINE_MANIFEST_INDEX_SHA256);
  });

  it('downloads and verifies the exact pinned index bytes before parsing', async () => {
    const bytes = new TextEncoder().encode(`${JSON.stringify(indexFixture)}\n`);
    expect(bytes.byteLength).toBe(OFFLINE_MANIFEST_INDEX_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(OFFLINE_MANIFEST_INDEX_SHA256);
    const fetchImplementation = jest.fn(async () => new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(bytes.byteLength),
      },
    }));

    await expect(fetchOfflineManifestIndex(fetchImplementation)).resolves.toEqual(indexFixture);
    expect(fetchImplementation).toHaveBeenCalledWith(
      `https://project.supabase.co/storage/v1/object/public/pron-manifests/${OFFLINE_MANIFEST_INDEX_OBJECT_PATH}`,
      { headers: { Accept: 'application/json' } },
    );
  });

  it('rejects index mutations even when JSON remains structurally plausible', async () => {
    const mutated = { ...indexFixture, assetCount: 16599 };
    expect(() => parseOfflineManifestIndex(mutated)).toThrow(OfflineManifestError);

    const bytes = new TextEncoder().encode(`${JSON.stringify(mutated)}\n`);
    await expect(fetchOfflineManifestIndex(async () => new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))).rejects.toMatchObject({ code: 'invalid_manifest' });
  });

  it('requires one sorted, unique asset for every bundled catalog identity', () => {
    const descriptor = descriptors['en-US'] as OfflineManifestShardDescriptor;
    const fixture = shardFixture(descriptor);
    const parsed = parseOfflineManifestShard(fixture, descriptor);
    expect(parsed.assets).toHaveLength(8300);
    expect(parsed.totalAudioBytes).toBe(117902304);

    const duplicate = structuredClone(fixture);
    duplicate.assets[1][1] = duplicate.assets[0][1];
    expect(() => parseOfflineManifestShard(duplicate, descriptor)).toThrow(OfflineManifestError);

    const missingIdentity = structuredClone(fixture);
    missingIdentity.assets[0][0] = 'unknown';
    expect(() => parseOfflineManifestShard(missingIdentity, descriptor)).toThrow(OfflineManifestError);
  });

  it('derives audio URLs only from the configured origin and validated content hash', () => {
    expect(offlineAudioPublicUrl({
      catalogSenseId: 'sense', contentHash: 'a'.repeat(64), sha256: 'b'.repeat(64), byteLength: 128,
    })).toBe(
      `https://project.supabase.co/storage/v1/object/public/pron-public/azure-public-preview-v1/${'a'.repeat(64)}.mp3`,
    );
  });
});
