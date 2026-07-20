export type GuestImportPersistentState =
  | 'prepared'
  | 'needs_conflicts'
  | 'uploading'
  | 'verifying'
  | 'completed'
  | 'error';

export type GuestImportEntityType = 'collection' | 'word' | 'learning_event';
export type GuestImportConflictResolution = 'keep_account' | 'use_device';

export interface GuestImportCounts {
  collections: number;
  words: number;
  events: number;
}

export interface GuestImportProgress {
  collections: number;
  words: number;
  events: number;
}

export interface GuestImportRecord {
  accountId: string;
  state: GuestImportPersistentState;
  totals: GuestImportCounts;
  uploaded: GuestImportProgress;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
}

export interface GuestImportMapping {
  accountId: string;
  entityType: GuestImportEntityType;
  localId: string;
  remoteId: string;
  hasConflict: boolean;
  conflictResolution: GuestImportConflictResolution | null;
  sourceUpdatedAt: string | null;
  createdAt: string;
}

export interface GuestImportConflict {
  localId: string;
  remoteId: string;
  term: string;
  localDefinition: string;
  accountDefinition: string;
  resolution: GuestImportConflictResolution | null;
}

export type GuestImportPhase =
  | 'unavailable'
  | 'loading'
  | 'ready'
  | 'prepared'
  | 'needs_conflicts'
  | 'uploading'
  | 'verifying'
  | 'completed'
  | 'error';

export interface GuestImportViewModel {
  phase: GuestImportPhase;
  totals: GuestImportCounts;
  uploaded: GuestImportProgress;
  conflicts: GuestImportConflict[];
  message: string | null;
}

export const emptyGuestImportCounts: GuestImportCounts = { collections: 0, words: 0, events: 0 };
