import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  acknowledgeCutoverRename,
  appendSyncIdMappings,
  getSyncCutoverRecord,
  saveSyncCutoverRecord,
} from './cutover-repository';
import type { SyncCutoverConflict, SyncCutoverRecord, SyncCutoverViewModel } from './cutover-types';
import {
  getGuestImportRecord,
  listGuestImportMappings,
  loadGuestImportSnapshot,
  markGuestImportMappingsAccepted,
  reassignGuestImportWordMapping,
  saveGuestImportConflict,
  type GuestImportSnapshot,
} from './guest-import-repository';
import { GuestImportRemoteError, type GuestImportRemote, type RemoteImportWord } from './guest-import-remote';
import {
  collectionPayload,
  eventPayload,
  importableSnapshot,
  wordPayload,
  wordUpdatePayload,
} from './guest-import';
import type { GuestImportConflictResolution, GuestImportEntityType, GuestImportMapping } from './guest-import-types';
import { emptyGuestImportCounts } from './guest-import-types';

const BATCH_SIZE = 100;
const VERIFY_TIMEOUT_MS = 30_000;
const VERIFY_POLL_MS = 500;
const DELETED_SOURCE = '__deleted__';

interface PowerSyncCutoverDatabase {
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
}

interface SyncCutoverServiceOptions {
  createUuid?: () => string;
  now?: () => Date;
  verifyTimeoutMs?: number;
  verifyPollMs?: number;
}

interface DeltaPlan {
  snapshot: GuestImportSnapshot;
  mappings: GuestImportMapping[];
  collections: GuestImportMapping[];
  words: GuestImportMapping[];
  events: GuestImportMapping[];
  deletedWords: GuestImportMapping[];
  conflicts: SyncCutoverConflict[];
}

export class SyncCutoverCancelledError extends Error {}

export class SyncCutoverService {
  private activeController: AbortController | null = null;
  private activeTask: Promise<SyncCutoverViewModel> | null = null;
  private readonly createUuid: () => string;
  private readonly now: () => Date;
  private readonly verifyTimeoutMs: number;
  private readonly verifyPollMs: number;

  constructor(
    private readonly database: SQLiteDatabase,
    private readonly remote: GuestImportRemote,
    private readonly powerSync: PowerSyncCutoverDatabase,
    options: SyncCutoverServiceOptions = {},
  ) {
    this.createUuid = options.createUuid ?? Crypto.randomUUID;
    this.now = options.now ?? (() => new Date());
    this.verifyTimeoutMs = options.verifyTimeoutMs ?? VERIFY_TIMEOUT_MS;
    this.verifyPollMs = options.verifyPollMs ?? VERIFY_POLL_MS;
  }

  async getViewModel(accountId: string, signal?: AbortSignal): Promise<SyncCutoverViewModel> {
    const [record, importRecord, rawSnapshot, mappings] = await Promise.all([
      getSyncCutoverRecord(this.database, accountId),
      getGuestImportRecord(this.database, accountId),
      loadGuestImportSnapshot(this.database),
      listGuestImportMappings(this.database, accountId),
    ]);
    const snapshot = importableSnapshot(rawSnapshot);
    if (!importRecord && isEmpty(snapshot)) {
      return record ? viewModelFor(record, []) : checkingView();
    }
    if (importRecord?.state !== 'completed') return waitingImportView(snapshot);
    if (record?.state === 'ready' && !hasLocalDelta(snapshot, mappings)) return viewModelFor(record, []);
    if (record?.state === 'needs_conflicts') {
      const plan = await this.buildPlan(accountId, snapshot, signal);
      return viewModelFor(record, plan.conflicts);
    }
    return record ? { ...viewModelFor(record, []), phase: 'checking' } : checkingView();
  }

  run(accountId: string, onProgress?: (view: SyncCutoverViewModel) => void) {
    return this.startActive((signal) => this.runCutover(accountId, signal, onProgress));
  }

  resolveConflict(accountId: string, localWordId: string, resolution: GuestImportConflictResolution) {
    return this.startActive(async (signal) => {
      await saveGuestImportConflict(this.database, accountId, localWordId, resolution);
      throwIfAborted(signal);
      return this.runCutover(accountId, signal);
    });
  }

  keepAccountRename(accountId: string, localWordId: string) {
    return this.startActive(async (signal) => {
      const snapshot = await loadGuestImportSnapshot(this.database);
      const word = snapshot.words.find((item) => item.id === localWordId);
      if (!word) throw new Error('The changed device word is no longer available.');
      await acknowledgeCutoverRename(this.database, accountId, localWordId, word.updated_at);
      throwIfAborted(signal);
      return this.runCutover(accountId, signal);
    });
  }

  async cancelAndWait() {
    this.activeController?.abort();
    try {
      await this.activeTask;
    } catch (error) {
      if (!(error instanceof SyncCutoverCancelledError)) throw error;
    }
  }

  private startActive(operation: (signal: AbortSignal) => Promise<SyncCutoverViewModel>) {
    if (this.activeTask) return this.activeTask;
    const controller = new AbortController();
    this.activeController = controller;
    const task = operation(controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) throw new SyncCutoverCancelledError();
        throw error;
      })
      .finally(() => {
        if (this.activeTask === task) this.activeTask = null;
        if (this.activeController === controller) this.activeController = null;
      });
    this.activeTask = task;
    return task;
  }

  private async runCutover(
    accountId: string,
    signal: AbortSignal,
    onProgress?: (view: SyncCutoverViewModel) => void,
  ): Promise<SyncCutoverViewModel> {
    const rawSnapshot = await loadGuestImportSnapshot(this.database);
    const snapshot = importableSnapshot(rawSnapshot);
    const importRecord = await getGuestImportRecord(this.database, accountId);
    if (!importRecord && !isEmpty(snapshot)) return waitingImportView(snapshot);
    if (importRecord && importRecord.state !== 'completed') return waitingImportView(snapshot);

    let record = await this.saveState(accountId, 'checking', emptyGuestImportCounts);
    onProgress?.(viewModelFor(record, []));
    try {
      const plan = await this.buildPlan(accountId, snapshot, signal);
      const totals = countsForPlan(plan);
      if (plan.conflicts.length > 0) {
        record = await this.saveState(accountId, 'needs_conflicts', totals);
        return viewModelFor(record, plan.conflicts);
      }

      record = await this.saveState(accountId, 'uploading', totals);
      onProgress?.(viewModelFor(record, []));
      record = await this.uploadCollections(accountId, record, plan, signal, onProgress);
      record = await this.uploadWords(accountId, record, plan, signal, onProgress);
      record = await this.uploadEvents(accountId, record, plan, signal, onProgress);

      record = { ...record, state: 'verifying', updatedAt: this.now().toISOString() };
      await saveSyncCutoverRecord(this.database, record);
      onProgress?.(viewModelFor(record, []));
      await this.verify(plan, signal);

      const latest = importableSnapshot(await loadGuestImportSnapshot(this.database));
      const latestMappings = await listGuestImportMappings(this.database, accountId);
      if (hasLocalDelta(latest, latestMappings)) {
        record = await this.saveState(accountId, 'checking', emptyGuestImportCounts);
        return viewModelFor(record, []);
      }

      const readyAt = this.now().toISOString();
      record = {
        ...record, state: 'ready', uploaded: { ...record.totals },
        errorCode: null, errorMessage: null, updatedAt: readyAt, readyAt,
      };
      await saveSyncCutoverRecord(this.database, record);
      return viewModelFor(record, []);
    } catch (error) {
      if (signal.aborted || error instanceof SyncCutoverCancelledError) throw new SyncCutoverCancelledError();
      const failed = safeFailure(error);
      const current = await getSyncCutoverRecord(this.database, accountId) ?? record;
      const next: SyncCutoverRecord = {
        ...current,
        state: failed.code === 'verification_timeout' ? 'verifying' : 'error',
        errorCode: failed.code,
        errorMessage: failed.message,
        updatedAt: this.now().toISOString(),
      };
      await saveSyncCutoverRecord(this.database, next);
      return viewModelFor(next, []);
    }
  }

  private async buildPlan(accountId: string, snapshot: GuestImportSnapshot, signal?: AbortSignal): Promise<DeltaPlan> {
    const [storedMappings, remoteWords] = await Promise.all([
      listGuestImportMappings(this.database, accountId),
      this.remote.listActiveWords(signal),
    ]);
    throwIfAborted(signal);
    const createdAt = this.now().toISOString();
    const existingKeys = new Set(storedMappings.map((mapping) => `${mapping.entityType}:${mapping.localId}`));
    const remoteByNormalized = new Map(remoteWords.map((word) => [word.normalizedTerm, word]));
    const newMappings: GuestImportMapping[] = [
      ...snapshot.collections.filter((row) => !existingKeys.has(`collection:${row.id}`))
        .map((row) => mappingFor(accountId, 'collection', row.id, this.createUuid(), createdAt, false)),
      ...snapshot.words.filter((row) => !existingKeys.has(`word:${row.id}`)).map((row) => {
        const conflict = remoteByNormalized.get(row.normalized_term);
        return mappingFor(accountId, 'word', row.id, conflict?.id ?? this.createUuid(), createdAt, Boolean(conflict));
      }),
      ...snapshot.events.filter((row) => !existingKeys.has(`learning_event:${row.id}`))
        .map((row) => mappingFor(accountId, 'learning_event', String(row.id), this.createUuid(), createdAt, false)),
    ];
    await appendSyncIdMappings(this.database, newMappings);
    let mappings = await listGuestImportMappings(this.database, accountId);

    for (const mapping of mappings) {
      if (mapping.entityType !== 'word' || mapping.sourceUpdatedAt !== null || !mapping.hasConflict) continue;
      const localWord = snapshot.words.find((word) => word.id === mapping.localId);
      if (!localWord) continue;
      const accountWord = remoteByNormalized.get(localWord.normalized_term);
      if (!accountWord) {
        await reassignGuestImportWordMapping(this.database, accountId, mapping.localId, this.createUuid(), false);
      } else if (accountWord.id !== mapping.remoteId) {
        await reassignGuestImportWordMapping(this.database, accountId, mapping.localId, accountWord.id, true);
      }
    }
    mappings = await listGuestImportMappings(this.database, accountId);
    return planFor(snapshot, mappings, remoteWords);
  }

  private async uploadCollections(
    accountId: string,
    record: SyncCutoverRecord,
    plan: DeltaPlan,
    signal: AbortSignal,
    onProgress?: (view: SyncCutoverViewModel) => void,
  ) {
    const rows = new Map(plan.snapshot.collections.map((row) => [row.id, row]));
    let next = record;
    for (let offset = 0; offset < plan.collections.length; offset += BATCH_SIZE) {
      throwIfAborted(signal);
      const batch = plan.collections.slice(offset, offset + BATCH_SIZE);
      await this.remote.upsertCollections(batch.map((mapping) => (
        collectionPayload(accountId, mapping, requiredRow(rows, mapping.localId, 'collection'))
      )), signal);
      await markGuestImportMappingsAccepted(this.database, accountId, 'collection', batch.map((mapping) => ({
        localId: mapping.localId, sourceUpdatedAt: requiredRow(rows, mapping.localId, 'collection').updated_at,
      })));
      next = await this.saveProgress(next, 'collections', Math.min(offset + batch.length, plan.collections.length));
      onProgress?.(viewModelFor(next, []));
    }
    return next;
  }

  private async uploadWords(
    accountId: string,
    record: SyncCutoverRecord,
    plan: DeltaPlan,
    signal: AbortSignal,
    onProgress?: (view: SyncCutoverViewModel) => void,
  ) {
    const rows = new Map(plan.snapshot.words.map((row) => [row.id, row]));
    const collectionIds = new Map(plan.mappings.filter((mapping) => mapping.entityType === 'collection')
      .map((mapping) => [mapping.localId, mapping.remoteId]));
    let completed = 0;
    let next = record;
    for (let offset = 0; offset < plan.words.length; offset += BATCH_SIZE) {
      throwIfAborted(signal);
      const batch = plan.words.slice(offset, offset + BATCH_SIZE);
      const upserts = [];
      const accepted: { localId: string; sourceUpdatedAt: string }[] = [];
      for (const mapping of batch) {
        const row = requiredRow(rows, mapping.localId, 'word');
        const collectionId = collectionIds.get(row.collection_id);
        if (!collectionId) throw new Error('A changed device word has no collection mapping.');
        if (mapping.conflictResolution === 'use_device') {
          await this.remote.updateWord(mapping.remoteId, accountId, wordUpdatePayload(collectionId, row), signal);
        } else {
          upserts.push(wordPayload(accountId, mapping, collectionId, row));
        }
        accepted.push({ localId: mapping.localId, sourceUpdatedAt: row.updated_at });
      }
      await this.remote.upsertWords(upserts, signal);
      await markGuestImportMappingsAccepted(this.database, accountId, 'word', accepted);
      completed += batch.length;
      next = await this.saveProgress(next, 'words', completed);
      onProgress?.(viewModelFor(next, []));
    }
    for (const mapping of plan.deletedWords) {
      throwIfAborted(signal);
      await this.remote.tombstoneWord(mapping.remoteId, signal);
      await markGuestImportMappingsAccepted(this.database, accountId, 'word', [{
        localId: mapping.localId, sourceUpdatedAt: DELETED_SOURCE,
      }]);
      completed += 1;
      next = await this.saveProgress(next, 'words', completed);
      onProgress?.(viewModelFor(next, []));
    }
    return next;
  }

  private async uploadEvents(
    accountId: string,
    record: SyncCutoverRecord,
    plan: DeltaPlan,
    signal: AbortSignal,
    onProgress?: (view: SyncCutoverViewModel) => void,
  ) {
    const rows = new Map(plan.snapshot.events.map((row) => [String(row.id), row]));
    const wordIds = new Map(plan.mappings.filter((mapping) => mapping.entityType === 'word')
      .map((mapping) => [mapping.localId, mapping.remoteId]));
    let next = record;
    for (let offset = 0; offset < plan.events.length; offset += BATCH_SIZE) {
      throwIfAborted(signal);
      const batch = plan.events.slice(offset, offset + BATCH_SIZE);
      await this.remote.insertEvents(batch.map((mapping) => {
        const row = requiredRow(rows, mapping.localId, 'learning event');
        return eventPayload(accountId, mapping, row.word_id ? wordIds.get(row.word_id) ?? null : null, row);
      }), signal);
      await markGuestImportMappingsAccepted(this.database, accountId, 'learning_event', batch.map((mapping) => ({
        localId: mapping.localId,
        sourceUpdatedAt: requiredRow(rows, mapping.localId, 'learning event').occurred_at,
      })));
      next = await this.saveProgress(next, 'events', Math.min(offset + batch.length, plan.events.length));
      onProgress?.(viewModelFor(next, []));
    }
    return next;
  }

  private async verify(plan: DeltaPlan, signal: AbortSignal) {
    const rows = {
      collections: new Set(plan.snapshot.collections.map((row) => row.id)),
      words: new Set(plan.snapshot.words.map((row) => row.id)),
      events: new Map(plan.snapshot.events.map((row) => [String(row.id), row])),
    };
    const wordMappings = new Map(plan.mappings.filter((mapping) => mapping.entityType === 'word')
      .map((mapping) => [mapping.localId, mapping]));
    const expected = {
      collections: plan.mappings.filter((mapping) => mapping.entityType === 'collection' && rows.collections.has(mapping.localId))
        .map((mapping) => mapping.remoteId),
      words: plan.mappings.filter((mapping) => mapping.entityType === 'word' && rows.words.has(mapping.localId))
        .map((mapping) => mapping.remoteId),
      learning_events: plan.mappings.filter((mapping) => {
        if (mapping.entityType !== 'learning_event') return false;
        const event = rows.events.get(mapping.localId);
        const word = event?.word_id ? wordMappings.get(event.word_id) : null;
        return Boolean(event) && word?.conflictResolution !== 'keep_account';
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
    throw new Error('PowerSync cutover verification timed out. Retry when synchronization is connected.');
  }

  private async saveState(
    accountId: string,
    state: SyncCutoverRecord['state'],
    totals: SyncCutoverRecord['totals'],
  ) {
    const previous = await getSyncCutoverRecord(this.database, accountId);
    const updatedAt = this.now().toISOString();
    const next: SyncCutoverRecord = {
      accountId, state, totals, uploaded: { ...emptyGuestImportCounts },
      errorCode: null, errorMessage: null,
      startedAt: previous?.startedAt ?? updatedAt,
      updatedAt, readyAt: state === 'ready' ? updatedAt : null,
    };
    await saveSyncCutoverRecord(this.database, next);
    return next;
  }

  private async saveProgress(
    record: SyncCutoverRecord,
    key: keyof SyncCutoverRecord['uploaded'],
    value: number,
  ) {
    const next = {
      ...record,
      uploaded: { ...record.uploaded, [key]: value },
      updatedAt: this.now().toISOString(),
    };
    await saveSyncCutoverRecord(this.database, next);
    return next;
  }
}

function planFor(
  snapshot: GuestImportSnapshot,
  mappings: GuestImportMapping[],
  remoteWords: RemoteImportWord[],
): DeltaPlan {
  const collections = new Map(snapshot.collections.map((row) => [row.id, row]));
  const words = new Map(snapshot.words.map((row) => [row.id, row]));
  const events = new Map(snapshot.events.map((row) => [String(row.id), row]));
  const remoteByNormalized = new Map(remoteWords.map((word) => [word.normalizedTerm, word]));
  const wordMappings = new Map(mappings.filter((mapping) => mapping.entityType === 'word')
    .map((mapping) => [mapping.localId, mapping]));
  const conflicts: SyncCutoverConflict[] = [];

  for (const mapping of wordMappings.values()) {
    const localWord = words.get(mapping.localId);
    if (!localWord || mapping.conflictResolution === 'keep_account') continue;
    const accountWord = remoteByNormalized.get(localWord.normalized_term);
    if (mapping.sourceUpdatedAt === null && mapping.hasConflict && mapping.conflictResolution === null && accountWord) {
      conflicts.push({
        kind: 'new_word', localId: localWord.id, remoteId: accountWord.id, term: localWord.term,
        localDefinition: localWord.definition, accountDefinition: accountWord.definition, resolution: null,
      });
    } else if (mapping.sourceUpdatedAt !== null && accountWord && accountWord.id !== mapping.remoteId) {
      conflicts.push({
        kind: 'renamed_word', localId: localWord.id, mappedRemoteId: mapping.remoteId,
        conflictingRemoteId: accountWord.id, term: localWord.term,
        localDefinition: localWord.definition, accountDefinition: accountWord.definition,
      });
    }
  }
  const conflictIds = new Set(conflicts.map((conflict) => conflict.localId));
  return {
    snapshot,
    mappings,
    collections: mappings.filter((mapping) => {
      const row = mapping.entityType === 'collection' ? collections.get(mapping.localId) : null;
      return Boolean(row && mapping.sourceUpdatedAt !== row.updated_at);
    }),
    words: mappings.filter((mapping) => {
      if (mapping.entityType !== 'word' || conflictIds.has(mapping.localId)) return false;
      const row = words.get(mapping.localId);
      if (!row || (mapping.sourceUpdatedAt === null && mapping.conflictResolution === 'keep_account')) return false;
      return mapping.sourceUpdatedAt !== row.updated_at;
    }),
    deletedWords: mappings.filter((mapping) => (
      mapping.entityType === 'word'
      && mapping.sourceUpdatedAt !== null
      && mapping.sourceUpdatedAt !== DELETED_SOURCE
      && !words.has(mapping.localId)
      && mapping.conflictResolution !== 'keep_account'
    )),
    events: mappings.filter((mapping) => {
      if (mapping.entityType !== 'learning_event') return false;
      const row = events.get(mapping.localId);
      if (!row || mapping.sourceUpdatedAt === row.occurred_at) return false;
      const word = row.word_id ? wordMappings.get(row.word_id) : null;
      return word?.conflictResolution !== 'keep_account';
    }),
    conflicts,
  };
}

function hasLocalDelta(snapshot: GuestImportSnapshot, mappings: GuestImportMapping[]) {
  const keys = new Set(mappings.map((mapping) => `${mapping.entityType}:${mapping.localId}`));
  if (snapshot.collections.some((row) => !keys.has(`collection:${row.id}`))) return true;
  if (snapshot.words.some((row) => !keys.has(`word:${row.id}`))) return true;
  if (snapshot.events.some((row) => !keys.has(`learning_event:${row.id}`))) return true;
  const counts = countsForPlan(planFor(snapshot, mappings, []));
  return counts.collections > 0 || counts.words > 0 || counts.events > 0;
}

function countsForPlan(plan: DeltaPlan) {
  return {
    collections: plan.collections.length,
    words: plan.words.length + plan.deletedWords.length,
    events: plan.events.length,
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

function isEmpty(snapshot: GuestImportSnapshot) {
  return snapshot.collections.length === 0 && snapshot.words.length === 0 && snapshot.events.length === 0;
}

function checkingView(): SyncCutoverViewModel {
  return {
    phase: 'checking', totals: emptyGuestImportCounts, uploaded: emptyGuestImportCounts,
    conflicts: [], message: null,
  };
}

function waitingImportView(snapshot: GuestImportSnapshot): SyncCutoverViewModel {
  return {
    phase: 'waiting_import',
    totals: {
      collections: snapshot.collections.length,
      words: snapshot.words.length,
      events: snapshot.events.length,
    },
    uploaded: emptyGuestImportCounts,
    conflicts: [],
    message: 'Import this device vocabulary before synchronized mode can start.',
  };
}

function viewModelFor(record: SyncCutoverRecord, conflicts: SyncCutoverConflict[]): SyncCutoverViewModel {
  return {
    phase: record.state,
    totals: record.totals,
    uploaded: record.uploaded,
    conflicts,
    message: record.errorMessage,
  };
}

function requiredRow<T>(rows: Map<string, T>, id: string, entity: string) {
  const row = rows.get(id);
  if (!row) throw new Error(`The changed ${entity} is no longer available on this device.`);
  return row;
}

async function hasEveryId(database: PowerSyncCutoverDatabase, table: string, ids: string[]) {
  if (ids.length === 0) return true;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const rows = await database.getAll<{ id: string }>(
      `SELECT id FROM ${table} WHERE id IN (${batch.map(() => '?').join(', ')})`, batch,
    );
    if (new Set(rows.map((row) => row.id)).size !== batch.length) return false;
  }
  return true;
}

function safeFailure(error: unknown) {
  if (error instanceof GuestImportRemoteError) {
    if (error.code === 'PGRST301' || error.code === '401') {
      return { code: 'auth_required', message: 'Synchronization paused. Sign in again, then retry.' };
    }
    return { code: error.code, message: 'The account rejected part of the synchronization. Review the data and retry.' };
  }
  if (error instanceof TypeError) {
    return { code: 'network_unavailable', message: 'Cutover paused because the network is unavailable. Retry when online.' };
  }
  if (error instanceof Error && error.message.includes('timed out')) {
    return { code: 'verification_timeout', message: error.message };
  }
  return {
    code: 'cutover_failed',
    message: error instanceof Error ? error.message : 'Synchronized mode could not be prepared.',
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new SyncCutoverCancelledError();
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new SyncCutoverCancelledError());
    }, { once: true });
  });
}
