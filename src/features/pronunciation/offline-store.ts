import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import { getCefrEntries, getCefrEntry } from '@/data/cefr-catalog';
import type { CefrLevel } from '@/domain/types';
import {
  NEURAL_MAXIMUM_BYTES,
  NEURAL_SYNTHESIS_VERSION,
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';
import { PRONUNCIATION_CACHE_DIRECTORY } from '@/features/pronunciation/cache';
import {
  OFFLINE_MANIFEST_CATALOG_SHA256,
  offlineAudioPublicUrl,
  type OfflineManifestAsset,
  type OfflineManifestShard,
} from '@/features/pronunciation/offline-manifest';

export const OFFLINE_PACK_SCHEMA_VERSION = 1;
export const OFFLINE_DOWNLOAD_CONCURRENCY = 3;
export const OFFLINE_DOWNLOAD_DISK_RESERVE_BYTES = 25 * 1024 * 1024;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MP3_EXTENSION = '.mp3';
const PLAN_FILE_NAME = 'plan.json';
const COMPLETE_FILE_NAME = 'complete.json';

export type OfflinePackPlan = {
  schemaVersion: typeof OFFLINE_PACK_SCHEMA_VERSION;
  catalogSha256: typeof OFFLINE_MANIFEST_CATALOG_SHA256;
  synthesisVersion: typeof NEURAL_SYNTHESIS_VERSION;
  shardSha256: string;
  locale: NeuralPronunciationLocale;
  level: CefrLevel;
  assetCount: number;
  totalAudioBytes: number;
  assets: OfflineManifestAsset[];
};

export type OfflinePackInspection = {
  locale: NeuralPronunciationLocale;
  level: CefrLevel;
  state: 'not_downloaded' | 'partial' | 'downloaded';
  assetCount: number;
  totalAudioBytes: number | null;
  downloadedCount: number;
  downloadedBytes: number;
  availableCatalogSenseIds: string[];
  plan: OfflinePackPlan | null;
};

export type OfflinePackProgress = {
  stage: 'verifying' | 'downloading';
  assetCount: number;
  totalBytes: number;
  completedCount: number;
  completedBytes: number;
};

type StoredPlan = Omit<OfflinePackPlan, 'assets'> & {
  assets: [string, string, string, number][];
};

type CompletionMarker = Omit<StoredPlan, 'assets'>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function expectedCatalogSenseIds(level: CefrLevel) {
  return getCefrEntries(level).map((entry) => entry.catalogSenseId).sort();
}

function packDirectory(locale: NeuralPronunciationLocale, level: CefrLevel) {
  return new Directory(
    Paths.document,
    PRONUNCIATION_CACHE_DIRECTORY,
    'offline',
    NEURAL_SYNTHESIS_VERSION,
    locale,
    level,
  );
}

function audioDirectory(locale: NeuralPronunciationLocale, level: CefrLevel) {
  return new Directory(packDirectory(locale, level), 'audio');
}

function planFile(locale: NeuralPronunciationLocale, level: CefrLevel) {
  return new File(packDirectory(locale, level), PLAN_FILE_NAME);
}

function completionFile(locale: NeuralPronunciationLocale, level: CefrLevel) {
  return new File(packDirectory(locale, level), COMPLETE_FILE_NAME);
}

function assetFile(plan: OfflinePackPlan, asset: OfflineManifestAsset) {
  return new File(audioDirectory(plan.locale, plan.level), `${asset.contentHash}${MP3_EXTENSION}`);
}

function deleteIfPresent(value: File | Directory) {
  if (value.exists) value.delete();
}

function cleanupTemporaryFiles(directory: Directory) {
  if (!directory.exists) return;
  for (const item of directory.list()) {
    if (item instanceof File && item.name.includes('.tmp.')) deleteIfPresent(item);
  }
}

function digestHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hasMp3Signature(bytes: Uint8Array) {
  return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

async function verifyAudioFile(file: File, asset: OfflineManifestAsset) {
  if (!file.exists || (file.info().size ?? 0) !== asset.byteLength) return false;
  try {
    const bytes = await file.bytes();
    if (bytes.byteLength !== asset.byteLength || !hasMp3Signature(bytes)) return false;
    const digest = digestHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
    return digest === asset.sha256;
  } catch {
    return false;
  }
}

function parseStoredPlan(value: unknown, locale: NeuralPronunciationLocale, level: CefrLevel) {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    'schemaVersion', 'catalogSha256', 'synthesisVersion', 'shardSha256',
    'locale', 'level', 'assetCount', 'totalAudioBytes', 'assets',
  ]) || value.schemaVersion !== OFFLINE_PACK_SCHEMA_VERSION
    || value.catalogSha256 !== OFFLINE_MANIFEST_CATALOG_SHA256
    || value.synthesisVersion !== NEURAL_SYNTHESIS_VERSION
    || value.locale !== locale
    || value.level !== level
    || typeof value.shardSha256 !== 'string'
    || !SHA256_PATTERN.test(value.shardSha256)
    || !Number.isInteger(value.assetCount)
    || !Number.isInteger(value.totalAudioBytes)
    || !Array.isArray(value.assets)) return null;

  const expectedIds = expectedCatalogSenseIds(level);
  if (value.assetCount !== expectedIds.length || value.assets.length !== expectedIds.length) return null;
  const assets: OfflineManifestAsset[] = [];
  const contentHashes = new Set<string>();
  let totalAudioBytes = 0;
  for (let index = 0; index < value.assets.length; index += 1) {
    const tuple = value.assets[index];
    if (!Array.isArray(tuple) || tuple.length !== 4) return null;
    const [catalogSenseId, contentHash, sha256, byteLength] = tuple;
    if (catalogSenseId !== expectedIds[index]
      || typeof contentHash !== 'string' || !SHA256_PATTERN.test(contentHash)
      || contentHashes.has(contentHash)
      || typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)
      || !Number.isInteger(byteLength) || (byteLength as number) < 101
      || (byteLength as number) > NEURAL_MAXIMUM_BYTES) return null;
    contentHashes.add(contentHash);
    totalAudioBytes += byteLength as number;
    assets.push({
      catalogSenseId: catalogSenseId as string,
      contentHash,
      sha256,
      byteLength: byteLength as number,
    });
  }
  if (totalAudioBytes !== value.totalAudioBytes) return null;
  return { ...value, assets } as OfflinePackPlan;
}

function storedPlan(plan: OfflinePackPlan): StoredPlan {
  return {
    ...plan,
    assets: plan.assets.map((asset) => [
      asset.catalogSenseId,
      asset.contentHash,
      asset.sha256,
      asset.byteLength,
    ]),
  };
}

function completionMarker(plan: OfflinePackPlan): CompletionMarker {
  const { assets: _assets, ...marker } = storedPlan(plan);
  return marker;
}

function parseCompletionMarker(value: unknown, plan: OfflinePackPlan) {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    'schemaVersion', 'catalogSha256', 'synthesisVersion', 'shardSha256',
    'locale', 'level', 'assetCount', 'totalAudioBytes',
  ])) return false;
  return JSON.stringify(value) === JSON.stringify(completionMarker(plan));
}

async function writeJsonAtomic(file: File, value: unknown) {
  file.parentDirectory.create({ idempotent: true, intermediates: true });
  const temporary = new File(file.parentDirectory, `${file.name}.${Crypto.randomUUID()}.tmp.json`);
  try {
    temporary.create({ overwrite: false, intermediates: true });
    temporary.write(`${JSON.stringify(value)}\n`);
    await temporary.move(file, { overwrite: true });
  } finally {
    if (temporary.uri !== file.uri) deleteIfPresent(temporary);
  }
}

async function readPlan(locale: NeuralPronunciationLocale, level: CefrLevel) {
  const file = planFile(locale, level);
  if (!file.exists) return null;
  try {
    return parseStoredPlan(JSON.parse(await file.text()), locale, level);
  } catch {
    return null;
  }
}

export function buildOfflinePackPlan(
  shard: OfflineManifestShard,
  level: CefrLevel,
  shardSha256: string,
): OfflinePackPlan {
  if (!SHA256_PATTERN.test(shardSha256)) throw new Error('Offline pronunciation shard identity is invalid.');
  const expectedIds = new Set(expectedCatalogSenseIds(level));
  const assets = shard.assets.filter((asset) => expectedIds.has(asset.catalogSenseId));
  const plan: OfflinePackPlan = {
    schemaVersion: OFFLINE_PACK_SCHEMA_VERSION,
    catalogSha256: OFFLINE_MANIFEST_CATALOG_SHA256,
    synthesisVersion: NEURAL_SYNTHESIS_VERSION,
    shardSha256,
    locale: shard.locale,
    level,
    assetCount: assets.length,
    totalAudioBytes: assets.reduce((total, asset) => total + asset.byteLength, 0),
    assets,
  };
  const parsed = parseStoredPlan(storedPlan(plan), shard.locale, level);
  if (!parsed) throw new Error(`Offline pronunciation ${shard.locale} ${level} plan is incomplete.`);
  return parsed;
}

export async function saveOfflinePackPlan(plan: OfflinePackPlan) {
  const parsed = parseStoredPlan(storedPlan(plan), plan.locale, plan.level);
  if (!parsed) throw new Error('Offline pronunciation plan is invalid.');
  const directory = packDirectory(plan.locale, plan.level);
  directory.create({ idempotent: true, intermediates: true });
  audioDirectory(plan.locale, plan.level).create({ idempotent: true, intermediates: true });
  await writeJsonAtomic(planFile(plan.locale, plan.level), storedPlan(parsed));
}

function emptyInspection(locale: NeuralPronunciationLocale, level: CefrLevel): OfflinePackInspection {
  return {
    locale,
    level,
    state: 'not_downloaded',
    assetCount: expectedCatalogSenseIds(level).length,
    totalAudioBytes: null,
    downloadedCount: 0,
    downloadedBytes: 0,
    availableCatalogSenseIds: [],
    plan: null,
  };
}

export async function inspectOfflinePack(
  locale: NeuralPronunciationLocale,
  level: CefrLevel,
): Promise<OfflinePackInspection> {
  const directory = packDirectory(locale, level);
  if (!directory.exists) return emptyInspection(locale, level);
  cleanupTemporaryFiles(directory);
  cleanupTemporaryFiles(audioDirectory(locale, level));
  const plan = await readPlan(locale, level);
  if (!plan) {
    deleteIfPresent(directory);
    return emptyInspection(locale, level);
  }
  const markerFile = completionFile(locale, level);
  if (markerFile.exists && audioDirectory(locale, level).exists) {
    try {
      if (parseCompletionMarker(JSON.parse(await markerFile.text()), plan)) {
        return {
          locale,
          level,
          state: 'downloaded',
          assetCount: plan.assetCount,
          totalAudioBytes: plan.totalAudioBytes,
          downloadedCount: plan.assetCount,
          downloadedBytes: plan.totalAudioBytes,
          availableCatalogSenseIds: plan.assets.map((asset) => asset.catalogSenseId),
          plan,
        };
      }
    } catch {
      // Invalid completion metadata falls back to inspecting the partial files below.
    }
    deleteIfPresent(markerFile);
  }
  const availableCatalogSenseIds: string[] = [];
  let downloadedBytes = 0;
  for (const asset of plan.assets) {
    const file = assetFile(plan, asset);
    if (file.exists && (file.info().size ?? 0) === asset.byteLength) {
      availableCatalogSenseIds.push(asset.catalogSenseId);
      downloadedBytes += asset.byteLength;
    } else if (file.exists) {
      deleteIfPresent(file);
    }
  }
  return {
    locale,
    level,
    state: 'partial',
    assetCount: plan.assetCount,
    totalAudioBytes: plan.totalAudioBytes,
    downloadedCount: availableCatalogSenseIds.length,
    downloadedBytes,
    availableCatalogSenseIds,
    plan,
  };
}

function abortError() {
  const error = new Error('Offline pronunciation download was cancelled.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

export async function downloadOfflinePack(
  plan: OfflinePackPlan,
  options: {
    signal: AbortSignal;
    onProgress?: (progress: OfflinePackProgress) => void;
  },
) {
  await saveOfflinePackPlan(plan);
  deleteIfPresent(completionFile(plan.locale, plan.level));
  const completed = new Set<string>();
  let completedBytes = 0;
  options.onProgress?.({
    stage: 'verifying',
    assetCount: plan.assetCount,
    totalBytes: plan.totalAudioBytes,
    completedCount: 0,
    completedBytes: 0,
  });
  for (const asset of plan.assets) {
    throwIfAborted(options.signal);
    const destination = assetFile(plan, asset);
    if (await verifyAudioFile(destination, asset)) {
      completed.add(asset.contentHash);
      completedBytes += asset.byteLength;
    } else {
      deleteIfPresent(destination);
    }
  }

  const pending = plan.assets.filter((asset) => !completed.has(asset.contentHash));
  let nextIndex = 0;
  let failed = false;
  const activeBytes = new Map<string, number>();
  const report = () => options.onProgress?.({
    stage: 'downloading',
    assetCount: plan.assetCount,
    totalBytes: plan.totalAudioBytes,
    completedCount: completed.size,
    completedBytes: Math.min(
      plan.totalAudioBytes,
      completedBytes + [...activeBytes.values()].reduce((total, value) => total + value, 0),
    ),
  });
  report();

  const worker = async () => {
    while (true) {
      if (failed) return;
      throwIfAborted(options.signal);
      const index = nextIndex;
      nextIndex += 1;
      if (index >= pending.length) return;
      const asset = pending[index];
      const destination = assetFile(plan, asset);
      const temporary = new File(
        destination.parentDirectory,
        `${asset.contentHash}.${Crypto.randomUUID()}.tmp.mp3`,
      );
      activeBytes.set(asset.contentHash, 0);
      try {
        const task = File.createDownloadTask(offlineAudioPublicUrl(asset), temporary, {
          signal: options.signal,
          sessionType: 'foreground',
          onProgress: ({ bytesWritten }) => {
            activeBytes.set(asset.contentHash, Math.min(asset.byteLength, Math.max(0, bytesWritten)));
            report();
          },
        });
        const downloaded = await task.downloadAsync();
        throwIfAborted(options.signal);
        if (!downloaded || !await verifyAudioFile(temporary, asset)) {
          throw new Error('Downloaded pronunciation audio could not be verified.');
        }
        if (destination.exists) deleteIfPresent(destination);
        await temporary.move(destination);
        if (!await verifyAudioFile(destination, asset)) {
          deleteIfPresent(destination);
          throw new Error('Stored pronunciation audio could not be verified.');
        }
        completed.add(asset.contentHash);
        completedBytes += asset.byteLength;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        activeBytes.delete(asset.contentHash);
        if (temporary.uri !== destination.uri) deleteIfPresent(temporary);
        report();
      }
    }
  };

  const results = await Promise.allSettled(Array.from(
    { length: Math.min(OFFLINE_DOWNLOAD_CONCURRENCY, Math.max(1, pending.length)) },
    () => worker(),
  ));
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  throwIfAborted(options.signal);
  if (completed.size !== plan.assetCount || completedBytes !== plan.totalAudioBytes) {
    throw new Error('Offline pronunciation pack is incomplete.');
  }
  await writeJsonAtomic(completionFile(plan.locale, plan.level), completionMarker(plan));
  return inspectOfflinePack(plan.locale, plan.level);
}

export function offlineAvailableDiskSpace() {
  return Paths.availableDiskSpace;
}

export function removeOfflinePack(locale: NeuralPronunciationLocale, level: CefrLevel) {
  deleteIfPresent(packDirectory(locale, level));
}

export function removeOfflineLocale(locale: NeuralPronunciationLocale) {
  const directory = new Directory(
    Paths.document,
    PRONUNCIATION_CACHE_DIRECTORY,
    'offline',
    NEURAL_SYNTHESIS_VERSION,
    locale,
  );
  deleteIfPresent(directory);
}

export async function getOfflinePronunciationFile(
  catalogSenseId: string,
  locale: NeuralPronunciationLocale,
) {
  const entry = getCefrEntry(catalogSenseId);
  if (!entry) return null;
  const plan = await readPlan(locale, entry.level);
  const asset = plan?.assets.find((candidate) => candidate.catalogSenseId === catalogSenseId);
  if (!plan || !asset) return null;
  const file = assetFile(plan, asset);
  if (await verifyAudioFile(file, asset)) return file;
  deleteIfPresent(file);
  deleteIfPresent(completionFile(locale, entry.level));
  return null;
}

export async function deleteOfflinePronunciationFile(
  catalogSenseId: string,
  locale: NeuralPronunciationLocale,
) {
  const entry = getCefrEntry(catalogSenseId);
  if (!entry) return;
  const plan = await readPlan(locale, entry.level);
  const asset = plan?.assets.find((candidate) => candidate.catalogSenseId === catalogSenseId);
  if (!plan || !asset) return;
  deleteIfPresent(assetFile(plan, asset));
  deleteIfPresent(completionFile(locale, entry.level));
}
