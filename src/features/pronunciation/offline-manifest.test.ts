import { getCourseCatalogEntries } from '@/data/course-catalog';
import spanishPublication from '../../../assets/pronunciation/spanish-publication.json';
import { pronunciationCatalogHash, offlineManifestPublicUrl, fetchOfflineManifestShard } from './offline-manifest';
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

  it('accepts verified manifest bytes when the native response omits Content-Length', async () => {
    const bytes = new TextEncoder().encode(`${JSON.stringify(indexFixture)}\n`);

    await expect(fetchOfflineManifestIndex(async () => new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))).resolves.toEqual(indexFixture);
  });

  it.each(['invalid', String(OFFLINE_MANIFEST_INDEX_BYTES - 1)])(
    'rejects an invalid Content-Length header: %s',
    async (contentLength) => {
      const bytes = new TextEncoder().encode(`${JSON.stringify(indexFixture)}\n`);

      await expect(fetchOfflineManifestIndex(async () => new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': contentLength,
        },
      }))).rejects.toMatchObject({ code: 'invalid_manifest' });
    },
  );

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

it('validates a separate complete Spanish manifest and rejects English identities in it', async () => {
  const ids = cefrLevels.flatMap(level => getCourseCatalogEntries('es-sk', level).map(entry => entry.catalogSenseId)).sort();
  const catalogSha256 = pronunciationCatalogHash('es-ES');
  const assets = ids.map((id, index) => [id, (index + 1).toString(16).padStart(64, '0'), 'a'.repeat(64), 128]);
  const spanishDescriptors = Object.fromEntries((['es-ES', 'es-MX'] as const).map(locale => [locale, {
    locale, voiceId: locale === 'es-ES' ? 'es-ES-ElviraNeural' : 'es-MX-JorgeNeural',
    assetCount: ids.length, totalAudioBytes: ids.length * 128, byteLength: 1000,
    sha256: 'b'.repeat(64), objectPath: `azure-public-preview-v1/${catalogSha256}/${locale}/${'b'.repeat(64)}.json`,
  }]));
  const index = parseOfflineManifestIndex({ schemaVersion: 1, catalogSha256, synthesisVersion: 'azure-public-preview-v1', contentType: 'audio/mpeg', bucket: 'pron-manifests', assetCount: ids.length * 2, totalAudioBytes: ids.length * 256, shards: spanishDescriptors });
  const descriptor = index.shards['es-ES']!;
  const shard = { schemaVersion: 1, catalogSha256, synthesisVersion: 'azure-public-preview-v1', locale: 'es-ES', voiceId: descriptor.voiceId, assetCount: ids.length, totalAudioBytes: ids.length * 128, assets };
  expect(parseOfflineManifestShard(shard, descriptor).assets).toHaveLength(ids.length);
  expect(() => parseOfflineManifestShard({ ...shard, assets: [['english', ...assets[0].slice(1)], ...assets.slice(1)] }, descriptor)).toThrow();
  await expect(fetchOfflineManifestShard(index, 'en-US', jest.fn())).rejects.toThrow();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  expect(offlineManifestPublicUrl(descriptor.objectPath)).toContain('/es-ES/');
});

it('does not fetch unpublished Spanish audio manifests', async () => {
  const publication: { index: unknown } = spanishPublication;
  const publishedIndex = publication.index;
  const fetcher = jest.fn();
  publication.index = null;
  try {
    await expect(fetchOfflineManifestIndex(fetcher, 'es-sk')).rejects.toMatchObject({ code: 'unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    publication.index = publishedIndex;
  }
});

const spanishPublishedIndexFixture = {
  "schemaVersion": 1,
  "catalogSha256": "bf9c3810d286fd031211631b35c5a454c712688195690529405be54566f77328",
  "synthesisVersion": "azure-public-preview-v1",
  "contentType": "audio/mpeg",
  "bucket": "pron-manifests",
  "assetCount": 13378,
  "totalAudioBytes": 269014752,
  "shards": {
    "es-ES": {
      "locale": "es-ES",
      "voiceId": "es-ES-ElviraNeural",
      "assetCount": 6689,
      "totalAudioBytes": 136089216,
      "byteLength": 1087769,
      "sha256": "41f6306e0cefe80dfa35e84faa6de1becd2e046c38f00619e91bd3a13a61b041",
      "objectPath": "azure-public-preview-v1/bf9c3810d286fd031211631b35c5a454c712688195690529405be54566f77328/es-ES/41f6306e0cefe80dfa35e84faa6de1becd2e046c38f00619e91bd3a13a61b041.json"
    },
    "es-MX": {
      "locale": "es-MX",
      "voiceId": "es-MX-JorgeNeural",
      "assetCount": 6689,
      "totalAudioBytes": 132925536,
      "byteLength": 1087768,
      "sha256": "17e1640b3f6903de334e69a18065fded09d02a27a556d41cfac928e16cde844b",
      "objectPath": "azure-public-preview-v1/bf9c3810d286fd031211631b35c5a454c712688195690529405be54566f77328/es-MX/17e1640b3f6903de334e69a18065fded09d02a27a556d41cfac928e16cde844b.json"
    }
  }
};

it('fetches the published Spanish index using its own pinned path and integrity metadata', async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  const bytes = new TextEncoder().encode(`${JSON.stringify(spanishPublishedIndexFixture)}\n`);
  expect(bytes.byteLength).toBe(spanishPublication.index.byteLength);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(spanishPublication.index.sha256);
  const fetcher = jest.fn(async () => new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  await expect(fetchOfflineManifestIndex(fetcher, 'es-sk')).resolves.toEqual(spanishPublishedIndexFixture);
  expect(fetcher).toHaveBeenCalledWith(
    `https://project.supabase.co/storage/v1/object/public/pron-manifests/${spanishPublication.index.objectPath}`,
    { headers: { Accept: 'application/json' } },
  );
  const modified = new TextEncoder().encode(`${JSON.stringify({ ...spanishPublishedIndexFixture, totalAudioBytes: 1 })}\n`);
  await expect(fetchOfflineManifestIndex(async () => new Response(modified, {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }), 'es-sk')).rejects.toMatchObject({ code: 'invalid_manifest' });
});
