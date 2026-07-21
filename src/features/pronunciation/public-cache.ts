import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import {
  NEURAL_CONTENT_TYPE,
  NEURAL_SYNTHESIS_VERSION,
  NeuralPronunciationError,
  parseNeuralPronunciationResponse,
  type NeuralPronunciationAsset,
  type NeuralPronunciationLocale,
} from '@/features/pronunciation/cloud';
import {
  enforcePronunciationCacheLimit,
  PRONUNCIATION_CACHE_DIRECTORY,
} from '@/features/pronunciation/cache';

type PublicCacheDescriptor = {
  schemaVersion: 1;
  catalogSenseId: string;
  locale: NeuralPronunciationLocale;
  asset: NeuralPronunciationAsset;
};

const inFlight = new Map<string, Promise<File>>();

function publicDirectory() {
  return new Directory(
    Paths.cache,
    PRONUNCIATION_CACHE_DIRECTORY,
    'public',
    NEURAL_SYNTHESIS_VERSION,
  );
}

async function lookupKey(catalogSenseId: string, locale: NeuralPronunciationLocale) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify([NEURAL_SYNTHESIS_VERSION, catalogSenseId, locale]),
  );
}

function deleteIfPresent(file: File) {
  if (file.exists) file.delete();
}

function hasMp3Signature(bytes: Uint8Array) {
  return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

function digestHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validateFile(file: File, asset: NeuralPronunciationAsset) {
  if (!file.exists || (file.info().size ?? 0) !== asset.byteLength) return false;
  try {
    const bytes = await file.bytes();
    if (bytes.byteLength !== asset.byteLength || !hasMp3Signature(bytes)) return false;
    const sha256 = digestHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
    return sha256 === asset.sha256;
  } catch {
    return false;
  }
}

function parseDescriptor(
  value: unknown,
  catalogSenseId: string,
  locale: NeuralPronunciationLocale,
): PublicCacheDescriptor | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const descriptor = value as Partial<PublicCacheDescriptor>;
  if (descriptor.schemaVersion !== 1
    || descriptor.catalogSenseId !== catalogSenseId
    || descriptor.locale !== locale) return null;
  try {
    const parsed = parseNeuralPronunciationResponse(
      { status: 'ready', asset: descriptor.asset },
      locale,
    );
    if (parsed.status !== 'ready') return null;
    return { ...descriptor, asset: parsed.asset } as PublicCacheDescriptor;
  } catch {
    return null;
  }
}

export async function getCachedNeuralPronunciationFile(
  catalogSenseId: string,
  locale: NeuralPronunciationLocale,
): Promise<File | null> {
  const directory = publicDirectory();
  const key = await lookupKey(catalogSenseId, locale);
  const descriptorFile = new File(directory, `${key}.json`);
  if (!descriptorFile.exists) return null;

  let descriptor: PublicCacheDescriptor | null = null;
  try {
    descriptor = parseDescriptor(JSON.parse(await descriptorFile.text()), catalogSenseId, locale);
  } catch {
    descriptor = null;
  }
  if (!descriptor) {
    deleteIfPresent(descriptorFile);
    return null;
  }
  const audioFile = new File(directory, `${descriptor.asset.contentHash}.mp3`);
  if (await validateFile(audioFile, descriptor.asset)) return audioFile;
  deleteIfPresent(audioFile);
  deleteIfPresent(descriptorFile);
  return null;
}

export async function deleteCachedNeuralPronunciation(
  catalogSenseId: string,
  locale: NeuralPronunciationLocale,
) {
  const directory = publicDirectory();
  const key = await lookupKey(catalogSenseId, locale);
  const descriptorFile = new File(directory, `${key}.json`);
  if (!descriptorFile.exists) return;

  try {
    const descriptor = parseDescriptor(JSON.parse(await descriptorFile.text()), catalogSenseId, locale);
    if (descriptor) deleteIfPresent(new File(directory, `${descriptor.asset.contentHash}.mp3`));
  } catch {
    // The descriptor itself is invalid, so there is no trusted audio filename to remove.
  }
  deleteIfPresent(descriptorFile);
}

async function downloadAndStore(
  catalogSenseId: string,
  asset: NeuralPronunciationAsset,
  key: string,
) {
  if (asset.contentType !== NEURAL_CONTENT_TYPE) {
    throw new NeuralPronunciationError('invalid_response');
  }
  const directory = publicDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, `${asset.contentHash}.mp3`);
  const descriptorFile = new File(directory, `${key}.json`);
  if (await validateFile(destination, asset)) {
    await writeDescriptor(descriptorFile, { schemaVersion: 1, catalogSenseId, locale: asset.locale, asset });
    return destination;
  }
  deleteIfPresent(destination);
  deleteIfPresent(descriptorFile);

  const temporary = new File(
    directory,
    `${asset.contentHash}.${Crypto.randomUUID()}.tmp.mp3`,
  );
  try {
    await File.downloadFileAsync(asset.publicUrl, temporary, { idempotent: false });
    if (!await validateFile(temporary, asset)) {
      throw new NeuralPronunciationError('invalid_response');
    }
    if (destination.exists) {
      if (!await validateFile(destination, asset)) deleteIfPresent(destination);
    }
    if (destination.exists) deleteIfPresent(temporary);
    else await temporary.move(destination);
    if (!await validateFile(destination, asset)) {
      deleteIfPresent(destination);
      throw new NeuralPronunciationError('invalid_response');
    }
    await writeDescriptor(descriptorFile, { schemaVersion: 1, catalogSenseId, locale: asset.locale, asset });
    await enforcePronunciationCacheLimit();
    if (!await validateFile(destination, asset)) {
      deleteIfPresent(descriptorFile);
      throw new NeuralPronunciationError('unavailable');
    }
    return destination;
  } catch (error) {
    deleteIfPresent(temporary);
    if (error instanceof NeuralPronunciationError) throw error;
    throw new NeuralPronunciationError('unavailable');
  }
}

async function writeDescriptor(file: File, descriptor: PublicCacheDescriptor) {
  const temporary = new File(file.parentDirectory, `${file.name}.${Crypto.randomUUID()}.tmp.json`);
  try {
    temporary.create({ overwrite: false, intermediates: true });
    temporary.write(JSON.stringify(descriptor));
    await temporary.move(file, { overwrite: true });
  } finally {
    if (temporary.uri !== file.uri) deleteIfPresent(temporary);
  }
}

export async function cacheNeuralPronunciationFile(
  catalogSenseId: string,
  asset: NeuralPronunciationAsset,
) {
  const key = await lookupKey(catalogSenseId, asset.locale);
  const flightKey = `${key}:${asset.contentHash}`;
  const existing = inFlight.get(flightKey);
  if (existing) return existing;
  const task = downloadAndStore(catalogSenseId, asset, key)
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, task);
  return task;
}
