import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import WordfoldPronunciation from '../../../modules/wordfold-pronunciation';

export type PronunciationCacheScope =
  | { type: 'guest' }
  | { type: 'account'; userId: string }
  | { type: 'public' };

export interface CachedPronunciationInput {
  text: string;
  locale: string;
  voiceIdentifier: string;
  scope: PronunciationCacheScope;
}

export const PRONUNCIATION_CACHE_DIRECTORY = 'wordfold-pronunciation';
const SYNTHESIS_VERSION = 'device-v1';
const RATE = 0.9;
const PITCH = 1;
const MINIMUM_AUDIO_FILE_BYTES = 44;
export const PRONUNCIATION_CACHE_LIMIT_BYTES = 64 * 1024 * 1024;

const inFlight = new Map<string, Promise<File>>();

function outputExtension() {
  return Platform.OS === 'ios' ? 'caf' : 'wav';
}

async function accountDirectoryName(userId: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId);
}

async function scopeDirectory(scope: PronunciationCacheScope) {
  const root = new Directory(Paths.cache, PRONUNCIATION_CACHE_DIRECTORY);
  if (scope.type === 'account') {
    return new Directory(root, 'account', await accountDirectoryName(scope.userId), SYNTHESIS_VERSION);
  }
  return new Directory(root, scope.type, SYNTHESIS_VERSION);
}

export async function pronunciationCacheKey(input: Omit<CachedPronunciationInput, 'scope'>) {
  const identity = JSON.stringify([
    SYNTHESIS_VERSION,
    Platform.OS,
    input.text.trim(),
    input.locale,
    input.voiceIdentifier,
    RATE,
    PITCH,
    outputExtension(),
  ]);
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, identity);
}

function isValidAudioFile(file: File) {
  if (!file.exists) return false;
  return (file.info().size ?? 0) > MINIMUM_AUDIO_FILE_BYTES;
}

function deleteIfPresent(file: File) {
  if (file.exists) file.delete();
}

async function synthesizeAndStore(input: CachedPronunciationInput, key: string) {
  if (!WordfoldPronunciation) {
    throw new Error('Pronunciation caching requires an Android or iOS development build.');
  }
  const directory = await scopeDirectory(input.scope);
  directory.create({ idempotent: true, intermediates: true });
  const extension = outputExtension();
  const destination = new File(directory, `${key}.${extension}`);
  if (isValidAudioFile(destination)) return destination;
  deleteIfPresent(destination);

  const temporary = new File(directory, `${key}.${Crypto.randomUUID()}.tmp.${extension}`);
  try {
    const reportedSize = await WordfoldPronunciation.synthesizeToFile({
      text: input.text.trim(),
      locale: input.locale,
      voiceIdentifier: input.voiceIdentifier,
      rate: RATE,
      pitch: PITCH,
      outputUri: temporary.uri,
    });
    const actualSize = temporary.info().size ?? 0;
    if (reportedSize <= MINIMUM_AUDIO_FILE_BYTES || actualSize <= MINIMUM_AUDIO_FILE_BYTES) {
      throw new Error('The device speech engine produced no playable pronunciation audio.');
    }
    if (destination.exists) {
      deleteIfPresent(temporary);
      if (!isValidAudioFile(destination)) throw new Error('The pronunciation cache file is invalid.');
      return destination;
    }
    await temporary.move(destination);
    if (!isValidAudioFile(destination)) {
      deleteIfPresent(destination);
      throw new Error('The pronunciation cache file could not be validated.');
    }
    await enforcePronunciationCacheLimit();
    return destination;
  } catch (error) {
    deleteIfPresent(temporary);
    throw error;
  }
}

export async function getCachedPronunciationFile(input: CachedPronunciationInput) {
  const text = input.text.trim();
  const key = await pronunciationCacheKey({
    text,
    locale: input.locale,
    voiceIdentifier: input.voiceIdentifier,
  });
  const directory = await scopeDirectory(input.scope);
  const destination = new File(directory, `${key}.${outputExtension()}`);
  if (isValidAudioFile(destination)) return destination;

  const flightKey = destination.uri;
  const existing = inFlight.get(flightKey);
  if (existing) return existing;
  const task = synthesizeAndStore({ ...input, text }, key).finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, task);
  return task;
}

export function deleteCachedPronunciationFile(file: File) {
  deleteIfPresent(file);
}

export async function clearPronunciationAccountCache(userId: string) {
  if (Platform.OS === 'web' || !userId) return;
  const accountDirectory = new Directory(
    Paths.cache,
    PRONUNCIATION_CACHE_DIRECTORY,
    'account',
    await accountDirectoryName(userId),
  );
  if (accountDirectory.exists) accountDirectory.delete();
}

function collectCacheFiles(directory: Directory): File[] {
  if (!directory.exists) return [];
  return directory.list().flatMap((entry) => {
    if (entry instanceof Directory) return collectCacheFiles(entry);
    return [entry];
  });
}

export async function enforcePronunciationCacheLimit(limit = PRONUNCIATION_CACHE_LIMIT_BYTES) {
  const root = new Directory(Paths.cache, PRONUNCIATION_CACHE_DIRECTORY);
  const cacheFiles = collectCacheFiles(root);
  cacheFiles.filter((file) => /\.tmp\.(caf|wav|mp3|json)$/i.test(file.uri)).forEach(deleteIfPresent);
  const files = cacheFiles.filter((file) => /\.(caf|wav|mp3)$/i.test(file.uri) && !/\.tmp\./i.test(file.uri)).map((file) => {
    const info = file.info();
    return {
      file,
      size: info.size ?? 0,
      createdAt: info.creationTime ?? info.modificationTime ?? 0,
    };
  }).sort((left, right) => left.createdAt - right.createdAt);
  let total = files.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of files) {
    if (total <= limit) break;
    deleteIfPresent(entry.file);
    total -= entry.size;
  }
}
