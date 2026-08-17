import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import {
  PRIVATE_NEURAL_CONTENT_TYPE,
  PRIVATE_NEURAL_SYNTHESIS_VERSION,
  PrivateNeuralPronunciationError,
  parsePrivateNeuralAssetMetadata,
  type PrivateNeuralPronunciationAsset,
  type PrivateNeuralPronunciationAssetMetadata,
  type PrivateNeuralPronunciationLocale,
} from '@/features/pronunciation/private-cloud';
import {
  enforcePronunciationCacheLimit,
  pronunciationAccountDirectoryName,
  PRONUNCIATION_CACHE_DIRECTORY,
} from '@/features/pronunciation/cache';

type PrivateCacheDescriptor = {
  schemaVersion: 1;
  inputHash: string;
  locale: PrivateNeuralPronunciationLocale;
  asset: PrivateNeuralPronunciationAssetMetadata;
};

const inFlight = new Map<string, Promise<File>>();

async function privateDirectory(userId: string) {
  return new Directory(
    Paths.cache,
    PRONUNCIATION_CACHE_DIRECTORY,
    'account',
    await pronunciationAccountDirectoryName(userId),
    PRIVATE_NEURAL_SYNTHESIS_VERSION,
  );
}

async function inputHash(text: string, locale: PrivateNeuralPronunciationLocale) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify([PRIVATE_NEURAL_SYNTHESIS_VERSION, text, locale]),
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

async function validateFile(file: File, asset: PrivateNeuralPronunciationAssetMetadata) {
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
  expectedInputHash: string,
  locale: PrivateNeuralPronunciationLocale,
): PrivateCacheDescriptor | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const descriptor = value as Partial<PrivateCacheDescriptor>;
  if (descriptor.schemaVersion !== 1
    || descriptor.inputHash !== expectedInputHash
    || descriptor.locale !== locale) return null;
  try {
    const asset = parsePrivateNeuralAssetMetadata(descriptor.asset, locale);
    return { schemaVersion: 1, inputHash: expectedInputHash, locale, asset };
  } catch {
    return null;
  }
}

export async function getCachedPrivateNeuralPronunciationFile(
  text: string,
  locale: PrivateNeuralPronunciationLocale,
  userId: string,
): Promise<File | null> {
  const directory = await privateDirectory(userId);
  const hash = await inputHash(text, locale);
  const descriptorFile = new File(directory, `${hash}.json`);
  if (!descriptorFile.exists) return null;

  let descriptor: PrivateCacheDescriptor | null = null;
  try {
    descriptor = parseDescriptor(JSON.parse(await descriptorFile.text()), hash, locale);
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

export async function deleteCachedPrivateNeuralPronunciation(
  text: string,
  locale: PrivateNeuralPronunciationLocale,
  userId: string,
) {
  const directory = await privateDirectory(userId);
  const hash = await inputHash(text, locale);
  const descriptorFile = new File(directory, `${hash}.json`);
  if (!descriptorFile.exists) return;

  try {
    const descriptor = parseDescriptor(JSON.parse(await descriptorFile.text()), hash, locale);
    if (descriptor) deleteIfPresent(new File(directory, `${descriptor.asset.contentHash}.mp3`));
  } catch {
    // An invalid descriptor cannot provide a trusted audio filename.
  }
  deleteIfPresent(descriptorFile);
}

async function writeDescriptor(file: File, descriptor: PrivateCacheDescriptor) {
  const temporary = new File(file.parentDirectory, `${file.name}.${Crypto.randomUUID()}.tmp.json`);
  try {
    temporary.create({ overwrite: false, intermediates: true });
    temporary.write(JSON.stringify(descriptor));
    await temporary.move(file, { overwrite: true });
  } finally {
    if (temporary.uri !== file.uri) deleteIfPresent(temporary);
  }
}

async function downloadAndStore(
  userId: string,
  asset: PrivateNeuralPronunciationAsset,
  hash: string,
) {
  if (asset.contentType !== PRIVATE_NEURAL_CONTENT_TYPE) {
    throw new PrivateNeuralPronunciationError('invalid_response');
  }
  const directory = await privateDirectory(userId);
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, `${asset.contentHash}.mp3`);
  const descriptorFile = new File(directory, `${hash}.json`);
  const { signedUrl: _signedUrl, expiresInSeconds: _expiresInSeconds, ...metadata } = asset;
  const descriptor: PrivateCacheDescriptor = {
    schemaVersion: 1,
    inputHash: hash,
    locale: asset.locale,
    asset: metadata,
  };

  if (await validateFile(destination, metadata)) {
    await writeDescriptor(descriptorFile, descriptor);
    return destination;
  }
  deleteIfPresent(destination);
  deleteIfPresent(descriptorFile);

  const temporary = new File(
    directory,
    `${asset.contentHash}.${Crypto.randomUUID()}.tmp.mp3`,
  );
  try {
    await File.downloadFileAsync(asset.signedUrl, temporary, { idempotent: false });
    if (!await validateFile(temporary, metadata)) {
      throw new PrivateNeuralPronunciationError('invalid_response');
    }
    if (destination.exists) {
      if (!await validateFile(destination, metadata)) deleteIfPresent(destination);
    }
    if (destination.exists) deleteIfPresent(temporary);
    else await temporary.move(destination);
    if (!await validateFile(destination, metadata)) {
      deleteIfPresent(destination);
      throw new PrivateNeuralPronunciationError('invalid_response');
    }
    await writeDescriptor(descriptorFile, descriptor);
    await enforcePronunciationCacheLimit();
    if (!await validateFile(destination, metadata)) {
      deleteIfPresent(descriptorFile);
      throw new PrivateNeuralPronunciationError('unavailable');
    }
    return destination;
  } catch (error) {
    deleteIfPresent(temporary);
    if (error instanceof PrivateNeuralPronunciationError) throw error;
    throw new PrivateNeuralPronunciationError('unavailable');
  }
}

export async function cachePrivateNeuralPronunciationFile(
  text: string,
  userId: string,
  asset: PrivateNeuralPronunciationAsset,
) {
  const hash = await inputHash(text, asset.locale);
  const flightKey = `${userId}:${hash}:${asset.contentHash}`;
  const existing = inFlight.get(flightKey);
  if (existing) return existing;
  const task = downloadAndStore(userId, asset, hash)
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, task);
  return task;
}

export async function clearPrivateNeuralPronunciationCache(userId: string) {
  if (!userId) return;
  const directory = await privateDirectory(userId);
  if (directory.exists) directory.delete();
}
