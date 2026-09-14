import * as Crypto from 'expo-crypto';

import spanishPublication from '../../../assets/pronunciation/spanish-publication.json';
import { pronunciationEntries } from './catalog';
import { isNeuralLocale } from '@/domain/pronunciation-voices';
import { cefrLevels } from '@/data/cefr-levels';
import {
  NEURAL_CONTENT_TYPE,
  NEURAL_MAXIMUM_BYTES,
  NEURAL_SYNTHESIS_VERSION,
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';

export const OFFLINE_MANIFEST_SCHEMA_VERSION = 1;
export const OFFLINE_MANIFEST_BUCKET = 'pron-manifests';
export const OFFLINE_MANIFEST_CATALOG_SHA256 = '7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b';
export const OFFLINE_MANIFEST_INDEX_SHA256 = '71b624deae4c0e4bb03eb70cf083d0ed9e53c51d03cc7cf7f8d2efcb7f636d60';
export const OFFLINE_MANIFEST_INDEX_BYTES = 1_016;
export const OFFLINE_MANIFEST_INDEX_OBJECT_PATH = `${NEURAL_SYNTHESIS_VERSION}/${OFFLINE_MANIFEST_CATALOG_SHA256}/index/${OFFLINE_MANIFEST_INDEX_SHA256}.json`;
export const OFFLINE_MANIFEST_MAXIMUM_BYTES = 8 * 1024 * 1024;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXPECTED_COUNTS: Partial<Record<NeuralPronunciationLocale, number>> = {
  'en-US': 8_300,
  'en-GB': 8_300,
};
const EXPECTED_AUDIO_BYTES: Partial<Record<NeuralPronunciationLocale, number>> = {
  'en-US': 117_902_304,
  'en-GB': 166_187_520,
};
const EXPECTED_VOICES: Record<NeuralPronunciationLocale, string> = {
  'en-US': 'en-US-AvaNeural',
  'en-GB': 'en-GB-RyanNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'es-MX': 'es-MX-JorgeNeural',
};

export type OfflineManifestShardDescriptor = {
  locale: NeuralPronunciationLocale;
  voiceId: string;
  assetCount: number;
  totalAudioBytes: number;
  byteLength: number;
  sha256: string;
  objectPath: string;
};

export type OfflineManifestIndex = {
  schemaVersion: typeof OFFLINE_MANIFEST_SCHEMA_VERSION;
  catalogSha256: string;
  synthesisVersion: typeof NEURAL_SYNTHESIS_VERSION;
  contentType: typeof NEURAL_CONTENT_TYPE;
  bucket: typeof OFFLINE_MANIFEST_BUCKET;
  assetCount: number;
  totalAudioBytes: number;
  shards: Partial<Record<NeuralPronunciationLocale, OfflineManifestShardDescriptor>>;
};

export type OfflineManifestAsset = {
  catalogSenseId: string;
  contentHash: string;
  sha256: string;
  byteLength: number;
};

export type OfflineManifestShard = {
  schemaVersion: typeof OFFLINE_MANIFEST_SCHEMA_VERSION;
  catalogSha256: string;
  synthesisVersion: typeof NEURAL_SYNTHESIS_VERSION;
  locale: NeuralPronunciationLocale;
  voiceId: string;
  assetCount: number;
  totalAudioBytes: number;
  assets: OfflineManifestAsset[];
};

export type OfflineManifestErrorCode = 'configuration' | 'unavailable' | 'invalid_manifest';

export class OfflineManifestError extends Error {
  constructor(public readonly code: OfflineManifestErrorCode) {
    super(code);
  }
}

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function isLocale(value: unknown): value is NeuralPronunciationLocale {
  return isNeuralLocale(value);
}

export function pronunciationCatalogHash(locale: NeuralPronunciationLocale) {
  return locale.startsWith('es-') ? spanishPublication.catalogSha256 : OFFLINE_MANIFEST_CATALOG_SHA256;
}

export function spanishManifestConfigured() {
  return spanishPublication.index !== null;
}

function expectedShardObjectPath(locale: NeuralPronunciationLocale, sha256: string) {
  return `${NEURAL_SYNTHESIS_VERSION}/${pronunciationCatalogHash(locale)}/${locale}/${sha256}.json`;
}

function parseShardDescriptor(value: unknown, locale: NeuralPronunciationLocale) {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    'locale', 'voiceId', 'assetCount', 'totalAudioBytes',
    'byteLength', 'sha256', 'objectPath',
  ])) throw new OfflineManifestError('invalid_manifest');
  const spanish = locale.startsWith('es-');
  const expectedCount = spanish
    ? cefrLevels.flatMap(level => pronunciationEntries(locale, level)).length
    : EXPECTED_COUNTS[locale];
  if (value.locale !== locale
    || value.voiceId !== EXPECTED_VOICES[locale]
    || value.assetCount !== expectedCount
    || !Number.isSafeInteger(value.totalAudioBytes)
    || (value.totalAudioBytes as number) < (value.assetCount as number) * 101
    || (value.totalAudioBytes as number) > (value.assetCount as number) * NEURAL_MAXIMUM_BYTES
    || (!spanish && value.totalAudioBytes !== EXPECTED_AUDIO_BYTES[locale])
    || !Number.isInteger(value.byteLength)
    || (value.byteLength as number) < 100
    || (value.byteLength as number) > OFFLINE_MANIFEST_MAXIMUM_BYTES
    || typeof value.sha256 !== 'string'
    || !SHA256_PATTERN.test(value.sha256)
    || value.objectPath !== expectedShardObjectPath(locale, value.sha256)) {
    throw new OfflineManifestError('invalid_manifest');
  }
  return value as OfflineManifestShardDescriptor;
}

export function parseOfflineManifestIndex(value: unknown): OfflineManifestIndex {
  const spanish = isPlainObject(value) && value.catalogSha256 === spanishPublication.catalogSha256;
  const locales: NeuralPronunciationLocale[] = spanish ? ['es-ES', 'es-MX'] : ['en-US', 'en-GB'];
  if (!isPlainObject(value) || !hasExactKeys(value, [
    'schemaVersion', 'catalogSha256', 'synthesisVersion', 'contentType',
    'bucket', 'assetCount', 'totalAudioBytes', 'shards',
  ]) || value.schemaVersion !== OFFLINE_MANIFEST_SCHEMA_VERSION
    || value.catalogSha256 !== (spanish ? spanishPublication.catalogSha256 : OFFLINE_MANIFEST_CATALOG_SHA256)
    || value.synthesisVersion !== NEURAL_SYNTHESIS_VERSION
    || value.contentType !== NEURAL_CONTENT_TYPE
    || value.bucket !== OFFLINE_MANIFEST_BUCKET
    || value.assetCount !== (spanish ? cefrLevels.flatMap(level => pronunciationEntries('es-ES', level)).length * 2 : 16_600)
    || (!Number.isSafeInteger(value.totalAudioBytes) || (!spanish && value.totalAudioBytes !== 284_089_824))
    || !isPlainObject(value.shards)
    || !hasExactKeys(value.shards, locales)) {
    throw new OfflineManifestError('invalid_manifest');
  }
  const shards = Object.fromEntries(locales.map(locale => [locale, parseShardDescriptor((value.shards as Record<string, unknown>)[locale], locale)]));
  if (Object.values(shards).reduce((total, shard) => total + shard.totalAudioBytes, 0) !== value.totalAudioBytes) throw new OfflineManifestError('invalid_manifest');
  return { ...value, shards } as OfflineManifestIndex;
}

export function parseOfflineManifestShard(
  value: unknown,
  descriptor: OfflineManifestShardDescriptor,
): OfflineManifestShard {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    'schemaVersion', 'catalogSha256', 'synthesisVersion', 'locale',
    'voiceId', 'assetCount', 'totalAudioBytes', 'assets',
  ]) || value.schemaVersion !== OFFLINE_MANIFEST_SCHEMA_VERSION
    || value.catalogSha256 !== pronunciationCatalogHash(descriptor.locale)
    || value.synthesisVersion !== NEURAL_SYNTHESIS_VERSION
    || value.locale !== descriptor.locale
    || value.voiceId !== descriptor.voiceId
    || value.assetCount !== descriptor.assetCount
    || value.totalAudioBytes !== descriptor.totalAudioBytes
    || !Array.isArray(value.assets)
    || value.assets.length !== descriptor.assetCount) {
    throw new OfflineManifestError('invalid_manifest');
  }
  const expectedCatalogSenseIds = cefrLevels.flatMap(level => pronunciationEntries(descriptor.locale, level).map(entry => entry.catalogSenseId)).sort();
  const assets: OfflineManifestAsset[] = [];
  const contentHashes = new Set<string>();
  let totalAudioBytes = 0;
  for (let index = 0; index < value.assets.length; index += 1) {
    const tuple = value.assets[index];
    if (!Array.isArray(tuple) || tuple.length !== 4) throw new OfflineManifestError('invalid_manifest');
    const [catalogSenseId, contentHash, sha256, byteLength] = tuple;
    if (catalogSenseId !== expectedCatalogSenseIds[index]
      || typeof contentHash !== 'string'
      || !SHA256_PATTERN.test(contentHash)
      || contentHashes.has(contentHash)
      || typeof sha256 !== 'string'
      || !SHA256_PATTERN.test(sha256)
      || !Number.isInteger(byteLength)
      || (byteLength as number) < 101
      || (byteLength as number) > NEURAL_MAXIMUM_BYTES) {
      throw new OfflineManifestError('invalid_manifest');
    }
    contentHashes.add(contentHash);
    totalAudioBytes += byteLength as number;
    assets.push({
      catalogSenseId: catalogSenseId as string,
      contentHash,
      sha256,
      byteLength: byteLength as number,
    });
  }
  if (totalAudioBytes !== descriptor.totalAudioBytes) {
    throw new OfflineManifestError('invalid_manifest');
  }
  return { ...value, assets } as OfflineManifestShard;
}

function digestHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function parseVerifiedJson(
  response: Response,
  expectedSha256: string,
  expectedBytes: number,
) {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (!response.ok
    || contentType !== 'application/json'
    || expectedBytes < 1
    || expectedBytes > OFFLINE_MANIFEST_MAXIMUM_BYTES
    || (contentLength !== null
      && (!Number.isSafeInteger(contentLength) || contentLength !== expectedBytes))) {
    throw new OfflineManifestError('invalid_manifest');
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new OfflineManifestError('unavailable');
  }
  if (bytes.byteLength !== expectedBytes) throw new OfflineManifestError('invalid_manifest');
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = digestHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, digestInput));
  if (digest !== expectedSha256) throw new OfflineManifestError('invalid_manifest');
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new OfflineManifestError('invalid_manifest');
  }
}

export function offlineManifestPublicUrl(objectPath: string) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const pathPattern = new RegExp(
    `^${NEURAL_SYNTHESIS_VERSION}/(?:${OFFLINE_MANIFEST_CATALOG_SHA256}|${spanishPublication.catalogSha256})/(?:index|en-US|en-GB|es-ES|es-MX)/[a-f0-9]{64}\\.json$`,
  );
  if (!supabaseUrl || !pathPattern.test(objectPath)) {
    throw new OfflineManifestError('configuration');
  }
  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== 'https:') throw new Error();
    return new URL(
      `/storage/v1/object/public/${OFFLINE_MANIFEST_BUCKET}/${objectPath}`,
      base,
    ).toString();
  } catch {
    throw new OfflineManifestError('configuration');
  }
}

async function fetchManifest(
  objectPath: string,
  sha256: string,
  byteLength: number,
  fetchImplementation: FetchImplementation,
) {
  let response;
  try {
    response = await fetchImplementation(offlineManifestPublicUrl(objectPath), {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new OfflineManifestError('unavailable');
  }
  return parseVerifiedJson(response, sha256, byteLength);
}

export async function fetchOfflineManifestIndex(
  fetchImplementation: FetchImplementation = fetch,
  courseId: 'en-sk' | 'es-sk' = 'en-sk',
) {
  if (courseId === 'es-sk') {
    const pinned = spanishPublication.index as { objectPath: string; sha256: string; byteLength: number } | null;
    if (!pinned) throw new OfflineManifestError('unavailable');
    if (!SHA256_PATTERN.test(pinned.sha256) || pinned.objectPath !== `${NEURAL_SYNTHESIS_VERSION}/${spanishPublication.catalogSha256}/index/${pinned.sha256}.json`) throw new OfflineManifestError('configuration');
    return parseOfflineManifestIndex(await fetchManifest(pinned.objectPath, pinned.sha256, pinned.byteLength, fetchImplementation));
  }
  const value = await fetchManifest(
    OFFLINE_MANIFEST_INDEX_OBJECT_PATH,
    OFFLINE_MANIFEST_INDEX_SHA256,
    OFFLINE_MANIFEST_INDEX_BYTES,
    fetchImplementation,
  );
  return parseOfflineManifestIndex(value);
}

export async function fetchOfflineManifestShard(
  index: OfflineManifestIndex,
  locale: NeuralPronunciationLocale,
  fetchImplementation: FetchImplementation = fetch,
) {
  if (!isLocale(locale)) throw new OfflineManifestError('invalid_manifest');
  const descriptor = parseOfflineManifestIndex(index).shards[locale];
  if (!descriptor) throw new OfflineManifestError('unavailable');
  const value = await fetchManifest(
    descriptor.objectPath,
    descriptor.sha256,
    descriptor.byteLength,
    fetchImplementation,
  );
  return parseOfflineManifestShard(value, descriptor);
}

export function offlineAudioPublicUrl(asset: OfflineManifestAsset) {
  if (!SHA256_PATTERN.test(asset.contentHash)) throw new OfflineManifestError('invalid_manifest');
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) throw new OfflineManifestError('configuration');
  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== 'https:') throw new Error();
    return new URL(
      `/storage/v1/object/public/pron-public/${NEURAL_SYNTHESIS_VERSION}/${asset.contentHash}.mp3`,
      base,
    ).toString();
  } catch {
    throw new OfflineManifestError('configuration');
  }
}
