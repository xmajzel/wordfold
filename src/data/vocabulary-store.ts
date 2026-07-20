import type { SQLiteDatabase } from 'expo-sqlite';

import type { Collection, DashboardStats, LearningRating, Word } from '@/domain/types';
import * as guestRepository from '@/data/repository';
import * as syncRepository from '@/data/sync/repository';
import type { RatingUpdate } from '@/features/learning/algorithm';

export interface VocabularyStore {
  listWords(): Promise<Word[]>;
  getWord(id: string): Promise<Word | null>;
  listCollections(): Promise<Collection[]>;
  getStats(): Promise<DashboardStats>;
  createWord(input: guestRepository.NewWordInput): Promise<string>;
  createWords(inputs: guestRepository.NewWordInput[]): Promise<string[]>;
  editWord(id: string, input: guestRepository.NewWordInput): Promise<void>;
  saveWordTranslation(id: string, translation: string): Promise<string>;
  updateMissingWordTranslations(updates: { id: string; translation: string }[]): Promise<{
    updatedAt: string | null;
    updatedIds: string[];
  }>;
  removeWord(id: string): Promise<void>;
  resetWord(id: string): Promise<void>;
  createCollection(name: string, color: string): Promise<string>;
  saveRating(id: string, rating: LearningRating, update: RatingUpdate): Promise<void>;
  recordView(id: string, occurredAt?: string): Promise<void>;
  recordNotificationOpen(wordId: string | null): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

export function createGuestVocabularyStore(database: SQLiteDatabase): VocabularyStore {
  return {
    listWords: () => guestRepository.listWords(database),
    getWord: (id) => guestRepository.getWord(database, id),
    listCollections: () => guestRepository.listCollections(database),
    getStats: () => guestRepository.getStats(database),
    createWord: (input) => guestRepository.addWord(database, input),
    createWords: (inputs) => guestRepository.addWords(database, inputs),
    editWord: (id, input) => guestRepository.updateWord(database, id, input),
    saveWordTranslation: (id, translation) => guestRepository.updateWordTranslation(database, id, translation),
    updateMissingWordTranslations: (updates) => guestRepository.updateMissingWordTranslations(database, updates),
    removeWord: (id) => guestRepository.deleteWord(database, id),
    resetWord: (id) => guestRepository.resetWord(database, id),
    createCollection: (name, color) => guestRepository.addCollection(database, name, color),
    saveRating: (id, rating, update) => guestRepository.saveRating(database, id, rating, update),
    recordView: (id, occurredAt) => guestRepository.recordView(database, id, occurredAt),
    recordNotificationOpen: (wordId) => guestRepository.recordNotificationOpen(database, wordId),
    subscribe: () => () => undefined,
  };
}

interface PowerSyncStoreDatabase extends syncRepository.SyncRepositoryDatabase {
  onChange(
    handler: { onChange(): void; onError?(error: Error): void },
    options: { tables: string[]; throttleMs?: number },
  ): () => void;
}

export function createSyncVocabularyStore(database: PowerSyncStoreDatabase, userId: string): VocabularyStore {
  return {
    listWords: () => syncRepository.listSyncWords(database),
    getWord: (id) => syncRepository.getSyncWord(database, id),
    listCollections: () => syncRepository.listSyncCollections(database),
    getStats: () => syncRepository.getSyncStats(database),
    createWord: (input) => syncRepository.addSyncWord(database, userId, input),
    createWords: (inputs) => syncRepository.addSyncWords(database, userId, inputs),
    editWord: (id, input) => syncRepository.updateSyncWord(database, id, input),
    saveWordTranslation: (id, translation) => syncRepository.updateSyncWordTranslation(database, id, translation),
    updateMissingWordTranslations: (updates) => syncRepository.updateMissingSyncWordTranslations(database, updates),
    removeWord: (id) => syncRepository.deleteSyncWord(database, id),
    resetWord: (id) => syncRepository.resetSyncWord(database, id),
    createCollection: (name, color) => syncRepository.addSyncCollection(database, userId, name, color),
    saveRating: (id, rating, update) => syncRepository.saveSyncRating(database, userId, id, rating, update),
    recordView: (id, occurredAt) => syncRepository.recordSyncView(database, userId, id, occurredAt),
    recordNotificationOpen: (wordId) => syncRepository.recordSyncNotificationOpen(database, userId, wordId),
    subscribe: (onChange) => database.onChange({ onChange }, {
      tables: ['collections', 'words', 'learning_events'], throttleMs: 100,
    }),
  };
}
