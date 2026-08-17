import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createGuestImportPlan,
  getGuestImportRecord,
  listGuestImportMappings,
  loadGuestImportSnapshot,
  markGuestImportMappingsAccepted,
  reassignGuestImportWordMapping,
  saveGuestImportConflict,
  saveGuestImportRecord,
  type GuestCollectionRow,
  type GuestImportSnapshot,
  type GuestLearningEventRow,
  type GuestWordRow,
} from './guest-import-repository';
import type { GuestImportRemote, RemoteImportRow } from './guest-import-remote';
import { GuestImportRemoteError } from './guest-import-remote';
import type {
  GuestImportConflict,
  GuestImportConflictResolution,
  GuestImportEntityType,
  GuestImportMapping,
  GuestImportRecord,
  GuestImportViewModel,
} from './guest-import-types';
import { emptyGuestImportCounts } from './guest-import-types';

const BATCH_SIZE = 100;
const VERIFY_TIMEOUT_MS = 30_000;
const VERIFY_POLL_MS = 500;

interface PowerSyncImportDatabase {
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
}

interface GuestImportServiceOptions {
  createUuid?: () => string;
  now?: () => Date;
  verifyTimeoutMs?: number;
  verifyPollMs?: number;
}

export class GuestImportCancelledError extends Error {}

export class GuestImportService {
  private activeController: AbortController | null = null;
  private activeTask: Promise<GuestImportViewModel> | null = null;
  private readonly createUuid: () => string;
  private readonly now: () => Date;
  private readonly verifyTimeoutMs: number;
  private readonly verifyPollMs: number;

  constructor(
    private readonly database: SQLiteDatabase,
    private readonly remote: GuestImportRemote,
    private readonly powerSync: PowerSyncImportDatabase,
    options: GuestImportServiceOptions = {},
  ) {
    this.createUuid = options.createUuid ?? Crypto.randomUUID;
    this.now = options.now ?? (() => new Date());
    this.verifyTimeoutMs = options.verifyTimeoutMs ?? VERIFY_TIMEOUT_MS;
    this.verifyPollMs = options.verifyPollMs ?? VERIFY_POLL_MS;
  }

  async getViewModel(accountId: string, signal?: AbortSignal): Promise<GuestImportViewModel> {
    const [storedRecord, snapshot] = await Promise.all([
      getGuestImportRecord(this.database, accountId),
      loadGuestImportSnapshot(this.database),
    ]);
    if (!storedRecord) {
      const planned = importableSnapshot(snapshot);
      return {
        phase: 'ready',
        totals: countsFor(planned),
        uploaded: emptyGuestImportCounts,
        conflicts: [],
        message: countsFor(planned).words === 0 && countsFor(planned).events === 0
          && countsFor(planned).collections === 0
          ? 'There is no device vocabulary to import.'
          : null,
      };
    }

    let record = storedRecord;
    const conflicts = record.state === 'needs_conflicts'
      ? await this.reconcileConflicts(accountId, snapshot, signal)
      : [];
    if (record.state === 'needs_conflicts' && conflicts.every((conflict) => conflict.resolution !== null)) {
      record = {
        ...record, state: 'prepared', errorCode: null, errorMessage: null, updatedAt: this.now().toISOString(),
      };
      await saveGuestImportRecord(this.database, record);
    }
    return viewModelFor(record, conflicts);
  }

  prepare(accountId: string): Promise<GuestImportViewModel> {
    return this.startActive((signal) => this.prepareImport(accountId, signal));
  }

  private async prepareImport(accountId: string, signal: AbortSignal): Promise<GuestImportViewModel> {
    const existing = await getGuestImportRecord(this.database, accountId);
    if (existing) return this.getViewModel(accountId);

    const snapshot = importableSnapshot(await loadGuestImportSnapshot(this.database));
    const totals = countsFor(snapshot);
    if (totals.collections === 0 && totals.words === 0 && totals.events === 0) {
      return {
        phase: 'ready', totals, uploaded: emptyGuestImportCounts, conflicts: [],
        message: 'There is no device vocabulary to import.',
      };
    }

    throwIfAborted(signal);
    const createdAt = this.now().toISOString();
    const mappings: GuestImportMapping[] = [
      ...snapshot.collections.map((collection) => mappingFor(accountId, 'collection', collection.id, this.createUuid(), createdAt, false)),
      ...snapshot.words.map((word) => (
        mappingFor(accountId, 'word', word.id, this.createUuid(), createdAt, false)
      )),
      ...snapshot.events.map((event) => mappingFor(accountId, 'learning_event', String(event.id), this.createUuid(), createdAt, false)),
    ];
    const record: GuestImportRecord = {
      accountId,
      state: 'prepared',
      totals,
      uploaded: { ...emptyGuestImportCounts },
      errorCode: null,
      errorMessage: null,
      startedAt: createdAt,
      updatedAt: createdAt,
      completedAt: null,
    };
    await createGuestImportPlan(this.database, record, mappings);
    return this.getViewModel(accountId, signal);
  }

  resolveConflict(
    accountId: string,
    localWordId: string,
    resolution: GuestImportConflictResolution,
  ) {
    return this.startActive(async (signal) => {
      await saveGuestImportConflict(this.database, accountId, localWordId, resolution);
      throwIfAborted(signal);
      return this.getViewModel(accountId, signal);
    });
  }

  run(accountId: string, onProgress?: (view: GuestImportViewModel) => void) {
    return this.startActive((signal) => this.runImport(accountId, signal, onProgress));
  }

  async cancelAndWait() {
    this.activeController?.abort();
    try {
      await this.activeTask;
    } catch (error) {
      if (!(error instanceof GuestImportCancelledError)) throw error;
    }
  }

  private startActive(operation: (signal: AbortSignal) => Promise<GuestImportViewModel>) {
    if (this.activeTask) return this.activeTask;
    const controller = new AbortController();
    this.activeController = controller;
    const task = operation(controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) throw new GuestImportCancelledError();
        throw error;
      })
      .finally(() => {
        if (this.activeTask === task) this.activeTask = null;
        if (this.activeController === controller) this.activeController = null;
      });
    this.activeTask = task;
    return task;
  }

  private async runImport(
    accountId: string,
    signal: AbortSignal,
    onProgress?: (view: GuestImportViewModel) => void,
  ): Promise<GuestImportViewModel> {
    let record = await requiredRecord(this.database, accountId);
    if (record.state === 'completed') return viewModelFor(record, []);

    try {
      const currentSnapshot = await loadGuestImportSnapshot(this.database);
      const currentConflicts = await this.reconcileConflicts(accountId, currentSnapshot, signal);
      if (currentConflicts.some((conflict) => conflict.resolution === null)) {
        record = {
          ...record, state: 'needs_conflicts', errorCode: null, errorMessage: null, updatedAt: this.now().toISOString(),
        };
        await saveGuestImportRecord(this.database, record);
        return viewModelFor(record, currentConflicts);
      }

      record = await this.saveState(record, 'uploading');
      onProgress?.(viewModelFor(record, []));
      const snapshot = currentSnapshot;
      const mappings = await listGuestImportMappings(this.database, accountId);
      const mappingsByType = groupMappings(mappings);

      record = await this.uploadCollections(accountId, record, snapshot, mappingsByType.collection, signal, onProgress);
      record = await this.uploadWords(accountId, record, snapshot, mappingsByType.word, signal, onProgress);
      record = await this.uploadEvents(accountId, record, snapshot, mappingsByType, signal, onProgress);

      record = await this.saveState(record, 'verifying');
      onProgress?.(viewModelFor(record, []));
      await this.verify(mappingsByType, snapshot, signal);
      const completedAt = this.now().toISOString();
      record = {
        ...record,
        state: 'completed',
        uploaded: { ...record.totals },
        errorCode: null,
        errorMessage: null,
        updatedAt: completedAt,
        completedAt,
      };
      await saveGuestImportRecord(this.database, record);
      return viewModelFor(record, []);
    } catch (error) {
      if (signal.aborted || error instanceof GuestImportCancelledError) throw new GuestImportCancelledError();
      const failed = safeFailure(error);
      const current = await requiredRecord(this.database, accountId);
      const next: GuestImportRecord = {
        ...current,
        state: failed.code === 'verification_timeout' ? 'verifying' : 'error',
        errorCode: failed.code,
        errorMessage: failed.message,
        updatedAt: this.now().toISOString(),
      };
      await saveGuestImportRecord(this.database, next);
      return viewModelFor(next, []);
    }
  }

  private async uploadCollections(
    accountId: string,
    record: GuestImportRecord,
    snapshot: GuestImportSnapshot,
    mappings: GuestImportMapping[],
    signal: AbortSignal,
    onProgress?: (view: GuestImportViewModel) => void,
  ) {
    const rows = new Map(snapshot.collections.map((row) => [row.id, row]));
    let next = record;
    for (let offset = record.uploaded.collections; offset < mappings.length; offset += BATCH_SIZE) {
      throwIfAborted(signal);
      const batch = mappings.slice(offset, offset + BATCH_SIZE);
      const accepted = batch.map((mapping) => {
        const row = requiredRow(rows, mapping.localId, 'collection');
        return { mapping, row };
      });
      await this.remote.upsertCollections(accepted.map(({ mapping, row }) => collectionPayload(accountId, mapping, row)), signal);
      await markGuestImportMappingsAccepted(this.database, accountId, 'collection', accepted.map(({ mapping, row }) => ({
        localId: mapping.localId, sourceUpdatedAt: row.updated_at,
      })));
      next = await this.saveProgress(next, 'collections', Math.min(offset + batch.length, mappings.length));
      onProgress?.(viewModelFor(next, []));
    }
    return next;
  }

  private async uploadWords(
    accountId: string,
    record: GuestImportRecord,
    snapshot: GuestImportSnapshot,
    mappings: GuestImportMapping[],
    signal: AbortSignal,
    onProgress?: (view: GuestImportViewModel) => void,
  ) {
    const rows = new Map(snapshot.words.map((row) => [row.id, row]));
    const collectionIds = new Map((await listGuestImportMappings(this.database, accountId))
      .filter((mapping) => mapping.entityType === 'collection')
      .map((mapping) => [mapping.localId, mapping.remoteId]));
    let next = record;
    for (let offset = record.uploaded.words; offset < mappings.length; offset += BATCH_SIZE) {
      throwIfAborted(signal);
      const batch = mappings.slice(offset, offset + BATCH_SIZE);
      const normalRows: RemoteImportRow[] = [];
      const accepted: { localId: string; sourceUpdatedAt: string }[] = [];
      for (const mapping of batch) {
        const row = requiredRow(rows, mapping.localId, 'word');
        const collectionId = collectionIds.get(row.collection_id);
        if (!collectionId) throw new Error('An imported word has no collection mapping.');
        if (mapping.conflictResolution === 'keep_account') continue;
        if (mapping.conflictResolution === 'use_device') {
          await this.remote.updateWord(mapping.remoteId, accountId, wordUpdatePayload(collectionId, row), signal);
        } else {
          normalRows.push(wordPayload(accountId, mapping, collectionId, row));
        }
        accepted.push({ localId: mapping.localId, sourceUpdatedAt: row.updated_at });
      }
      await this.remote.upsertWords(normalRows, signal);
      await markGuestImportMappingsAccepted(this.database, accountId, 'word', accepted);
      next = await this.saveProgress(next, 'words', Math.min(offset + batch.length, mappings.length));
      onProgress?.(viewModelFor(next, []));
    }
    return next;
  }

  private async uploadEvents(
    accountId: string,
    record: GuestImportRecord,
    snapshot: GuestImportSnapshot,
    mappingsByType: ReturnType<typeof groupMappings>,
    signal: AbortSignal,
    onProgress?: (view: GuestImportViewModel) => void,
  ) {
    const rows = new Map(snapshot.events.map((row) => [String(row.id), row]));
    const wordMappings = new Map(mappingsByType.word.map((mapping) => [mapping.localId, mapping]));
    let next = record;
    for (let offset = record.uploaded.events; offset < mappingsByType.learning_event.length; offset += BATCH_SIZE) {
      throwIfAborted(signal);
      const batch = mappingsByType.learning_event.slice(offset, offset + BATCH_SIZE);
      const payloads: RemoteImportRow[] = [];
      const accepted: { localId: string; sourceUpdatedAt: string }[] = [];
      for (const mapping of batch) {
        const row = requiredRow(rows, mapping.localId, 'learning event');
        const wordMapping = row.word_id ? wordMappings.get(row.word_id) : null;
        if (row.word_id && !wordMapping) throw new Error('An imported learning event has no word mapping.');
        if (wordMapping?.conflictResolution === 'keep_account') continue;
        payloads.push(eventPayload(accountId, mapping, wordMapping?.remoteId ?? null, row));
        accepted.push({ localId: mapping.localId, sourceUpdatedAt: row.occurred_at });
      }
      await this.remote.insertEvents(payloads, signal);
      await markGuestImportMappingsAccepted(this.database, accountId, 'learning_event', accepted);
      next = await this.saveProgress(next, 'events', Math.min(offset + batch.length, mappingsByType.learning_event.length));
      onProgress?.(viewModelFor(next, []));
    }
    return next;
  }

  private async verify(
    mappings: ReturnType<typeof groupMappings>,
    snapshot: GuestImportSnapshot,
    signal: AbortSignal,
  ) {
    const wordMappings = new Map(mappings.word.map((mapping) => [mapping.localId, mapping]));
    const eventRows = new Map(snapshot.events.map((event) => [String(event.id), event]));
    const expected = {
      collections: mappings.collection.map((mapping) => mapping.remoteId),
      words: mappings.word.map((mapping) => mapping.remoteId),
      learning_events: mappings.learning_event.filter((mapping) => {
        const event = eventRows.get(mapping.localId);
        const word = event?.word_id ? wordMappings.get(event.word_id) : null;
        return word?.conflictResolution !== 'keep_account';
      }).map((mapping) => mapping.remoteId),
    };
    const deadline = Date.now() + this.verifyTimeoutMs;
    do {
      throwIfAborted(signal);
      const verified = await Promise.all([
        hasEveryId(this.powerSync, 'collections', expected.collections),
        hasEveryId(this.powerSync, 'words', expected.words),
        hasEveryId(this.powerSync, 'learning_events', expected.learning_events),
      ]);
      if (verified.every(Boolean)) return;
      await abortableDelay(this.verifyPollMs, signal);
    } while (Date.now() < deadline);
    throw new Error('PowerSync verification timed out. Retry when synchronization is connected.');
  }

  private async reconcileConflicts(
    accountId: string,
    snapshot: GuestImportSnapshot,
    signal?: AbortSignal,
  ): Promise<GuestImportConflict[]> {
    const mappings = await listGuestImportMappings(this.database, accountId);
    const legacyConflictMappings = mappings.filter((mapping) => (
      mapping.entityType === 'word' && mapping.sourceUpdatedAt === null && mapping.hasConflict
    ));
    if (legacyConflictMappings.length === 0) return [];
    const remoteWords = await this.remote.listActiveWords(signal);
    const words = new Map(snapshot.words.map((word) => [word.id, word]));
    const remoteById = new Map(remoteWords.map((word) => [word.id, word]));
    const conflicts: GuestImportConflict[] = [];
    for (const storedMapping of legacyConflictMappings) {
      const localWord = words.get(storedMapping.localId);
      if (!localWord) continue;
      const accountWord = remoteById.get(storedMapping.remoteId);
      let mapping = storedMapping;
      if (!accountWord) {
        const remoteId = this.createUuid();
        await reassignGuestImportWordMapping(this.database, accountId, mapping.localId, remoteId, false);
        mapping = { ...mapping, remoteId, hasConflict: false, conflictResolution: null };
      }
      if (!accountWord || !mapping.hasConflict) continue;
      conflicts.push({
        localId: localWord.id,
        remoteId: accountWord.id,
        term: localWord.term,
        localDefinition: localWord.definition,
        accountDefinition: accountWord.definition,
        resolution: mapping.conflictResolution,
      });
    }
    return conflicts;
  }

  private async saveState(record: GuestImportRecord, state: GuestImportRecord['state']) {
    const next = {
      ...record, state, errorCode: null, errorMessage: null, updatedAt: this.now().toISOString(),
    };
    await saveGuestImportRecord(this.database, next);
    return next;
  }

  private async saveProgress(
    record: GuestImportRecord,
    key: keyof GuestImportRecord['uploaded'],
    value: number,
  ) {
    const next = {
      ...record,
      uploaded: { ...record.uploaded, [key]: value },
      updatedAt: this.now().toISOString(),
    };
    await saveGuestImportRecord(this.database, next);
    return next;
  }
}

export function importableSnapshot(snapshot: GuestImportSnapshot): GuestImportSnapshot {
  const usedCollections = new Set(snapshot.words.map((word) => word.collection_id));
  return {
    ...snapshot,
    collections: snapshot.collections.filter((collection) => collection.id !== 'my-words' || usedCollections.has(collection.id)),
  };
}

function countsFor(snapshot: GuestImportSnapshot) {
  return {
    collections: snapshot.collections.length,
    words: snapshot.words.length,
    events: snapshot.events.length,
  };
}

function mappingFor(
  accountId: string,
  entityType: GuestImportEntityType,
  localId: string,
  remoteId: string,
  createdAt: string,
  hasConflict: boolean,
): GuestImportMapping {
  return {
    accountId, entityType, localId, remoteId,
    hasConflict, conflictResolution: null, sourceUpdatedAt: null, createdAt,
  };
}

function groupMappings(mappings: GuestImportMapping[]) {
  return {
    collection: mappings.filter((mapping) => mapping.entityType === 'collection'),
    word: mappings.filter((mapping) => mapping.entityType === 'word'),
    learning_event: mappings.filter((mapping) => mapping.entityType === 'learning_event'),
  };
}

async function requiredRecord(database: SQLiteDatabase, accountId: string) {
  const record = await getGuestImportRecord(database, accountId);
  if (!record) throw new Error('Confirm the device import before continuing.');
  return record;
}

function requiredRow<T>(rows: Map<string, T>, id: string, entity: string) {
  const row = rows.get(id);
  if (!row) throw new Error(`The planned ${entity} is no longer available on this device.`);
  return row;
}

export function collectionPayload(accountId: string, mapping: GuestImportMapping, row: GuestCollectionRow): RemoteImportRow {
  return {
    id: mapping.remoteId, user_id: accountId, name: row.name, color: row.color,
    created_at: row.created_at, updated_at: row.updated_at, deleted_at: null,
  };
}

function mutableWordPayload(collectionId: string, row: GuestWordRow): RemoteImportRow {
  return {
    collection_id: collectionId,
    term: row.term,
    normalized_term: row.normalized_term,
    source_language_code: row.source_language_code,
    target_language_code: row.target_language_code,
    source_pronunciation_locale: row.source_pronunciation_locale,
    target_pronunciation_locale: row.target_pronunciation_locale,
    part_of_speech: row.part_of_speech,
    definition: row.definition,
    example: row.example,
    translation: row.translation,
    catalog_sense_id: row.catalog_sense_id,
    cefr_level: row.cefr_level,
    source: row.source,
    state: row.state,
    understood_streak: row.understood_streak,
    lapse_count: row.lapse_count,
    view_count: row.view_count,
    last_viewed_at: row.last_viewed_at,
    last_rated_at: row.last_rated_at,
    next_review_at: row.next_review_at,
    deleted_at: null,
  };
}

export function wordPayload(
  accountId: string,
  mapping: GuestImportMapping,
  collectionId: string,
  row: GuestWordRow,
): RemoteImportRow {
  return {
    id: mapping.remoteId,
    user_id: accountId,
    ...mutableWordPayload(collectionId, row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function wordUpdatePayload(collectionId: string, row: GuestWordRow): RemoteImportRow {
  return mutableWordPayload(collectionId, row);
}

export function eventPayload(
  accountId: string,
  mapping: GuestImportMapping,
  wordId: string | null,
  row: GuestLearningEventRow,
): RemoteImportRow {
  return {
    id: mapping.remoteId,
    user_id: accountId,
    word_id: wordId,
    type: row.type,
    value: row.value,
    occurred_at: row.occurred_at,
  };
}

async function hasEveryId(database: PowerSyncImportDatabase, table: string, ids: string[]) {
  if (ids.length === 0) return true;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(', ');
    const rows = await database.getAll<{ id: string }>(
      `SELECT id FROM ${table} WHERE id IN (${placeholders})`, batch,
    );
    if (new Set(rows.map((row) => row.id)).size !== batch.length) return false;
  }
  return true;
}

function viewModelFor(record: GuestImportRecord, conflicts: GuestImportConflict[]): GuestImportViewModel {
  return {
    phase: record.state,
    totals: record.totals,
    uploaded: record.uploaded,
    conflicts,
    message: record.errorMessage,
  };
}

function safeFailure(error: unknown) {
  if (error instanceof GuestImportRemoteError) {
    if (error.code === 'PGRST301' || error.code === '401') {
      return { code: 'auth_required', message: 'Import paused. Sign in again, then retry.' };
    }
    return { code: error.code, message: 'The account rejected part of the import. Review the data and retry.' };
  }
  if (error instanceof TypeError) {
    return { code: 'network_unavailable', message: 'Import paused because the network is unavailable. Retry when online.' };
  }
  if (error instanceof Error && error.message.includes('timed out')) {
    return { code: 'verification_timeout', message: error.message };
  }
  return { code: 'import_failed', message: error instanceof Error ? error.message : 'Import could not be completed.' };
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new GuestImportCancelledError();
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new GuestImportCancelledError());
    }, { once: true });
  });
}
