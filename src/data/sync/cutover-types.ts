import type { GuestImportConflict, GuestImportCounts } from './guest-import-types';

export type SyncCutoverPersistentState =
  | 'checking'
  | 'needs_conflicts'
  | 'uploading'
  | 'verifying'
  | 'ready'
  | 'error';

export interface SyncCutoverRecord {
  accountId: string;
  state: SyncCutoverPersistentState;
  totals: GuestImportCounts;
  uploaded: GuestImportCounts;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  updatedAt: string;
  readyAt: string | null;
}

export interface SyncCutoverRenameConflict {
  kind: 'renamed_word';
  localId: string;
  mappedRemoteId: string;
  conflictingRemoteId: string;
  term: string;
  localDefinition: string;
  accountDefinition: string;
}

export type SyncCutoverConflict = (GuestImportConflict & { kind: 'new_word' }) | SyncCutoverRenameConflict;

export type SyncCutoverPhase =
  | 'waiting_import'
  | SyncCutoverPersistentState;

export interface SyncCutoverViewModel {
  phase: SyncCutoverPhase;
  totals: GuestImportCounts;
  uploaded: GuestImportCounts;
  conflicts: SyncCutoverConflict[];
  message: string | null;
}
